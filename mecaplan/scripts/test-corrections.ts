import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { writeFile } from "node:fs/promises";
import { sqlite } from "../src/server/repositories/database";
import { projectSchema, activitySchema } from "../src/lib/model";
import { controlSchema } from "../src/lib/phase-schema";
import { weeklyLoads } from "../src/lib/control";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3212",
  tag = "independent-" + randomUUID();
const ids = [tag + "-student", tag + "-teacher"],
  password = randomBytes(30).toString("base64url");
const cookies: string[] = [],
  report: Record<string, unknown> = {};
const p = projectSchema.parse({
  id: tag,
  name: tag,
  description: "Revisión independiente sintética",
  start: "2026-10-19",
  weeks: 8,
  status: "planning",
  teams: [
    {
      id: "software",
      name: "Programación",
      color: "#05065C",
      codePrefix: "PRO",
    },
    {
      id: "electronics",
      name: "Electrónica",
      color: "#03AED2",
      codePrefix: "ELE",
    },
  ],
  members: ids.map((id, i) => ({
    id,
    name: "Persona de prueba " + i,
    teamId: i ? "electronics" : "software",
    role: "admin",
    lead: true,
  })),
  activities: [
    activitySchema.parse({
      id: "task",
      code: "PRO-001",
      title: "Tarea de prueba",
      description: "Descripción inicial",
      teamId: "software",
      status: "Pendiente",
      priority: "Media",
      start: "2026-10-19",
      end: "2026-10-19",
      duration: 1,
      responsible: [ids[0]],
      accountable: ids[0],
    }),
  ],
  comments: [],
  history: [],
  control: controlSchema.parse({}),
});
async function api(
  who: number,
  action: string,
  data: unknown,
  projectId = tag,
) {
  const r = await fetch(base + "/api/app", {
      method: "POST",
      headers: {
        origin: base,
        "content-type": "application/json",
        cookie: cookies[who] ?? "",
      },
      body: JSON.stringify({ action, projectId, data }),
    }),
    j = await r.json();
  if (r.headers.get("set-cookie"))
    cookies[who] = r.headers.get("set-cookie")!.split(";")[0];
  return { status: r.status, data: j };
}
async function project(who = 0, id = tag) {
  const r = await fetch(base + "/api/app", {
      headers: { cookie: cookies[who] },
    }),
    j = await r.json();
  return j.projects.find((p: { id: string }) => p.id === id);
}
async function main() {
  try {
    const digest = await hash(password, 12);
    for (let i = 0; i < 2; i++)
      sqlite
        .prepare(
          "INSERT INTO users(id,name,email,password_hash,global_role,status,username,is_instructor,must_change_password) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          ids[i],
          "Persona sintética " + i,
          ids[i] + "@example.invalid",
          digest,
          "superuser",
          "active",
          ids[i],
          i,
          0,
        );
    sqlite
      .prepare("INSERT INTO projects VALUES(?,?)")
      .run(p.id, JSON.stringify(p));
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await api(i, "login", { email: ids[i], password })).status,
        200,
      );
    const first = await project(0),
      second = await project(1);
    const a = await api(0, "saveActivity", {
      ...first.activities[0],
      description: "Cambio reciente de la primera sesión",
    });
    const b = await api(1, "saveActivity", {
      ...second.activities[0],
      title: "Título desde una pestaña desactualizada",
    });
    assert.equal(a.status, 200);
    assert.equal(b.status, 409);
    const final = await project();
    assert.equal(
      final.activities[0].description,
      "Cambio reciente de la primera sesión",
    );
    report.lostUpdate = {
      firstStatus: a.status,
      staleStatus: b.status,
      firstRevision: first.version ?? 0,
      finalRevision: final.version,
      expectedDescription: "Cambio reciente de la primera sesión",
      actualDescription: final.activities[0].description,
      corrected:
        a.status === 200 &&
        b.status === 409 &&
        final.activities[0].description ===
          "Cambio reciente de la primera sesión",
    };
    const milestone = {
      id: "milestone",
      title: "Hito aprobado de prueba",
      date: "2026-10-23",
      points: 5,
      criteria: "Criterio revisado por docente",
      approved: true,
    };
    assert.equal((await api(1, "saveMilestone", milestone)).status, 200);
    const ordinary = await api(0, "saveMilestone", {
      ...milestone,
      points: 100,
      criteria: "Criterio cambiado por estudiante",
      approved: true,
    });
    const edited = await project();
    assert.equal(edited.control.milestones[0].approved, false);
    const response = await fetch(
        base + "/api/export?projectId=" + tag + "&format=backup",
        { headers: { cookie: cookies[0] } },
      ),
      backup = await response.json();
    backup.project.control.milestones[0] = {
      ...backup.project.control.milestones[0],
      points: 100,
      criteria: "Criterio sin revisión docente",
      approved: true,
      approvedBy: ids[1],
      approvedAt: new Date().toISOString(),
    };
    const restored = await api(0, "restoreProject", backup);
    const app = await (
      await fetch(base + "/api/app", { headers: { cookie: cookies[0] } })
    ).json();
    const restoredProject = app.projects.find(
      (x: { name: string }) => x.name === tag + " · restaurado",
    );
    report.restoreApproval = {
      ordinaryEditStatus: ordinary.status,
      ordinaryEditApproved: edited.control.milestones[0].approved,
      restoreStatus: restored.status,
      restoredApproved: restoredProject?.control.milestones[0].approved,
      restoredPoints: restoredProject?.control.milestones[0].points,
      restoredApprovedByTeacher:
        restoredProject?.control.milestones[0].approvedBy === ids[1],
      corrected:
        restored.status === 200 &&
        restoredProject?.control.milestones[0].approved === false,
    };
    assert.equal(restored.status, 200);
    assert.equal(restoredProject.control.milestones[0].approved, false);
    assert.equal(restoredProject.control.milestones[0].approvedBy, "");
    const e = {
      id: tag + "-evaluation",
      projectId: tag,
      authorId: ids[1],
      title: "Evaluación privada sintética",
      targetType: "project",
      date: "2026-10-19",
      criteria: [{ name: "Prueba", score: 1, max: 2 }],
      notes: "Primera versión privada",
      published: false,
    };
    assert.equal((await api(1, "saveEvaluation", e)).status, 200);
    assert.equal(
      (
        await api(1, "saveEvaluation", {
          ...e,
          notes: "Segunda versión privada",
        })
      ).status,
      200,
    );
    const before = await (
      await fetch(
        base + "/api/evaluations?projectId=" + tag + "&history=" + e.id,
        { headers: { cookie: cookies[1] } },
      )
    ).json();
    assert.equal(
      (await api(0, "deleteProject", { id: tag, confirmName: tag })).status,
      200,
    );
    const history = await fetch(
        base +
          "/api/evaluations?archive=1&projectId=" +
          tag +
          "&history=" +
          e.id,
        { headers: { cookie: cookies[1] } },
      ),
      archive = await (
        await fetch(base + "/api/evaluations?archive=1", {
          headers: { cookie: cookies[1] },
        })
      ).json();
    const retainedHistory = await history.json();
    assert.equal(history.status, 200);
    assert.equal(retainedHistory.versions.length, 2);
    const denied = await fetch(
      base + "/api/evaluations?archive=1&projectId=" + tag + "&history=" + e.id,
      { headers: { cookie: cookies[0] } },
    );
    assert.equal(denied.status, 403);
    report.archivedHistory = {
      versionsBeforeDelete: before.versions.length,
      historyStatusAfterDelete: history.status,
      archiveReturnsLatest: archive.evaluations.some(
        (x: { id: string }) => x.id === e.id,
      ),
      archiveReturnsVersions: Array.isArray(archive.versions),
      versionsStillInDatabase: (
        sqlite
          .prepare(
            "SELECT COUNT(*) n FROM evaluation_versions WHERE evaluation_id=?",
          )
          .get(e.id) as { n: number }
      ).n,
    };
    const load = structuredClone(p);
    load.activities[0].duration = 30;
    load.activities[0].effortDays = 1;
    load.activities[0].end = "2026-11-27";
    const weeks = weeklyLoads(load)[0].weeks.map((w) => w.days);
    assert.ok(Math.abs(weeks.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    report.loadRounding = {
      effort: 1,
      weeklyDisplayed: weeks,
      displayedSum: weeks.reduce((a, b) => a + b, 0),
    };
    await writeFile(
      "work/corrections-results.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    for (const row of sqlite
      .prepare("SELECT id,payload FROM projects")
      .all() as { id: string; payload: string }[])
      if (JSON.parse(row.payload).name.startsWith(tag))
        sqlite.prepare("DELETE FROM projects WHERE id=?").run(row.id);
    for (const table of ["evaluation_versions", "evaluations"])
      sqlite.prepare("DELETE FROM " + table + " WHERE project_id=?").run(tag);
    sqlite.prepare("DELETE FROM retained_projects WHERE id=?").run(tag);
    for (const id of ids) {
      sqlite.prepare("DELETE FROM import_previews WHERE user_id=?").run(id);
      sqlite.prepare("DELETE FROM global_audit WHERE actor_id=?").run(id);
      sqlite.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      sqlite.prepare("DELETE FROM users WHERE id=?").run(id);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
