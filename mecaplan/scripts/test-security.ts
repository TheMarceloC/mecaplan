import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { sqlite } from "../src/server/repositories/database";
import { projectSchema, activitySchema } from "../src/lib/model";
import { controlSchema } from "../src/lib/phase-schema";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
  tag = "security-" + randomUUID(),
  password = randomBytes(24).toString("base64url"),
  ids = ["admin", "pending", "teacher", "disabled-teacher"].map(
    (s) => tag + "-" + s,
  ),
  cookies: string[] = [];
let checks = 0;
async function api(who: number, action: string, data: unknown, ok = true) {
  const response = await fetch(base + "/api/app", {
      method: "POST",
      headers: {
        origin: base,
        "content-type": "application/json",
        ...(cookies[who] ? { cookie: cookies[who] } : {}),
      },
      body: JSON.stringify({ action, projectId: tag, data }),
    }),
    result = await response.json();
  assert.equal(response.ok, ok, action + ": " + JSON.stringify(result));
  if (response.headers.get("set-cookie"))
    cookies[who] = response.headers.get("set-cookie")!.split(";")[0];
  checks++;
  return result;
}
async function read(who: number, path: string, status = 200) {
  const r = await fetch(base + path, { headers: { cookie: cookies[who] } });
  assert.equal(r.status, status, path);
  checks++;
  return r;
}
async function main() {
  try {
    const h = await hash(password, 12);
    for (let i = 0; i < ids.length; i++)
      sqlite
        .prepare(
          "INSERT INTO users(id,name,email,password_hash,global_role,status,username,is_instructor,must_change_password) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          ids[i],
          "Usuario temporal " + i,
          ids[i] + "@example.invalid",
          h,
          "superuser",
          i === 1 ? "pending" : i === 3 ? "disabled" : "active",
          ids[i],
          i >= 2 ? 1 : 0,
          0,
        );
    const p = projectSchema.parse({
      id: tag,
      name: tag,
      description: "Prueba de seguridad",
      start: "2026-10-19",
      weeks: 8,
      status: "planning",
      teams: [{ id: "s", name: "Programación", color: "#123456" }],
      members: ids.map((id) => ({
        id,
        name: "Usuario temporal",
        teamId: "s",
        role: "admin",
        lead: false,
      })),
      activities: [
        activitySchema.parse({
          id: "a",
          code: "PRO-001",
          title: "Actividad temporal",
          teamId: "s",
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
    sqlite
      .prepare("INSERT INTO projects VALUES(?,?)")
      .run(tag, JSON.stringify(p));
    for (let i = 0; i < 3; i++)
      await api(i, "login", { email: ids[i], password });
    const pending = await (await read(1, "/api/app")).json();
    assert.deepEqual(pending.projects, []);
    assert.deepEqual(pending.users, []);
    checks += 2;
    for (const [action, data] of [
      ["createTemplate", { name: tag + "-forbidden", weeks: 8 }],
      [
        "cloneProject",
        { id: tag, name: tag + "-forbidden", weeks: 8, scale: false },
      ],
      ["deleteProject", { id: tag, confirmName: tag }],
      ["resetPassword", { userId: ids[0] }],
    ] as const)
      await api(1, action, data, false);
    await read(1, "/api/audit", 403);
    await read(1, "/api/evaluations?projectId=" + tag, 403);
    await read(0, "/api/evaluations?archive=1", 403);
    const drive = await fetch(base + "/api/onedrive", {
      method: "POST",
      headers: {
        origin: base,
        cookie: cookies[1],
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "disconnect" }),
    });
    assert.equal(drive.ok, false);
    checks++;
    await api(
      0,
      "assignUser",
      {
        id: ids[3],
        name: "Docente temporal",
        teamId: "s",
        role: "admin",
        lead: false,
      },
      false,
    );
    assert.equal(
      (
        sqlite.prepare("SELECT status FROM users WHERE id=?").get(ids[3]) as {
          status: string;
        }
      ).status,
      "disabled",
    );
    checks++;
    const milestone = {
      id: "h",
      title: "Hito temporal",
      date: "2026-10-19",
      points: 5,
      criteria: "Criterio inicial",
      approved: true,
    };
    await api(2, "saveMilestone", milestone);
    await api(0, "saveMilestone", {
      ...milestone,
      points: 100,
      criteria: "Criterio nuevo",
    });
    let state = await (await read(0, "/api/app")).json();
    assert.equal(
      state.projects.find((p: any) => p.id === tag).control.milestones[0]
        .approved,
      false,
    );
    checks++;
    const evaluation = {
      id: tag + "-grade",
      projectId: tag,
      authorId: ids[2],
      title: "Evaluación temporal",
      targetType: "project",
      date: "2026-10-19",
      criteria: [{ name: "Criterio", score: 1, max: 2 }],
      notes: "PRIVATE-" + tag,
    };
    await api(2, "saveEvaluation", evaluation);
    await api(2, "saveEvaluation", {
      ...evaluation,
      notes: evaluation.notes + "-EDIT",
    });
    await read(0, "/api/evaluations?projectId=" + tag, 403);
    const history = await (
      await read(
        2,
        "/api/evaluations?projectId=" + tag + "&history=" + evaluation.id,
      )
    ).json();
    assert.equal(history.versions.length, 2);
    checks++;
    const context = await (
      await read(0, "/api/export?projectId=" + tag + "&format=context-json")
    ).text();
    assert.equal(context.includes(evaluation.notes), false);
    checks++;
    await api(0, "deleteProject", { id: tag, confirmName: tag });
    const archive = await (await read(2, "/api/evaluations?archive=1")).json();
    assert.ok(
      archive.evaluations.some(
        (e: any) =>
          e.id === evaluation.id && e.notes === evaluation.notes + "-EDIT",
      ),
    );
    checks++;
    const blocked = sqlite
      .prepare("SELECT count(*) n FROM password_resets WHERE user_id=?")
      .get(ids[0]) as { n: number };
    assert.equal(blocked.n, 0);
    checks++;
    console.log(
      `Regresión de seguridad: ${checks} comprobaciones correctas con cuentas temporales.`,
    );
  } finally {
    for (const table of ["projects", "retained_projects"])
      sqlite.prepare("DELETE FROM " + table + " WHERE id=?").run(tag);
    for (const table of [
      "evaluations",
      "evaluation_versions",
      "import_previews",
    ])
      sqlite.prepare("DELETE FROM " + table + " WHERE project_id=?").run(tag);
    for (const id of ids) {
      sqlite.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      sqlite.prepare("DELETE FROM password_resets WHERE user_id=?").run(id);
      sqlite.prepare("DELETE FROM global_audit WHERE actor_id=?").run(id);
      sqlite.prepare("DELETE FROM users WHERE id=?").run(id);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
