import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import {
  projectSchema,
  activitySchema,
  type PublicUser,
} from "../src/lib/model";
import { controlSchema } from "../src/lib/phase-schema";
import {
  normalizeProjectCodes,
  matchesActivityCode,
  nextActivityCode,
} from "../src/lib/codes";
import {
  previewExcel,
  validateExcelZip,
  loadImportWorkbook,
} from "../src/server/excel-import";
import { importSheets } from "../src/lib/import-format";
import { oneDriveUrl } from "../src/lib/onedrive-link";
import { agentContext } from "../src/lib/agent-context";
import { parseCommit } from "../src/lib/commits";
const user: PublicUser = {
  id: "admin",
  name: "Admin",
  email: "private@example.invalid",
  globalRole: "superuser",
  status: "active",
};
function project() {
  return normalizeProjectCodes(
    projectSchema.parse({
      id: "p",
      name: "Prueba de importación",
      description: "",
      start: "2026-10-19",
      weeks: 7,
      status: "planning",
      teams: [
        { id: "software", name: "Programación", color: "#03AED2" },
        { id: "electronics", name: "Electrónica", color: "#0F49B6" },
      ],
      members: [
        {
          id: "admin",
          name: "Admin",
          teamId: "software",
          lead: true,
          role: "admin",
        },
        {
          id: "member",
          name: "Miembro",
          teamId: "electronics",
          lead: false,
          role: "member",
        },
      ],
      activities: [
        activitySchema.parse({
          id: "original",
          code: "DIG-01",
          title: "Actividad original",
          teamId: "software",
          status: "Pendiente",
          priority: "Media",
          start: "2026-10-19",
          end: "2026-10-19",
          duration: 1,
          responsible: ["admin"],
          accountable: "admin",
        }),
      ],
      comments: [],
      history: [],
      control: controlSchema.parse({}),
    }),
  );
}
async function workbook() {
  return loadImportWorkbook(await readFile("public/plantilla-mecaplan.xlsx"));
}
function row(
  wb: ExcelJS.Workbook,
  key: string,
  data: Record<string, unknown>,
  rn = 2,
) {
  const spec = importSheets.find((s) => s.key === key)!;
  wb.getWorksheet(spec.name)!.getRow(rn).values = spec.headers.map(
    (h) => data[h] ?? null,
  ) as ExcelJS.CellValue[];
}
const bytes = async (wb: ExcelJS.Workbook) =>
  Buffer.from(await wb.xlsx.writeBuffer());
async function completeWorkbook() {
  const wb = await workbook();
  row(wb, "activities", {
    Referencia: "NUEVA-1",
    Título: "Actividad importada",
    Equipo: "Programación",
    Inicio: "2026-10-19",
    Duración: 3,
    Responsables: "Admin",
    Aprobador: "Admin",
  });
  row(wb, "budget", {
    Referencia: "PRES-1",
    Nombre: "Material de prueba",
    Equipo: "Programación",
    Categoría: "Materiales",
    Cantidad: 2,
    "Precio unitario": 12.5,
    BOM: "Sí",
    Actividad: "NUEVA-1",
  });
  row(wb, "expenses", {
    Referencia: "GAS-1",
    Descripción: "Gasto de prueba",
    Equipo: "Programación",
    Fecha: "2026-10-19",
    Importe: 10.25,
    Partida: "PRES-1",
  });
  row(wb, "risks", {
    Referencia: "RIESGO-1",
    Descripción: "Riesgo de prueba",
    Probabilidad: 3,
    Impacto: 4,
    Mitigación: "Acción de prueba",
    Responsable: "Admin",
    Estado: "Abierto",
  });
  for (const key of [
    "weekly",
    "meeting",
    "reception",
    "acceptance",
    "checklist",
  ])
    row(wb, key, {
      Referencia: key + "-1",
      Título: "Registro " + key,
      Equipo: "Programación",
      Fecha: "2026-10-19",
      Responsable: "Admin",
      Resumen: "Acuerdo registrado",
      Elementos: "[x] Revisado; [ ] Pendiente",
      ...(key === "acceptance"
        ? {
            Objetivo: "10",
            Medición: "10",
            Resultado: "Cumple",
            Evidencia: "Informe de ensayo 01",
          }
        : {}),
    });
  return wb;
}
describe("códigos y alias por equipo", () => {
  it("migra sin perder identidad y no cambia al repetirse", () => {
    const p = project(),
      a = p.activities[0];
    expect(a.id).toBe("original");
    expect(a.code).toBe("PRO-001");
    expect(matchesActivityCode(a, "DIG-01")).toBe(true);
    expect(nextActivityCode(p, "software")).toBe("PRO-002");
    const before = JSON.stringify(p);
    normalizeProjectCodes(p);
    expect(JSON.stringify(p)).toBe(before);
  });
  it("reasigna al mover de equipo y conserva ambos códigos", () => {
    const p = project();
    p.activities[0].teamId = "electronics";
    normalizeProjectCodes(p);
    expect(p.activities[0].code).toBe("ELE-001");
    expect(p.activities[0].aliases).toEqual(["DIG-01", "PRO-001"]);
    expect(parseCommit("ELE-001 PRO-023 PRU-001 #review").codes).toEqual([
      "ELE-001",
      "PRO-023",
      "PRU-001",
    ]);
  });
});
describe("importador Excel con validación y permisos", () => {
  it("la plantilla tiene guía y nueve hojas, sin filas de ejemplo que importar", async () => {
    const wb = await workbook();
    expect(wb.worksheets).toHaveLength(10);
    for (const spec of importSheets)
      expect(
        (
          wb.getWorksheet(spec.name)!.getRow(1).values as ExcelJS.CellValue[]
        ).slice(1),
      ).toEqual([...spec.headers]);
    const result = await previewExcel(
      await bytes(wb),
      project(),
      user,
      "upsert",
    );
    expect(result.errors[0].message).toContain("No hay filas");
  });
  it("importa nueve tipos y reimporta sin duplicar ni modificar el original", async () => {
    const wb = await completeWorkbook(),
      p = project(),
      before = JSON.stringify(p),
      buffer = await bytes(wb),
      r = await previewExcel(buffer, p, user, "upsert");
    expect(r.errors).toEqual([]);
    expect(JSON.stringify(p)).toBe(before);
    expect(r.changes).toHaveLength(9);
    expect(r.project.activities).toHaveLength(2);
    expect(r.project.control!.records).toHaveLength(5);
    expect(r.project.control!.expenses[0]).toMatchObject({
      status: "pending",
      paidBy: "admin",
      amountCents: 1025,
    });
    expect(r.project.control!.budget[0].unitPriceCents).toBe(1250);
    expect(r.project.activities[1]).toMatchObject({
      code: "PRO-002",
      duration: 3,
      end: "2026-10-21",
      unscheduled: false,
    });
    const second = await previewExcel(buffer, r.project, user, "upsert");
    expect(second.errors).toEqual([]);
    expect(second.changes.every((c) => c.mode === "update")).toBe(true);
    expect(second.project.control!.records).toHaveLength(5);
    expect(second.project.activities).toHaveLength(2);
  });
  it("rechaza referencias repetidas y no permite importar a otro equipo sin permiso", async () => {
    const wb = await completeWorkbook();
    row(
      wb,
      "activities",
      { Referencia: "NUEVA-1", Título: "Duplicada", Equipo: "Programación" },
      3,
    );
    const r = await previewExcel(
      await bytes(wb),
      project(),
      { ...user, id: "member", name: "Miembro", globalRole: "user" },
      "upsert",
    );
    expect(r.errors.some((e) => e.message.includes("rol"))).toBe(true);
    expect(r.errors.some((e) => e.message.includes("repite"))).toBe(true);
  });
  it("rechaza fórmulas y pruebas de aceptación sin medición/evidencia", async () => {
    const wb = await workbook();
    row(wb, "acceptance", {
      Referencia: "PA-1",
      Título: "Prueba incompleta",
      Fecha: "2026-10-19",
      Resultado: "Cumple",
    });
    row(wb, "activities", {
      Referencia: "REF-1",
      Título: "Fórmula",
      Equipo: "Programación",
    });
    wb.getWorksheet("Actividades")!.getCell("C2").value = {
      formula: "1+1",
      result: 2,
    };
    const r = await previewExcel(await bytes(wb), project(), user, "upsert");
    expect(r.errors.some((e) => e.message.includes("fórmulas"))).toBe(true);
    expect(r.errors.some((e) => e.message.includes("medición"))).toBe(true);
  });
  it("no sobrescribe gastos aprobados ni permite cerrar sin revisión cruzada", async () => {
    const p = project();
    p.control!.requireCrossReview = true;
    p.control!.expenses.push({
      id: "expense",
      importKey: "GAS-1",
      teamId: "software",
      budgetItemId: "",
      activityId: "",
      amountCents: 10,
      date: "2026-10-19",
      paidBy: "admin",
      description: "Compra aprobada",
      receiptId: "",
      status: "approved",
      decidedBy: "admin",
    });
    const wb = await completeWorkbook();
    row(wb, "activities", { Código: "DIG-01", Estado: "Hecha" });
    const r = await previewExcel(await bytes(wb), p, user, "upsert");
    expect(r.errors.some((e) => e.message.includes("decididos"))).toBe(true);
    expect(r.errors.some((e) => e.message.includes("revisión"))).toBe(true);
  });
  it("detecta ciclos aunque se usen alias antiguos y referencias nuevas", async () => {
    const wb = await workbook();
    row(wb, "activities", { Código: "DIG-01", Dependencias: "NUEVA-1" });
    row(
      wb,
      "activities",
      {
        Referencia: "NUEVA-1",
        Título: "Nueva con ciclo",
        Equipo: "Programación",
        Dependencias: "DIG-01",
      },
      3,
    );
    const r = await previewExcel(await bytes(wb), project(), user, "upsert");
    expect(r.errors.some((e) => e.message.includes("ciclo"))).toBe(true);
  });
  it("rechaza formatos ajenos a XLSX", async () => {
    await expect(
      validateExcelZip(Buffer.from("archivo falso")),
    ).rejects.toThrow("XLSX");
  });
});
describe("OneDrive y contexto ampliado", () => {
  it("solo admite enlaces HTTPS de Microsoft, sin confundir dominios", () => {
    expect(oneDriveUrl("https://unitec-my.sharepoint.com/:b:/file")).toContain(
      "sharepoint.com",
    );
    expect(oneDriveUrl("https://1drv.ms/example")).toContain("1drv.ms");
    for (const bad of [
      "javascript:alert(1)",
      "http://1drv.ms/file",
      "https://unitec.sharepoint.com.evil.test/x",
      "https://user:password@1drv.ms/x",
    ])
      expect(() => oneDriveUrl(bad)).toThrow();
  });
  it("incluye registros y resultados actuales sin correos ni claves", () => {
    const p = project();
    p.control!.records.push({
      id: "record",
      kind: "acceptance",
      title: "Prueba registrada",
      date: "2026-10-19",
      teamId: "software",
      ownerId: "admin",
      body: "correo personal@example.invalid",
      completed: true,
      items: [],
      target: "10",
      measurement: "10",
      result: "pass",
      evidence: "https://1drv.ms/documento",
      attendees: ["admin"],
    });
    const context = agentContext(p);
    expect(context.data.records[0].measurement).toBe("10");
    expect(context.markdown).toContain("Prueba registrada");
    expect(JSON.stringify(context)).not.toContain("personal@example.invalid");
    expect(JSON.stringify(context)).not.toContain("https://1drv.ms/documento");
  });
});

import { requestOrigin } from "../src/server/request-origin";
describe("origen público de solicitudes", () => {
  it("admite el Host público aunque Next use otra URL interna", () => {
    expect(
      requestOrigin(
        new Request("http://localhost:3000/api/import", {
          headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" },
        }),
      ),
    ).toBe("http://127.0.0.1:3000");
  });
  it("rechaza origen ausente, inválido, externo o puerto distinto", () => {
    for (const origin of [
      "",
      "null",
      "https://otro.invalid",
      "http://127.0.0.1:4000",
    ])
      expect(
        requestOrigin(
          new Request("http://localhost:3000/api/import", {
            headers: { origin, host: "127.0.0.1:3000" },
          }),
        ),
      ).toBeNull();
  });
});

it("la vista previa incluye descripciones y dependencias antes de confirmar", async () => {
  const p = project(),
    wb = await workbook();
  row(wb, "activities", {
    Código: "DIG-01",
    Descripción: "Descripción revisada",
  });
  const r = await previewExcel(await bytes(wb), p, user, "upsert");
  expect(r.errors).toEqual([]);
  expect(r.changes[0].before?.description).toBe("");
  expect(r.changes[0].after.description).toBe("Descripción revisada");
  expect(r.changes[0].after.teamId).toBe("software");
});
