import { can } from "./auth/permissions";
import { oneDriveUrl } from "@/lib/onedrive-link";
import { sql, transaction } from "./repositories/database";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  type PublicUser,
  projectSchema,
  activitySchema,
  today,
} from "@/lib/model";
import { control, validateProjectStructure } from "@/lib/control";
import { controlSchema } from "@/lib/phase-schema";
import { allProjects, allUsers, saveProject, audit } from "./repositories";
import { reschedule } from "@/lib/control";
import { detectUpload, storeUpload } from "./uploads";
export async function mutateGlobal(
  action: string,
  data: unknown,
  user: PublicUser,
) {
  if (
    ![
      "deleteProject",
      "cloneProject",
      "restoreProject",
      "createTemplate",
    ].includes(action)
  )
    return false;
  if (!can(user, "global:edit"))
    throw Error("Se requiere una cuenta activa de administrador global.");
  if (action === "deleteProject") {
    const d = z.object({ id: z.string(), confirmName: z.string() }).parse(data),
      p = (await allProjects()).find((p) => p.id === d.id);
    if (!p) throw Error("Proyecto no encontrado.");
    if (d.confirmName !== p.name)
      throw Error("Escribe exactamente el nombre del proyecto para confirmar.");
    await transaction(async () => {
      await sql.prepare("INSERT INTO global_audit VALUES(?,?,?,?,?)").run(
        randomUUID(),
        user.id,
        "Eliminó un proyecto",
        new Date().toISOString(),
        JSON.stringify({
          id: p.id,
          name: p.name,
          filesPreserved: control(p).files.length,
        }),
      );
      await sql
        .prepare(
          "INSERT INTO retained_projects VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,deleted_at=excluded.deleted_at,deleted_by=excluded.deleted_by",
        )
        .run(p.id, p.name, new Date().toISOString(), user.id);
      await sql
        .prepare("DELETE FROM import_previews WHERE project_id=?")
        .run(p.id);
      await sql.prepare("DELETE FROM projects WHERE id=?").run(p.id);
    });
    return true;
  }
  if (action === "restoreProject") {
    const envelope = z
        .object({
          format: z.literal("mecaplan-project-v1"),
          project: projectSchema,
          files: z
            .array(
              z.object({ id: z.string(), base64: z.string().max(28000000) }),
            )
            .max(200),
        })
        .parse(data),
      p = envelope.project,
      sourceId = p.id,
      known = new Set((await allUsers()).map((u) => u.id));
    if (p.members.some((m) => !known.has(m.id)))
      throw Error(
        "El respaldo contiene usuarios que no existen en esta instalación. Asigna primero sus cuentas.",
      );
    validateProjectStructure(p);
    const c = p.control ?? controlSchema.parse({}),
      fileMap = new Map<string, string>();
    const uploads = [];
    let total = 0;
    for (const f of c.files) {
      if (f.provider === "onedrive") {
        f.url = oneDriveUrl(f.url ?? "");
        const id = randomUUID();
        fileMap.set(f.id, id);
        f.id = id;
        continue;
      }
      const binary = envelope.files.find((b) => b.id === f.id);
      if (!binary || !/^[A-Za-z0-9+/]*={0,2}$/.test(binary.base64))
        throw Error("El respaldo no incluye un adjunto válido.");
      const bytes = Buffer.from(binary.base64, "base64");
      total += bytes.length;
      if (total > 20 * 1024 * 1024)
        throw Error("El respaldo excede el límite de 20 MB de adjuntos.");
      f.mime = detectUpload(f.name, bytes);
      f.size = bytes.length;
      const id = randomUUID();
      fileMap.set(f.id, id);
      uploads.push({ id, bytes });
      f.id = id;
    }
    const remap = (value: string) => {
      for (const [old, id] of fileMap)
        value = value.replaceAll("/api/files/" + old, "/api/files/" + id);
      return value;
    };
    for (const e of c.expenses)
      if (e.receiptId) e.receiptId = fileMap.get(e.receiptId) ?? "";
    if (c.sourceFileId) c.sourceFileId = fileMap.get(c.sourceFileId) ?? "";
    for (const a of p.activities) a.evidence = a.evidence?.map(remap);
    for (const r of c.records) r.evidence = remap(r.evidence);
    p.control = c;
    // A user-editable JSON document does not prove that a teacher approved it.
    for (const milestone of c.milestones) {
      milestone.approved = false;
      milestone.approvedBy = "";
      milestone.approvedAt = "";
    }
    p.version = 0;
    p.id = randomUUID();
    p.name = (p.name + " · restaurado").slice(0, 100);
    for (const f of uploads) await storeUpload(f.id, f.bytes);
    audit(p, user.name, "Restauró un respaldo", p.name, null, { sourceId });
    await saveProject(p);
    return true;
  }
  if (action === "cloneProject") {
    const d = z
        .object({
          id: z.string(),
          name: z.string().min(3).max(100),
          weeks: z.number().int().min(1).max(104),
          scale: z.boolean(),
        })
        .parse(data),
      source = (await allProjects()).find((p) => p.id === d.id);
    if (!source) throw Error("Proyecto no encontrado.");
    const p = structuredClone(source);
    p.activities = p.activities.filter((a) => !a.deletedAt);
    const map = new Map(p.activities.map((a) => [a.id, randomUUID()]));
    p.version = 0;
    p.id = randomUUID();
    p.name = d.name;
    p.weeks = d.weeks;
    p.start = today();
    p.status = "planning";
    p.comments = [];
    p.history = [];
    p.control = controlSchema.parse({
      currency: control(source).currency,
      workingDays: control(source).workingDays,
      integrationLeadId: control(source).integrationLeadId,
      requireCrossReview: control(source).requireCrossReview,
      clonedFromId: source.id,
    });
    for (const a of p.activities) {
      a.id = map.get(a.id)!;
      a.parentId = a.parentId ? (map.get(a.parentId) ?? null) : null;
      a.dependencies = a.dependencies.map((id) => map.get(id)!).filter(Boolean);
      a.dependencyLags = Object.fromEntries(
        Object.entries(a.dependencyLags ?? {})
          .filter(([id]) => map.has(id))
          .map(([id, lag]) => [
            map.get(id)!,
            d.scale ? Math.round((lag * d.weeks) / source.weeks) : lag,
          ]),
      );
      a.status = "Pendiente";
      a.deletedAt = null;
      a.actualStart = null;
      a.actualEnd = null;
      a.evidence = [];
      a.reviewerId = "";
      a.commits = 0;
      if (d.scale)
        a.duration = Math.max(
          a.duration ? 1 : 0,
          Math.round((a.duration * d.weeks) / source.weeks),
        );
    }
    reschedule(p);
    audit(p, user.name, "Clonó un proyecto", p.name, null, {
      source: source.id,
      scale: d.scale,
    });
    await saveProject(p);
    return true;
  }
  const d = z
    .object({
      name: z.string().min(3).max(100),
      weeks: z.number().int().min(1).max(104),
    })
    .parse(data);
  const p = projectSchema.parse({
    id: randomUUID(),
    name: d.name,
    weeks: d.weeks,
    start: today(),
    status: "planning",
    description: "Plantilla estándar de diseño mecatrónico.",
    teams: [
      { id: "electronics", name: "Electrónica", color: "#0F49B6" },
      { id: "software", name: "Programación", color: "#03AED2" },
      { id: "cad", name: "CAD y Manufactura", color: "#05065C" },
    ],
    members: [],
    comments: [],
    history: [],
    activities: [],
    control: controlSchema.parse({}),
  });
  const phases = [
    "Requisitos",
    "Concepto",
    "Diseño detallado",
    "Fabricación o desarrollo",
    "Integración",
    "Pruebas",
    "Documentación",
  ];
  for (const team of p.teams) {
    let previous = "";
    for (const phase of phases) {
      const a = activitySchema.parse({
        id: randomUUID(),
        code: `ACT-${p.activities.length + 1}`,
        title: phase + " · " + team.name,
        teamId: team.id,
        status: "Pendiente",
        priority: "Media",
        start: p.start,
        end: p.start,
        duration: Math.max(1, Math.round((d.weeks * 5) / 7)),
        responsible: [],
        accountable: "",
        dependencies: previous ? [previous] : [],
      });
      p.activities.push(a);
      previous = a.id;
    }
  }
  reschedule(p);
  audit(p, user.name, "Creó una plantilla estándar", p.name, null, {
    weeks: p.weeks,
  });
  await saveProject(p);
  return true;
}
