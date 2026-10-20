import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  projectSchema,
  activitySchema,
  type PublicUser,
} from "../src/lib/model";
import { controlSchema, evaluationSchema } from "../src/lib/phase-schema";
import { progressAt } from "../src/lib/progress-history";
import { weeklyLoads } from "../src/lib/control";
import { saveProject, allProjects } from "../src/server/repositories";
import { sqlite } from "../src/server/repositories/database";
import { mutateGlobal } from "../src/server/global-service";
import { saveEvaluationVersion } from "../src/server/repositories/evaluations";
import { boundedRequest } from "../src/server/request-body";
import { transitionActivity } from "../src/lib/activity-transitions";

function fixture() {
  return projectSchema.parse({
    id: "release-" + randomUUID(),
    name: "Proyecto de regresión",
    description: "",
    start: "2026-10-19",
    weeks: 4,
    status: "planning",
    teams: [
      { id: "s", name: "Programación", color: "#123456", codePrefix: "PRO" },
    ],
    members: [
      {
        id: "u",
        name: "Usuario de prueba",
        teamId: "s",
        role: "admin",
        lead: true,
      },
    ],
    activities: [
      activitySchema.parse({
        id: "a",
        code: "PRO-001",
        title: "Actividad de prueba",
        teamId: "s",
        status: "Pendiente",
        priority: "Media",
        start: "2026-10-19",
        end: "2026-10-19",
        duration: 1,
        responsible: ["u"],
        accountable: "u",
      }),
    ],
    comments: [],
    history: [],
    control: controlSchema.parse({ requireCrossReview: true }),
  });
}
const actor: PublicUser = {
  id: "release-actor",
  name: "Administrador de prueba",
  email: "release@example.invalid",
  globalRole: "superuser",
  status: "active",
};
it("editar una actividad histórica sin cambiar su estado no inventa fechas reales", () => {
  const p = fixture();
  p.control!.requireCrossReview = false;
  const completed = {
    ...p.activities[0],
    status: "Hecha" as const,
    actualEnd: null,
  };
  expect(
    transitionActivity(
      p,
      { ...completed, title: "Título corregido" },
      completed,
    ).actualEnd,
  ).toBeNull();
  const inProgress = {
    ...p.activities[0],
    status: "En progreso" as const,
    actualStart: null,
  };
  expect(
    transitionActivity(p, { ...inProgress, duration: 2 }, inProgress)
      .actualStart,
  ).toBeNull();
});
it("una captura completa prevalece sobre fechas reales incompletas", () => {
  const p = fixture();
  p.activities[0].status = "Hecha";
  p.activities[0].actualEnd = "2026-10-01";
  p.activities.push({
    ...p.activities[0],
    id: "b",
    code: "PRO-002",
    actualEnd: null,
  });
  p.control!.snapshots.push({ date: "2026-10-02", doneIds: ["a", "b"] });
  expect(progressAt(p, "2026-10-05")).toBe(100);
});
it("la historia conserva una reapertura sin contarla como finalizada", () => {
  const p = fixture();
  p.control!.snapshots.push({ date: "2026-10-19", doneIds: ["a"] });
  p.control!.statusEvents = [
    {
      id: "ev",
      activityId: "a",
      from: "Hecha",
      to: "En revisión",
      at: "2026-10-20T12:00:00Z",
    },
  ];
  expect(progressAt(p, "2026-10-20")).toBe(100);
  expect(progressAt(p, "2026-10-21")).toBe(0);
});
it("la carga se conserva para calendarios de uno a siete días", () => {
  for (let days = 1; days <= 7; days++) {
    const p = fixture();
    p.control!.workingDays = days;
    p.activities[0].duration = 6;
    p.activities[0].start = "2026-10-19";
    p.activities[0].end = "2026-11-09";
    const sum = weeklyLoads(p)[0].weeks.reduce((sum, w) => sum + w.days, 0);
    expect(Math.abs(sum - 6)).toBeLessThanOrEqual(0.2);
  }
});
it("una escritura de revisión obsoleta no reemplaza cambios de otra sesión", async () => {
  const p = fixture();
  try {
    await saveProject(p);
    const stale = structuredClone(p);
    p.description = "Cambio vigente";
    await saveProject(p);
    stale.description = "Cambio anterior";
    await expect(saveProject(stale)).rejects.toThrow(/otra sesión/);
    expect((await allProjects()).find((x) => x.id === p.id)!.description).toBe(
      "Cambio vigente",
    );
  } finally {
    sqlite.prepare("DELETE FROM projects WHERE id=?").run(p.id);
  }
});
it("clonar excluye papelera, remapea desfases y conserva la revisión cruzada", async () => {
  const p = fixture();
  p.activities[0].duration = 3;
  p.activities.push(
    {
      ...p.activities[0],
      id: "b",
      code: "PRO-002",
      dependencies: ["a"],
      dependencyLags: { a: 4 },
    },
    {
      ...p.activities[0],
      id: "trash",
      code: "PRO-003",
      deletedAt: "2026-10-01",
    },
  );
  try {
    await saveProject(p);
    await mutateGlobal(
      "cloneProject",
      { id: p.id, name: p.id + " copia", weeks: 4, scale: false },
      actor,
    );
    const clone = (await allProjects()).find(
      (x) => x.name === p.id + " copia",
    )!;
    expect(clone.activities).toHaveLength(2);
    expect(clone.control!.requireCrossReview).toBe(true);
    const successor = clone.activities.find((a) => a.code === "PRO-002")!;
    expect(successor.dependencyLags![successor.dependencies[0]]).toBe(4);
  } finally {
    for (const row of await allProjects())
      if (row.id === p.id || row.name === p.id + " copia")
        sqlite.prepare("DELETE FROM projects WHERE id=?").run(row.id);
  }
});
it("eliminar el proyecto conserva evaluaciones y sus versiones privadas", async () => {
  const p = fixture(),
    evaluation = evaluationSchema.parse({
      id: "grade-" + randomUUID(),
      projectId: p.id,
      authorId: "u",
      title: "Evaluación de prueba",
      targetType: "project",
      date: "2026-10-19",
      criteria: [{ name: "Criterio", score: 1, max: 2 }],
      notes: "Versión privada inicial",
    });
  try {
    await saveProject(p);
    await saveEvaluationVersion(evaluation, "u");
    await saveEvaluationVersion(
      { ...evaluation, notes: "Versión privada corregida" },
      "u",
    );
    await mutateGlobal(
      "deleteProject",
      { id: p.id, confirmName: p.name },
      actor,
    );
    expect(
      sqlite
        .prepare("SELECT COUNT(*) n FROM evaluations WHERE id=?")
        .get(evaluation.id),
    ).toMatchObject({ n: 1 });
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) n FROM evaluation_versions WHERE evaluation_id=?",
        )
        .get(evaluation.id),
    ).toMatchObject({ n: 2 });
    expect(
      sqlite.prepare("SELECT id FROM retained_projects WHERE id=?").get(p.id),
    ).toMatchObject({ id: p.id });
  } finally {
    sqlite.prepare("DELETE FROM projects WHERE id=?").run(p.id);
    sqlite.prepare("DELETE FROM evaluations WHERE id=?").run(evaluation.id);
    sqlite
      .prepare("DELETE FROM evaluation_versions WHERE evaluation_id=?")
      .run(evaluation.id);
    sqlite.prepare("DELETE FROM retained_projects WHERE id=?").run(p.id);
    sqlite.prepare("DELETE FROM global_audit WHERE actor_id=?").run(actor.id);
  }
});
it("el límite de entrada cuenta bytes reales aunque falte Content-Length", async () => {
  const request = new Request("http://localhost/test", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(30));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
  await expect(boundedRequest(request, 20)).rejects.toThrow(/tamaño/);
});
