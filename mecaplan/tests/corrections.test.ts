import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { projectSchema, activitySchema } from "../src/lib/model";
import { controlSchema } from "../src/lib/phase-schema";
import { weeklyLoads } from "../src/lib/control";
import { assertActivityRevision } from "../src/lib/revisions";
import { saveProject } from "../src/server/repositories";
import { sqlite } from "../src/server/repositories/database";
import { mutateControl } from "../src/server/control-service";
function fixture() {
  return projectSchema.parse({
    id: "correction-" + randomUUID(),
    name: "Regresión de correcciones",
    description: "",
    start: "2026-10-19",
    weeks: 8,
    status: "planning",
    teams: [
      { id: "s", name: "Programación", color: "#123456", codePrefix: "PRO" },
    ],
    members: [
      {
        id: "u",
        name: "Persona de prueba",
        teamId: "s",
        role: "admin",
        lead: true,
      },
    ],
    comments: [],
    history: [],
    control: controlSchema.parse({}),
    activities: [
      activitySchema.parse({
        id: "a",
        code: "PRO-001",
        title: "Actividad de prueba",
        teamId: "s",
        status: "Pendiente",
        priority: "Media",
        start: "2026-10-19",
        end: "2026-11-27",
        duration: 30,
        effortDays: 1,
        responsible: ["u"],
        accountable: "u",
      }),
    ],
  });
}
it("un día de esfuerzo repartido en seis semanas conserva el total", () => {
  const p = fixture(),
    weeks = weeklyLoads(p)[0].weeks;
  expect(weeks.slice(0, 6).every((w) => Math.abs(w.days - 1 / 6) < 1e-12)).toBe(
    true,
  );
  expect(weeks.reduce((sum, w) => sum + w.days, 0)).toBeCloseTo(1, 12);
});
it("la revisión cambia por actividad editada, pero no por comentarios", async () => {
  const p = fixture();
  try {
    await saveProject(p);
    const initial = structuredClone(p.activities[0]);
    p.comments.push({
      id: "note",
      activityId: "a",
      author: "Persona",
      body: "Comentario independiente",
      date: new Date().toISOString(),
    });
    await saveProject(p);
    expect(p.activities[0].revision).toBe(initial.revision);
    p.activities[0].title = "Título cambiado en otra sesión";
    await saveProject(p);
    expect(() => assertActivityRevision(initial, p.activities[0])).toThrow(
      /cambió/,
    );
    expect(p.activities[0].revision).toBe(initial.revision! + 1);
  } finally {
    sqlite.prepare("DELETE FROM projects WHERE id=?").run(p.id);
  }
});
it("una planificación desactualizada no cambia duración ni dependencias", async () => {
  const p = fixture();
  p.activities[0].revision = 2;
  await expect(
    mutateControl(
      "savePlan",
      {
        activities: [{ id: "a", revision: 1, duration: 2, dependencies: [] }],
        applyDates: false,
      },
      p,
      {
        id: "u",
        name: "Persona",
        email: "u@example.invalid",
        globalRole: "superuser",
        status: "active",
      },
    ),
  ).rejects.toThrow(/cambió/);
  expect(p.activities[0].duration).toBe(30);
});
