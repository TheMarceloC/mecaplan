import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import {
  activitySchema,
  projectSchema,
  progress,
  type PublicUser,
} from "../src/lib/model";
import { controlSchema } from "../src/lib/phase-schema";
import {
  weeklyLoads,
  planning,
  reschedule,
  validateProjectStructure,
} from "../src/lib/control";
import { can } from "../src/server/auth/permissions";
import { mutateControl } from "../src/server/control-service";
import { mutateGlobal } from "../src/server/global-service";
import { loadImportWorkbook, previewExcel } from "../src/server/excel-import";
import { importSheets } from "../src/lib/import-format";
import { agentContext } from "../src/lib/agent-context";

const admin: PublicUser = {
  id: "u",
  name: "Administrador",
  email: "u@example.invalid",
  globalRole: "superuser",
  status: "active",
};
function project() {
  return projectSchema.parse({
    id: "stabilization-fixture",
    name: "Proyecto de regresión",
    description: "",
    start: "2026-10-19",
    weeks: 3,
    status: "planning",
    teams: [
      { id: "s", name: "Programación", color: "#123456", codePrefix: "PRO" },
      { id: "e", name: "Electrónica", color: "#654321", codePrefix: "ELE" },
    ],
    members: [
      {
        id: "u",
        name: "Administrador",
        teamId: "s",
        role: "admin",
        lead: true,
      },
      { id: "m", name: "Integrante", teamId: "e", role: "member", lead: false },
    ],
    activities: [
      activitySchema.parse({
        id: "a",
        code: "PRO-001",
        importKey: "REF-ESTABLE",
        title: "Actividad de prueba",
        teamId: "s",
        status: "Pendiente",
        priority: "Media",
        start: "2026-10-19",
        end: "2026-10-26",
        duration: 6,
        responsible: ["u"],
        accountable: "u",
      }),
    ],
    comments: [],
    history: [],
    control: controlSchema.parse({}),
  });
}
async function book() {
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

describe("estabilización: permisos y aprobaciones", () => {
  it("rechaza operaciones globales de cuentas pendientes", async () => {
    await expect(
      mutateGlobal(
        "deleteProject",
        { id: "missing", confirmName: "missing" },
        { ...admin, status: "pending" },
      ),
    ).rejects.toThrow(/activ|pendiente/i);
  });
  it("el cambio obligatorio de contraseña bloquea también can", () => {
    expect(can({ ...admin, mustChangePassword: true }, "global:edit")).toBe(
      false,
    );
  });
  it("editar criterios de hito invalida aprobación docente, editar sin cambios la conserva", async () => {
    const p = project(),
      h = {
        id: "h",
        title: "Entrega aprobada",
        date: "2026-11-01",
        points: 5,
        criteria: "Criterio original",
        approved: true,
      };
    p.control!.milestones.push(h);
    await mutateControl("saveMilestone", { ...h, approved: false }, p, admin);
    expect(p.control!.milestones[0].approved).toBe(true);
    await mutateControl(
      "saveMilestone",
      { ...h, points: 100, criteria: "Otro criterio" },
      p,
      admin,
    );
    expect(p.control!.milestones[0].approved).toBe(false);
  });
  it("no permite crear registros a nombre de otra persona desde API ordinaria", async () => {
    await expect(
      mutateControl(
        "saveRecord",
        {
          id: "r",
          kind: "meeting",
          title: "Acta de prueba",
          date: "2026-10-19",
          ownerId: "u",
        },
        project(),
        { ...admin, id: "m", globalRole: "user" },
      ),
    ).rejects.toThrow(/responsable|otra persona|administrador/i);
  });
});
describe("estabilización: calendario y transiciones", () => {
  it("distribuye una tarea de seis días en 5 + 1 sin inventar carga", () => {
    const weeks = weeklyLoads(project())[0].weeks;
    expect(weeks.map((w) => w.days)).toEqual([5, 1, 0]);
    expect(weeks[0].overloaded).toBe(false);
  });
  it("el fin global coincide con un hito terminal", () => {
    const p = project();
    p.activities[0].duration = 3;
    p.activities.push({
      ...p.activities[0],
      id: "h",
      code: "PRO-002",
      duration: 0,
      dependencies: ["a"],
    });
    reschedule(p);
    expect(planning(p).finish).toBe(
      p.activities.find((a) => a.id === "h")!.end,
    );
  });
  it("un cambio de duración con destino inexistente nunca cambia el proyecto", async () => {
    const p = project();
    await expect(
      mutateControl(
        "requestChange",
        {
          id: "c",
          type: "duration",
          activityId: "missing",
          description: "Cambio propuesto",
          reason: "Razón de prueba",
          impact: "",
          value: 9,
          requestedBy: "u",
          date: new Date().toISOString(),
        },
        p,
        admin,
      ),
    ).rejects.toThrow(/actividad|destino/i);
    expect(p.weeks).toBe(3);
  });
  it("aprobar Hecha registra fecha real de finalización", async () => {
    const p = project();
    p.control!.changes.push({
      id: "c",
      type: "status",
      activityId: "a",
      description: "Cerrar actividad",
      reason: "Trabajo completado",
      impact: "",
      value: "Hecha",
      status: "pending",
      requestedBy: "u",
      date: new Date().toISOString(),
      decidedBy: "",
      decidedAt: "",
    });
    await mutateControl(
      "decideChange",
      { id: "c", status: "approved" },
      p,
      admin,
    );
    expect(p.activities[0].actualEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("reabrir por nueva evidencia limpia la fecha real actual", async () => {
    const p = project();
    Object.assign(p.activities[0], {
      status: "Hecha",
      actualEnd: "2026-10-01",
      evidence: ["anterior"],
    });
    await mutateControl(
      "submitEvidence",
      { id: "a", evidence: ["actualizada"] },
      p,
      admin,
    );
    expect(p.activities[0].status).toBe("En revisión");
    expect(p.activities[0].actualEnd).toBeNull();
    expect(progress(p)).toBe(0);
  });
  it("valida las relaciones financieras completas", () => {
    const p = project();
    p.control!.budget.push({
      id: "b",
      teamId: "s",
      activityId: "",
      category: "Material",
      name: "Partida de prueba",
      quantity: 1,
      unitPriceCents: 100,
      supplier: "",
      url: "",
      notes: "",
      isBom: false,
    });
    p.control!.expenses.push({
      id: "g",
      teamId: "e",
      budgetItemId: "b",
      activityId: "",
      amountCents: 100,
      date: "2026-10-19",
      paidBy: "u",
      description: "Compra de prueba",
      receiptId: "",
      status: "pending",
      decidedBy: "",
    });
    expect(() => validateProjectStructure(p)).toThrow(/partida|equipo/);
  });
});
describe("estabilización: identidad de Excel", () => {
  it("Código identifica su actividad aunque otra referencia externa tenga el mismo texto", async () => {
    const p = project();
    p.activities[0].importKey = "PRO-002";
    p.activities.push({
      ...p.activities[0],
      id: "b",
      code: "PRO-002",
      importKey: "OTRA",
      title: "Segunda actividad",
    });
    const wb = await book();
    row(wb, "activities", { Código: "PRO-002", Título: "Segunda actualizada" });
    const r = await previewExcel(await bytes(wb), p, admin, "upsert");
    expect(r.errors).toEqual([]);
    expect(r.project.activities.find((a) => a.id === "a")!.title).toBe(
      "Actividad de prueba",
    );
    expect(r.project.activities.find((a) => a.id === "b")!.title).toBe(
      "Segunda actualizada",
    );
  });
  it("editar por código conserva referencia estable al volver al libro original", async () => {
    const p = project(),
      wb = await book();
    row(wb, "activities", { Código: "PRO-001", Título: "Título modificado" });
    const r = await previewExcel(await bytes(wb), p, admin, "upsert");
    expect(r.project.activities[0].importKey).toBe("REF-ESTABLE");
    const wb2 = await book();
    row(wb2, "activities", {
      Referencia: "REF-ESTABLE",
      Título: "Nueva revisión",
    });
    const r2 = await previewExcel(await bytes(wb2), r.project, admin, "upsert");
    expect(r2.errors).toEqual([]);
    expect(r2.project.activities).toHaveLength(1);
  });
  it("rechaza código y referencia que identifican registros distintos", async () => {
    const p = project();
    p.activities.push({
      ...p.activities[0],
      id: "b",
      code: "PRO-002",
      importKey: "REF-B",
    });
    const wb = await book();
    row(wb, "activities", {
      Referencia: "REF-ESTABLE",
      Código: "PRO-002",
      Título: "Conflicto de identidad",
    });
    const r = await previewExcel(await bytes(wb), p, admin, "upsert");
    expect(r.errors.length).toBeGreaterThan(0);
  });
  it("[vacío] limpia comprobante y partida de un gasto pendiente", async () => {
    const p = project();
    p.control!.budget.push({
      id: "b",
      teamId: "s",
      activityId: "",
      category: "Material",
      name: "Partida de prueba",
      quantity: 1,
      unitPriceCents: 100,
      supplier: "",
      url: "",
      notes: "",
      isBom: false,
    });
    p.control!.files.push({
      id: "f",
      name: "Comprobante",
      mime: "application/pdf",
      size: 1,
      uploadedBy: "u",
      date: "2026-10-19",
      activityId: "",
    });
    p.control!.expenses.push({
      id: "g",
      importKey: "G-1",
      teamId: "s",
      budgetItemId: "b",
      receiptId: "f",
      activityId: "",
      amountCents: 100,
      date: "2026-10-19",
      paidBy: "u",
      description: "Compra de prueba",
      status: "pending",
      decidedBy: "",
    });
    const wb = await book();
    row(wb, "expenses", {
      Referencia: "G-1",
      Partida: "[vacío]",
      Comprobante: "[vacío]",
    });
    const r = await previewExcel(await bytes(wb), p, admin, "upsert");
    expect(r.errors).toEqual([]);
    expect(r.project.control!.expenses[0]).toMatchObject({
      budgetItemId: "",
      receiptId: "",
    });
  });
  it("acepta un gasto aprobado idéntico sin deshacer la aprobación", async () => {
    const p = project();
    p.control!.expenses.push({
      id: "g",
      importKey: "G-1",
      teamId: "s",
      budgetItemId: "",
      receiptId: "",
      activityId: "",
      amountCents: 100,
      date: "2026-10-19",
      paidBy: "u",
      description: "Compra de prueba",
      status: "approved",
      decidedBy: "u",
    });
    const wb = await book();
    row(wb, "expenses", {
      Referencia: "G-1",
      Descripción: "Compra de prueba",
      Importe: 1,
    });
    const r = await previewExcel(await bytes(wb), p, admin, "upsert");
    expect(r.errors).toEqual([]);
    expect(r.project.control!.expenses[0].status).toBe("approved");
  });
});
it("depura nombres y campos libres del contexto en ambos formatos", () => {
  const p = project();
  p.name = "Proyecto token=RESERVADO";
  p.teams[0].name = "Equipo private@example.invalid";
  p.members[0].name = "Persona private@example.invalid";
  const r = JSON.stringify(agentContext(p));
  expect(r).not.toContain("RESERVADO");
  expect(r).not.toContain("private@example.invalid");
});
