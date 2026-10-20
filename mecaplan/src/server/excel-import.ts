import { transitionActivity } from "@/lib/activity-transitions";
import { normalizeSpreadsheetNamespaces } from "./xlsx-compat";
import ExcelJS from "exceljs";
import yauzl from "yauzl";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import {
  importSheets,
  type ImportIssue,
  type ImportChange,
} from "@/lib/import-format";
import {
  type Project,
  type PublicUser,
  activitySchema,
  today,
} from "@/lib/model";
import {
  budgetItemSchema,
  expenseSchema,
  riskSchema,
  recordSchema,
} from "@/lib/phase-schema";
import {
  normalizeText,
  matchesActivityCode,
  nextActivityCode,
  normalizeProjectCodes,
} from "@/lib/codes";
import {
  control,
  parseMoney,
  validateCompletion,
  validateProjectStructure,
} from "@/lib/control";
import { addWorkingDays } from "@/lib/cpm";
import { can } from "./auth/permissions";
import { oneDriveUrl } from "@/lib/onedrive-link";

export const projectHash = (p: Project) =>
  createHash("sha256").update(JSON.stringify(p)).digest("hex");
export function importAccess(p: Project, u: PublicUser) {
  const m = p.members.find((m) => m.id === u.id);
  return JSON.stringify({
    globalRole: u.globalRole,
    isInstructor: !!u.isInstructor,
    member: m ?? null,
  });
}
export async function validateExcelZip(bytes: Buffer) {
  if (bytes.length > 5 * 1024 * 1024 || bytes[0] !== 80 || bytes[1] !== 75)
    throw Error("Sube un XLSX válido de hasta 5 MB.");
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip)
          return reject(Error("No se pudo leer el archivo XLSX."));
        let ended = false,
          count = 0,
          total = 0;
        const fail = (message: string) => {
          if (ended) return;
          ended = true;
          zip.close();
          reject(Error(message));
        };
        zip.on("error", () => fail("El XLSX está dañado."));
        zip.on("end", () => {
          if (!ended) {
            ended = true;
            resolve();
          }
        });
        zip.on("entry", (entry) => {
          if (
            ++count > 500 ||
            entry.generalPurposeBitFlag & 1 ||
            entry.fileName.includes("vbaProject") ||
            entry.fileName.split("/").includes("..")
          )
            return fail("El XLSX contiene elementos no admitidos.");
          total += entry.uncompressedSize;
          if (total > 32 * 1024 * 1024)
            return fail("El contenido descomprimido del XLSX supera 32 MB.");
          if (entry.fileName.endsWith("/")) return zip.readEntry();
          zip.openReadStream(entry, (e, stream) => {
            if (e || !stream) return fail("No se pudo comprobar el XLSX.");
            let read = 0;
            stream.on("data", (chunk) => {
              read += chunk.length;
              if (read > entry.uncompressedSize || read > 32 * 1024 * 1024) {
                stream.destroy();
                fail("El tamaño del contenido XLSX no es válido.");
              }
            });
            stream.on("error", () => fail("El contenido XLSX no es válido."));
            stream.on("end", () => {
              if (!ended) zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}
function cellValue(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("formula" in v || "sharedFormula" in v)
      throw Error("No se admiten fórmulas. Pega valores en esta celda.");
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("error" in v) throw Error("La celda contiene un error de Excel.");
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("hyperlink" in v) return v.hyperlink;
  }
  return String(v).trim();
}
const split = (v: string) =>
  v
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
function truth(v: string) {
  if (["si", "sí", "true", "1", "x"].includes(v.toLowerCase())) return true;
  if (["no", "false", "0", ""].includes(v.toLowerCase())) return false;
  throw Error("Escribe Sí o No.");
}
const dateValue = (v: string) => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    new Date(v + "T12:00:00Z").toISOString().slice(0, 10) !== v
  )
    throw Error("Usa una fecha de Excel o AAAA-MM-DD.");
  return v;
};

export async function loadImportWorkbook(bytes: Buffer) {
  await validateExcelZip(bytes);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await normalizeSpreadsheetNamespaces(bytes)) as never);
  return wb;
}
export async function previewExcel(
  bytes: Buffer,
  source: Project,
  user: PublicUser,
  mode: "upsert" | "new",
) {
  const workbook = await loadImportWorkbook(bytes);
  const p = normalizeProjectCodes(structuredClone(source)),
    c = control(p);
  p.control = c;
  const errors: ImportIssue[] = [],
    warnings: string[] = [],
    changes: ImportChange[] = [],
    seen = new Set<string>(),
    targetIds = new Set<string>(),
    pendingDeps: {
      id: string;
      refs: string[];
      lags: string;
      sheet: string;
      row: number;
    }[] = [];
  let totalRows = 0;
  const resolve = <T>(
    list: T[],
    query: string,
    label: string,
    values: (v: T) => string[],
  ) => {
    const found = list.filter((v) =>
      values(v).some((s) => normalizeText(s) === normalizeText(query)),
    );
    if (found.length !== 1)
      throw Error(
        `${label} «${query}» ${found.length ? "es ambiguo" : "no existe en el proyecto"}.`,
      );
    return found[0];
  };
  const claim = (kind: string, id: string) => {
    const key = kind + "|" + id;
    if (targetIds.has(key))
      throw Error(
        "Dos filas del archivo modifican el mismo registro. Usa una sola fila por identidad.",
      );
    targetIds.add(key);
  };
  const unique = <T>(rows: T[], label: string) => {
    if (rows.length > 1)
      throw Error(label + " es ambiguo. Revisa códigos, alias y referencias.");
    return rows[0];
  };
  const person = (q: string) =>
    resolve(p.members, q, "La persona", (v) => [v.id, v.name]).id;
  const people = (q: string) => split(q).map(person);
  const team = (q: string) =>
    resolve(p.teams, q, "El equipo", (v) => [v.id, v.name, v.codePrefix ?? ""])
      .id;
  const task = (q: string) =>
    q
      ? resolve(
          p.activities.filter((a) => !a.deletedAt),
          q,
          "La actividad",
          (a) => [a.id, a.code, a.importKey ?? "", ...(a.aliases ?? [])],
        ).id
      : "";
  const assert = (
    value: boolean,
    message = "Tu rol no permite importar estos datos.",
  ) => {
    if (!value) throw Error(message);
  };
  for (const ws of [...workbook.worksheets].sort(
    (a, b) =>
      importSheets.findIndex(
        (s) => normalizeText(s.name) === normalizeText(a.name),
      ) -
      importSheets.findIndex(
        (s) => normalizeText(s.name) === normalizeText(b.name),
      ),
  )) {
    const spec = importSheets.find(
      (s) => normalizeText(s.name) === normalizeText(ws.name),
    );
    if (!spec) {
      if (
        !["guia", "instrucciones", "referencias"].includes(
          normalizeText(ws.name),
        )
      )
        warnings.push(
          `Hoja «${ws.name}» omitida: no forma parte de la plantilla.`,
        );
      continue;
    }
    const headers = new Map<string, number>();
    try {
      ws.getRow(1).eachCell((cell, i) => {
        const name = cellValue(cell);
        if (!spec.headers.some((h) => normalizeText(h) === normalizeText(name)))
          throw Error(
            `Columna desconocida: ${name}. Descarga la plantilla actual.`,
          );
        if (headers.has(normalizeText(name)))
          throw Error("Hay cabeceras repetidas.");
        headers.set(normalizeText(name), i);
      });
    } catch (e) {
      errors.push({
        sheet: ws.name,
        row: 1,
        column: "Cabeceras",
        message: e instanceof Error ? e.message : "Cabeceras no válidas.",
      });
      continue;
    }
    for (let rn = 2; rn <= ws.rowCount; rn++) {
      let rowHasValue = false;
      ws.getRow(rn).eachCell((cell) => {
        if (cell.value !== null && cell.value !== "") rowHasValue = true;
      });
      if (!rowHasValue) continue;
      if (++totalRows > 2000)
        throw Error("Importa como máximo 2000 filas por archivo.");
      let column = "";
      const raw = (name: string) => {
        column = name;
        const i = headers.get(normalizeText(name));
        return i ? cellValue(ws.getRow(rn).getCell(i)) : "";
      };
      const value = (name: string) => {
        const v = raw(name);
        return normalizeText(v) === "[vacio]" ? "" : v;
      };
      const has = (name: string) => raw(name) !== "";
      const required = (name: string) => {
        const v = value(name);
        if (!v) throw Error(`Completa ${name}.`);
        return v;
      };
      let ref = "",
        identity = "";
      try {
        ref =
          value("Referencia") ||
          (spec.key === "activities" ? value("Código") : "");
        if (spec.key !== "activities" && !ref)
          throw Error(
            "Completa Referencia con un código estable, por ejemplo BIT-001.",
          );
        if (ref) {
          identity = spec.key + "|" + normalizeText(ref);
          if (seen.has(identity))
            throw Error("La referencia se repite dentro del archivo.");
          seen.add(identity);
        }
        if (spec.key === "activities") {
          const code = value("Código"),
            reference = value("Referencia"),
            active = p.activities.filter((a) => !a.deletedAt);
          const byCode = code
            ? unique(
                active.filter(
                  (a) => matchesActivityCode(a, code) || a.id === code,
                ),
                "El código",
              )
            : undefined;
          const external = reference
            ? unique(
                active.filter(
                  (a) =>
                    normalizeText(a.importKey ?? "") ===
                    normalizeText(reference),
                ),
                "La referencia",
              )
            : undefined;
          const alternate =
            reference && !external
              ? unique(
                  active.filter(
                    (a) =>
                      matchesActivityCode(a, reference) || a.id === reference,
                  ),
                  "La referencia alternativa",
                )
              : undefined;
          const byReference = external ?? alternate;
          if (code && !byCode)
            throw Error(
              "El código no existe. Para una actividad nueva deja Código vacío.",
            );
          if (byCode && byReference && byCode.id !== byReference.id)
            throw Error(
              "Código y Referencia identifican actividades distintas.",
            );
          const old = byCode ?? byReference;
          if (
            old &&
            reference &&
            old.importKey &&
            reference !== old.importKey &&
            !alternate &&
            !external
          )
            throw Error(
              "Conserva la referencia externa existente. No se cambia al editar por código.",
            );
          if (old) claim(spec.key, old.id);
          if (old && mode === "new")
            throw Error(
              "Esta actividad ya existe. Usa el modo agregar y actualizar.",
            );
          const teamId = has("Equipo")
            ? team(required("Equipo"))
            : (old?.teamId ?? team(required("Equipo")));
          assert(
            can(
              user,
              "activity:edit",
              source,
              old ?? ({ teamId } as Project["activities"][number]),
            ) &&
              can(user, "activity:edit", source, {
                teamId,
              } as Project["activities"][number]),
          );
          if (value("Código") && !old)
            throw Error(
              "Para una actividad nueva deja Código vacío y usa Referencia; la aplicación genera el código por equipo.",
            );
          if (!old && !ref)
            throw Error(
              "Completa Referencia para identificar la actividad y evitar duplicados al reimportar.",
            );
          let a = old
            ? structuredClone(old)
            : activitySchema.parse({
                id: randomUUID(),
                code: nextActivityCode(p, teamId),
                title: required("Título"),
                teamId,
                status: "Pendiente",
                priority: "Media",
                start: today(),
                end: today(),
                duration: 1,
                responsible: [],
                accountable: "",
                unscheduled: true,
              });
          if (has("Título")) a.title = required("Título");
          a.teamId = teamId;
          if (!old?.importKey && has("Referencia")) a.importKey = reference;
          for (const [h, key] of [
            ["Descripción", "description"],
            ["Motivo bloqueo", "blockedReason"],
          ] as const)
            if (has(h)) a[key] = value(h);
          if (has("Estado"))
            a.status = resolve(
              [
                "Pendiente",
                "En progreso",
                "Bloqueada",
                "En revisión",
                "Hecha",
                "Cancelada",
              ] as const,
              value("Estado"),
              "El estado",
              (v) => [v],
            );
          if (has("Prioridad"))
            a.priority = resolve(
              ["Alta", "Media", "Baja"] as const,
              value("Prioridad"),
              "La prioridad",
              (v) => [v],
            );
          for (const [h, key] of [
            ["Responsables", "responsible"],
            ["Consultados", "consulted"],
            ["Informados", "informed"],
          ] as const)
            if (has(h)) a[key] = people(value(h));
          if (has("Aprobador"))
            a.accountable = value("Aprobador")
              ? person(value("Aprobador"))
              : "";
          if (has("Duración")) a.duration = Number(value("Duración"));
          if (has("Inicio")) a.start = dateValue(value("Inicio"));
          if (has("Fin")) a.end = dateValue(value("Fin"));
          else if (has("Inicio"))
            a.end = addWorkingDays(
              a.start,
              Math.max(0, a.duration - 1),
              c.workingDays,
            );
          if (has("Inicio") && (has("Fin") || has("Duración")))
            a.unscheduled = false;
          if (has("Evidencias")) {
            a.evidence = split(value("Evidencias"));
            if (
              JSON.stringify(a.evidence) !== JSON.stringify(old?.evidence ?? [])
            )
              a.reviewerId = "";
          }
          if (has("Dependencias"))
            pendingDeps.push({
              id: a.id,
              refs: split(value("Dependencias")),
              lags: value("Desfases"),
              sheet: ws.name,
              row: rn,
            });
          a = transitionActivity(p, a, old);
          activitySchema.parse(a);
          validateCompletion(p, a);
          if (old) p.activities[p.activities.indexOf(old)] = a;
          else p.activities.push(a);
          normalizeProjectCodes(p);
          if (a.unscheduled)
            warnings.push(
              `${ws.name}, fila ${rn}: fechas o duración pendientes; actividad sin planificar.`,
            );
          changes.push({
            sheet: ws.name,
            row: rn,
            kind: spec.key,
            mode: old ? "update" : "new",
            id: a.id,
            label: a.code + " · " + a.title,
            before: old ?? null,
            after: a,
          });
        } else if (spec.key === "budget") {
          const old = unique(
              c.budget.filter(
                (b) =>
                  b.id === ref ||
                  normalizeText(b.importKey ?? "") === normalizeText(ref),
              ),
              "La partida",
            ),
            teamId = has("Equipo")
              ? team(required("Equipo"))
              : (old?.teamId ?? team(required("Equipo")));
          if (old) claim(spec.key, old.id);
          if (old && mode === "new") throw Error("La partida ya existe.");
          assert(can(user, "budget:edit", source));
          if (!can(user, "project:edit", source)) {
            assert(
              source.members.find((m) => m.id === user.id)?.teamId === teamId,
            );
            if (old) assert(old.teamId === teamId);
          }
          const b = budgetItemSchema.parse({
            ...(old ?? {}),
            id: old?.id ?? randomUUID(),
            importKey: old?.importKey ?? ref,
            teamId,
            name: has("Nombre") ? required("Nombre") : old?.name,
            category: has("Categoría") ? required("Categoría") : old?.category,
            quantity: has("Cantidad")
              ? Number(value("Cantidad"))
              : old?.quantity,
            unitPriceCents: has("Precio unitario")
              ? parseMoney(value("Precio unitario"))
              : (old?.unitPriceCents ?? 0),
            supplier: has("Proveedor")
              ? value("Proveedor")
              : (old?.supplier ?? ""),
            url: has("Enlace") ? value("Enlace") : (old?.url ?? ""),
            activityId: has("Actividad")
              ? task(value("Actividad"))
              : (old?.activityId ?? ""),
            isBom: has("BOM") ? truth(value("BOM")) : (old?.isBom ?? false),
            notes: has("Notas") ? value("Notas") : (old?.notes ?? ""),
          });
          c.budget = c.budget.filter((x) => x.id !== b.id);
          c.budget.push(b);
          changes.push({
            sheet: ws.name,
            row: rn,
            kind: spec.key,
            mode: old ? "update" : "new",
            id: b.id,
            label: b.name,
            before: old ?? null,
            after: b,
          });
        } else if (spec.key === "expenses") {
          const old = unique(
            c.expenses.filter(
              (e) =>
                e.id === ref ||
                normalizeText(e.importKey ?? "") === normalizeText(ref),
            ),
            "El gasto",
          );
          assert(can(user, "comment", source));
          if (old) {
            claim(spec.key, old.id);
            if (mode === "new") throw Error("El gasto ya existe.");
            assert(old.paidBy === user.id || can(user, "approve", source));
            if (
              old.status !== "pending" &&
              ((has("Descripción") &&
                value("Descripción") !== old.description) ||
                (has("Fecha") && dateValue(value("Fecha")) !== old.date) ||
                (has("Importe") &&
                  parseMoney(value("Importe")) !== old.amountCents))
            )
              throw Error(
                "Los gastos ya decididos no se sobrescriben desde Excel.",
              );
          }
          const teamId = has("Equipo")
              ? team(required("Equipo"))
              : (old?.teamId ?? team(required("Equipo"))),
            part =
              has("Partida") && value("Partida")
                ? resolve(c.budget, value("Partida"), "La partida", (b) => [
                    b.id,
                    b.importKey ?? "",
                    b.name,
                  ])
                : undefined,
            receipt =
              has("Comprobante") && value("Comprobante")
                ? resolve(
                    c.files,
                    value("Comprobante"),
                    "El comprobante",
                    (f) => [f.id, f.name, f.url ?? ""],
                  )
                : undefined;
          if (part && part.teamId !== teamId)
            throw Error("La partida debe pertenecer al equipo del gasto.");
          const e = expenseSchema.parse({
            ...(old ?? {}),
            id: old?.id ?? randomUUID(),
            importKey: old?.importKey ?? ref,
            teamId,
            description: has("Descripción")
              ? required("Descripción")
              : old?.description,
            date: has("Fecha")
              ? dateValue(required("Fecha"))
              : (old?.date ?? dateValue(required("Fecha"))),
            amountCents: has("Importe")
              ? parseMoney(required("Importe"))
              : old?.amountCents,
            paidBy: old?.paidBy ?? user.id,
            status: old?.status ?? "pending",
            decidedBy: old?.decidedBy ?? "",
            budgetItemId: has("Partida")
              ? (part?.id ?? "")
              : (old?.budgetItemId ?? ""),
            receiptId: has("Comprobante")
              ? (receipt?.id ?? "")
              : (old?.receiptId ?? ""),
            activityId: has("Actividad")
              ? task(value("Actividad"))
              : (old?.activityId ?? ""),
          });
          if (
            e.budgetItemId &&
            !c.budget.some(
              (b) => b.id === e.budgetItemId && b.teamId === e.teamId,
            )
          )
            throw Error("La partida debe pertenecer al equipo del gasto.");
          if (old && old.status !== "pending") {
            if (
              Object.keys(e).some(
                (key) =>
                  JSON.stringify(e[key as keyof typeof e]) !==
                  JSON.stringify(old[key as keyof typeof old]),
              )
            )
              throw Error(
                "Los gastos ya decididos no se sobrescriben desde Excel.",
              );
            warnings.push(
              `${ws.name}, fila ${rn}: gasto decidido sin cambios; se conserva la aprobación.`,
            );
          }
          c.expenses = c.expenses.filter((x) => x.id !== e.id);
          c.expenses.push(e);
          changes.push({
            sheet: ws.name,
            row: rn,
            kind: spec.key,
            mode: old ? "update" : "new",
            id: e.id,
            label: e.description,
            before: old ?? null,
            after: e,
          });
        } else if (spec.key === "risks") {
          const old = unique(
            c.risks.filter(
              (r) =>
                r.id === ref ||
                normalizeText(r.importKey ?? "") === normalizeText(ref) ||
                r.code === ref,
            ),
            "El riesgo",
          );
          assert(can(user, "comment", source));
          if (old) {
            claim(spec.key, old.id);
            if (mode === "new") throw Error("El riesgo ya existe.");
            assert(
              old.ownerId === user.id || can(user, "project:edit", source),
            );
          }
          const status = has("Estado")
            ? resolve(
                [
                  ["Abierto", "open"],
                  ["Mitigado", "mitigated"],
                  ["Cerrado", "closed"],
                ],
                value("Estado"),
                "El estado",
                (v) => v,
              )[1]
            : (old?.status ?? "open");
          const r = riskSchema.parse({
            ...(old ?? {}),
            id: old?.id ?? randomUUID(),
            importKey: old?.importKey ?? ref,
            description: has("Descripción")
              ? required("Descripción")
              : old?.description,
            probability: has("Probabilidad")
              ? Number(value("Probabilidad"))
              : old?.probability,
            impact: has("Impacto") ? Number(value("Impacto")) : old?.impact,
            mitigation: has("Mitigación")
              ? value("Mitigación")
              : (old?.mitigation ?? ""),
            ownerId: has("Responsable")
              ? person(required("Responsable"))
              : (old?.ownerId ?? user.id),
            status,
          });
          c.risks = c.risks.filter((x) => x.id !== r.id);
          c.risks.push(r);
          normalizeProjectCodes(p);
          changes.push({
            sheet: ws.name,
            row: rn,
            kind: spec.key,
            mode: old ? "update" : "new",
            id: r.id,
            label: r.description,
            before: old ?? null,
            after: r,
          });
        } else {
          const old = unique(
            c.records.filter(
              (r) =>
                (r.id === ref ||
                  normalizeText(r.importKey ?? "") === normalizeText(ref)) &&
                r.kind === spec.key,
            ),
            "El registro",
          );
          assert(can(user, "comment", source));
          if (old) {
            claim(spec.key, old.id);
            if (mode === "new") throw Error("El registro ya existe.");
            assert(
              old.ownerId === user.id || can(user, "project:edit", source),
            );
          }
          const ownerId = has("Responsable")
            ? person(required("Responsable"))
            : (old?.ownerId ?? user.id);
          assert(
            ownerId === user.id || can(user, "project:edit", source),
            "Solo un administrador puede importar registros a nombre de otra persona.",
          );
          const result = has("Resultado")
            ? resolve(
                [
                  ["Pendiente", "pending"],
                  ["Cumple", "pass"],
                  ["No cumple", "fail"],
                ],
                value("Resultado"),
                "El resultado",
                (v) => v,
              )[1]
            : (old?.result ?? "pending");
          const r = recordSchema.parse({
            ...(old ?? {}),
            id: old?.id ?? randomUUID(),
            importKey: old?.importKey ?? ref,
            kind: spec.key,
            title: has("Título") ? required("Título") : old?.title,
            date: has("Fecha")
              ? dateValue(required("Fecha"))
              : (old?.date ?? dateValue(required("Fecha"))),
            teamId:
              has("Equipo") && value("Equipo")
                ? team(value("Equipo"))
                : (old?.teamId ??
                  source.members.find((m) => m.id === user.id)?.teamId ??
                  ""),
            ownerId,
            createdBy: old?.createdBy ?? user.id,
            body: has("Resumen") ? value("Resumen") : (old?.body ?? ""),
            completed: has("Completado")
              ? truth(value("Completado"))
              : (old?.completed ?? false),
            items: has("Elementos")
              ? split(value("Elementos")).map((title, index) => {
                  const label = title.replace(/^\[[ xX]?\]\s*/, "");
                  return {
                    id:
                      old?.items[index]?.title === label
                        ? old.items[index].id
                        : randomUUID(),
                    title: label,
                    done: /^\[x\]/i.test(title),
                  };
                })
              : (old?.items ?? []),
            target: has("Objetivo") ? value("Objetivo") : (old?.target ?? ""),
            measurement: has("Medición")
              ? value("Medición")
              : (old?.measurement ?? ""),
            result,
            evidence: has("Evidencia")
              ? value("Evidencia")
              : (old?.evidence ?? ""),
            attendees: has("Participantes")
              ? people(value("Participantes"))
              : (old?.attendees ?? []),
          });
          if (
            r.kind === "acceptance" &&
            r.result === "pass" &&
            (!r.target.trim() || !r.measurement.trim() || !r.evidence.trim())
          )
            throw Error(
              "Para Cumple se exigen objetivo, medición y evidencia.",
            );
          c.records = c.records.filter((x) => x.id !== r.id);
          c.records.push(r);
          changes.push({
            sheet: ws.name,
            row: rn,
            kind: spec.key,
            mode: old ? "update" : "new",
            id: r.id,
            label: r.title,
            before: old ?? null,
            after: r,
          });
        }
      } catch (e) {
        errors.push({
          sheet: ws.name,
          row: rn,
          column: column || "Referencia",
          message:
            e instanceof z.ZodError
              ? e.issues
                  .map((i) => i.path.join(".") + ": " + i.message)
                  .join("; ")
              : e instanceof Error
                ? e.message
                : "Fila no válida.",
        });
      }
    }
  }
  for (const d of pendingDeps)
    try {
      const a = p.activities.find((a) => a.id === d.id)!;
      a.dependencies = d.refs.map(task);
      a.dependencyLags = {};
      for (const lag of split(d.lags)) {
        const pos = lag.lastIndexOf(":");
        if (pos < 0) throw Error("Usa Código:días para cada desfase.");
        const id = task(lag.slice(0, pos)),
          days = Number(lag.slice(pos + 1));
        if (
          !a.dependencies.includes(id) ||
          !Number.isInteger(days) ||
          Math.abs(days) > 365
        )
          throw Error("Desfase no válido o sin predecesora asociada.");
        a.dependencyLags[id] = days;
      }
    } catch (e) {
      errors.push({
        sheet: d.sheet,
        row: d.row,
        column: "Dependencias / Desfases",
        message: e instanceof Error ? e.message : "Dependencia no válida.",
      });
    }
  try {
    validateProjectStructure(p);
  } catch (e) {
    errors.push({
      sheet: "Actividades",
      row: 0,
      column: "Planificación",
      message: e instanceof Error ? e.message : "Planificación no válida.",
    });
  }
  if (!changes.length && !errors.length)
    errors.push({
      sheet: "Archivo",
      row: 0,
      column: "Datos",
      message:
        "No hay filas para importar. Completa al menos una hoja de la plantilla.",
    });
  const canonical = (value: unknown): string =>
    JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(
            Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
          )
        : v,
    );
  for (const change of changes)
    change.unchanged =
      change.mode === "update" &&
      canonical(change.before) === canonical(change.after);
  return { project: p, errors, warnings: [...new Set(warnings)], changes };
}
