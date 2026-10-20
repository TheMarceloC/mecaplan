import { loadImportWorkbook } from "../src/server/excel-import";
import { importSheets } from "../src/lib/import-format";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { sqlite } from "../src/server/repositories/database";
import { projectSchema, activitySchema } from "../src/lib/model";
import { controlSchema } from "../src/lib/phase-schema";
import { unlink } from "node:fs/promises";
import { filePath } from "../src/server/uploads";

// Disposable users and project exercise the real HTTP routes without touching class data.
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000",
  tag = "test-" + randomUUID(),
  password = randomBytes(24).toString("base64url"),
  ids = ["admin", "teacher", "member", "outsider"].map((x) => tag + "-" + x),
  createdFiles: string[] = [];
let checks = 0;
const p = projectSchema.parse({
  id: tag,
  name: tag,
  description: "Prueba temporal",
  start: "2026-10-19",
  weeks: 7,
  status: "planning",
  teams: [
    { id: "a", name: "Equipo A", color: "#05065C" },
    { id: "b", name: "Equipo B", color: "#03AED2" },
  ],
  members: ids.slice(0, 3).map((id, i) => ({
    id,
    name: "Prueba " + i,
    teamId: i === 2 ? "b" : "a",
    role: i === 2 ? "member" : "admin",
    lead: i === 0,
  })),
  activities: [
    activitySchema.parse({
      id: "task",
      code: "ACT-1",
      title: "Actividad temporal",
      teamId: "a",
      status: "Pendiente",
      priority: "Media",
      start: "2026-10-19",
      end: "2026-10-19",
      duration: 1,
      responsible: [ids[0]],
      accountable: ids[0],
    }),
    activitySchema.parse({
      id: "task2",
      code: "ACT-2",
      title: "Segunda actividad",
      teamId: "b",
      status: "Pendiente",
      priority: "Media",
      start: "2026-10-19",
      end: "2026-10-19",
      duration: 1,
      responsible: [ids[2]],
      accountable: ids[2],
    }),
  ],
  comments: [],
  history: [],
  control: controlSchema.parse({ requireCrossReview: true }),
});
const cookies: string[] = [];
async function api(who: number, action: string, data: unknown, ok = true) {
  if (["submitEvidence", "reviewActivity", "savePlan"].includes(action)) {
    const payload = await (
      await fetch(base + "/api/app", {
        headers: { cookie: cookies[who] ?? "" },
      })
    ).json();
    const current = payload.projects.find((p: { id: string }) => p.id === tag);
    if (current && data && typeof data === "object") {
      const d = data as {
        id?: string;
        revision?: number;
        activities?: { id: string; revision?: number }[];
      };
      if (d.id && d.revision === undefined)
        d.revision =
          current.activities.find((a: { id: string }) => a.id === d.id)
            ?.revision ?? 0;
      for (const item of d.activities ?? [])
        if (item.revision === undefined)
          item.revision =
            current.activities.find((a: { id: string }) => a.id === item.id)
              ?.revision ?? 0;
    }
  }
  const r = await fetch(base + "/api/app", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: base,
        ...(cookies[who] ? { cookie: cookies[who] } : {}),
      },
      body: JSON.stringify({ action, projectId: tag, data }),
    }),
    j = await r.json();
  assert.equal(r.ok, ok, `${action}: ${JSON.stringify(j)}`);
  checks++;
  if (r.headers.get("set-cookie"))
    cookies[who] = r.headers.get("set-cookie")!.split(";")[0];
  return j;
}
async function get(who: number, path: string, status = 200) {
  const r = await fetch(base + path, {
    headers: { cookie: cookies[who] },
    redirect: "manual",
  });
  assert.equal(r.status, status, path);
  checks++;
  return r;
}
async function main() {
  try {
    const h = await hash(password, 12);
    for (let i = 0; i < 4; i++)
      sqlite
        .prepare(
          "INSERT INTO users(id,name,email,password_hash,global_role,status,username,is_instructor,must_change_password) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          ids[i],
          "Prueba " + i,
          ids[i] + "@example.invalid",
          h,
          i < 2 ? "superuser" : "user",
          "active",
          ids[i],
          i === 1 ? 1 : 0,
          i === 0 ? 1 : 0,
        );
    sqlite
      .prepare("INSERT INTO projects VALUES(?,?)")
      .run(p.id, JSON.stringify(p));
    for (let i = 0; i < 4; i++)
      await api(i, "login", { email: ids[i], password });
    const gated = await (await get(0, "/api/app")).json();
    assert.deepEqual(gated.projects, []);
    checks++;
    await api(0, "saveBaseline", {}, false);
    await api(0, "changePassword", {
      oldPassword: password,
      password: password + "new",
    });
    await api(0, "saveBudgetItem", {
      id: "part",
      teamId: "a",
      category: "Material",
      name: "Partida temporal",
      quantity: 2,
      unitPriceCents: 100,
    });
    await api(2, "addExpense", {
      id: "temporary",
      teamId: "b",
      amountCents: 75,
      date: "2026-10-19",
      paidBy: ids[0],
      description: "Gasto temporal",
      status: "approved",
    });
    let data = await (await get(0, "/api/app")).json(),
      project = data.projects.find((x: { id: string }) => x.id === tag),
      expense = project.control.expenses[0];
    assert.equal(expense.status, "pending");
    assert.equal(expense.paidBy, ids[2]);
    checks += 2;
    await api(
      2,
      "decideExpense",
      { id: expense.id, status: "approved" },
      false,
    );
    await api(0, "decideExpense", { id: expense.id, status: "approved" });
    await api(0, "status", { id: "task", status: "Hecha" }, false);
    await api(0, "submitEvidence", {
      id: "task",
      evidence: ["https://example.invalid/evidencia"],
    });
    await api(0, "reviewActivity", { id: "task" }, false);
    await api(2, "reviewActivity", { id: "task" });
    await api(0, "status", { id: "task", status: "Hecha" });
    await api(
      0,
      "saveActivity",
      { ...p.activities[0], dependencies: ["missing"] },
      false,
    );
    await api(
      0,
      "savePlan",
      {
        activities: [
          { id: "task", duration: 2, dependencies: ["task2"] },
          { id: "task2", duration: 1, dependencies: ["task"] },
        ],
        applyDates: true,
      },
      false,
    );
    const preview = await api(0, "previewPlan", {
      activities: [{ id: "task2", duration: 3, dependencies: ["task"] }],
      applyDates: true,
    });
    assert.equal(preview.after.duration, 4);
    checks++;
    await api(0, "savePlan", {
      activities: [{ id: "task2", duration: 3, dependencies: ["task"] }],
      applyDates: true,
    });
    await api(0, "saveBaseline", {});
    const evaluation = {
      id: tag + "-grade",
      projectId: tag,
      authorId: ids[0],
      title: "Calificación privada temporal",
      targetType: "project",
      date: "2026-10-19",
      criteria: [{ name: "Criterio", score: 1, max: 2 }],
      notes: "PRIVATE-GRADE-" + tag,
      published: true,
    };
    await api(0, "saveEvaluation", evaluation, false);
    await api(1, "saveEvaluation", evaluation);
    await get(0, "/api/evaluations?projectId=" + tag, 403);
    const grades = await (
      await get(1, "/api/evaluations?projectId=" + tag)
    ).json();
    assert.ok(JSON.stringify(grades).includes(evaluation.notes));
    checks++;
    await api(0, "resetPassword", { userId: ids[1] }, false);
    const context = await (
      await get(0, `/api/export?projectId=${tag}&format=context-json`)
    ).text();
    assert.ok(
      !context.includes(evaluation.notes) &&
        !context.includes("@example.invalid") &&
        !context.includes("passwordHash"),
    );
    checks++;
    const upload = await fetch(base + "/api/files", {
        method: "POST",
        headers: {
          origin: base,
          cookie: cookies[0],
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: tag,
          activityId: "task",
          name: "Evidencia temporal en OneDrive",
          url: "https://unit-test.sharepoint.com/documento-temporal",
        }),
      }),
      u = await upload.json();
    assert.equal(upload.status, 200, JSON.stringify(u));
    checks++;
    data = await (await get(0, "/api/app")).json();
    project = data.projects.find((x: { id: string }) => x.id === tag);
    const fid = project.control.files[0].id;
    createdFiles.push(fid);
    await get(2, "/api/files/" + fid, 302);
    await get(3, "/api/files/" + fid, 404);
    const backup = await (
      await get(0, `/api/export?projectId=${tag}&format=backup`)
    ).json();
    assert.ok(!JSON.stringify(backup).includes(evaluation.notes));
    checks++;
    const invalidBackup = structuredClone(backup);
    invalidBackup.project.activities[0].parentId = "task2";
    invalidBackup.project.activities[1].parentId = "task";
    await api(0, "restoreProject", invalidBackup, false);
    await api(0, "restoreProject", backup);
    data = await (await get(0, "/api/app")).json();
    const restored = data.projects.find(
      (x: { name: string }) => x.name === tag + " · restaurado",
    );
    assert.ok(restored);
    createdFiles.push(
      ...restored.control.files.map((f: { id: string }) => f.id),
    );
    await get(0, "/api/files/" + restored.control.files[0].id, 302);
    await api(0, "cloneProject", {
      id: tag,
      name: tag + " clone",
      weeks: 9,
      scale: true,
    });
    await api(0, "createTemplate", { name: tag + " template", weeks: 8 });
    const teamData = {
      team: {
        id: "testing",
        name: "Pruebas",
        color: "#7870B8",
        codePrefix: "PRU",
      },
      memberIds: [],
      leaderId: "",
    };
    await api(2, "saveTeam", teamData, false);
    await api(0, "saveTeam", teamData);
    await api(
      0,
      "saveTeam",
      {
        ...teamData,
        team: { ...teamData.team, id: "duplicate", name: "Otro equipo" },
      },
      false,
    );
    const wb = await loadImportWorkbook(
      await readFile("public/plantilla-mecaplan.xlsx"),
    );
    const setRow = (key: string, values: Record<string, unknown>) => {
      const spec = importSheets.find((s) => s.key === key)!;
      wb.getWorksheet(spec.name)!.getRow(2).values = spec.headers.map(
        (h) => values[h] ?? null,
      ) as never;
    };
    setRow("activities", {
      Referencia: "HTTP-A-1",
      Título: "Actividad HTTP importada",
      Equipo: "Pruebas",
      Fecha: "2026-10-19",
      Inicio: "2026-10-19",
      Duración: 2,
      Responsables: "Prueba 0",
      Aprobador: "Prueba 0",
    });
    setRow("budget", {
      Referencia: "HTTP-B-1",
      Nombre: "Partida HTTP importada",
      Equipo: "Pruebas",
      Categoría: "Material",
      Cantidad: 2,
      "Precio unitario": 2.5,
    });
    setRow("expenses", {
      Referencia: "HTTP-G-1",
      Descripción: "Gasto HTTP importado",
      Equipo: "Pruebas",
      Fecha: "2026-10-19",
      Importe: 1.25,
      Partida: "HTTP-B-1",
    });
    setRow("risks", {
      Referencia: "HTTP-R-1",
      Descripción: "Riesgo HTTP importado",
      Probabilidad: 3,
      Impacto: 4,
    });
    for (const key of [
      "weekly",
      "meeting",
      "reception",
      "acceptance",
      "checklist",
    ])
      setRow(key, {
        Referencia: "HTTP-" + key,
        Título: "Registro HTTP " + key,
        Fecha: "2026-10-19",
        Equipo: "Pruebas",
      });
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    async function previewImport() {
      const f = new FormData();
      f.set("projectId", tag);
      f.set("mode", "upsert");
      f.set("file", new Blob([buffer]), "prueba.xlsx");
      const r = await fetch(base + "/api/import", {
          method: "POST",
          headers: { origin: base, cookie: cookies[0] },
          body: f,
        }),
        j = await r.json();
      assert.equal(r.status, 200, JSON.stringify(j));
      assert.deepEqual(j.errors, []);
      assert.equal(j.changes.length, 9);
      checks += 3;
      return j;
    }
    async function confirmImport(
      who: number,
      token: string,
      expected: boolean,
    ) {
      const r = await fetch(base + "/api/import", {
          method: "POST",
          headers: {
            origin: base,
            cookie: cookies[who],
            "content-type": "application/json",
          },
          body: JSON.stringify({ projectId: tag, token, confirm: true }),
        }),
        j = await r.json();
      assert.equal(r.ok, expected, JSON.stringify(j));
      checks++;
      return j;
    }
    const initialPreview = await previewImport();
    await confirmImport(1, initialPreview.token, false);
    await api(0, "comment", {
      activityId: "task",
      body: "Actualización después de la vista previa",
    });
    await confirmImport(0, initialPreview.token, false);
    const validPreview = await previewImport();
    await confirmImport(0, validPreview.token, true);
    await confirmImport(0, validPreview.token, false);
    data = await (await get(0, "/api/app")).json();
    project = data.projects.find((x: { id: string }) => x.id === tag);
    assert.equal(
      project.activities.find(
        (a: { importKey: string }) => a.importKey === "HTTP-A-1",
      ).code,
      "PRU-001",
    );
    assert.equal(project.control.records.length, 5);
    assert.equal(
      project.control.expenses.find(
        (e: { importKey: string }) => e.importKey === "HTTP-G-1",
      ).status,
      "pending",
    );
    checks += 3;
    const secondPreview = await previewImport();
    assert.equal(
      secondPreview.summary.updated + (secondPreview.summary.unchanged ?? 0),
      9,
    );
    checks++;
    await confirmImport(0, secondPreview.token, true);
    const importedRecord = project.control.records[0];
    await api(2, "deleteRecord", { id: importedRecord.id }, false);
    await api(0, "deleteRecord", { id: importedRecord.id });
    await api(2, "removeFileLink", { id: fid }, false);
    await api(0, "removeFileLink", { id: fid });
    await get(0, "/api/files/" + fid, 404);
    const storage = await (await get(0, "/api/onedrive")).json();
    assert.equal(typeof storage.connected, "boolean");
    checks++;
    const forbiddenDrive = await fetch(base + "/api/onedrive", {
      method: "POST",
      headers: {
        origin: base,
        cookie: cookies[2],
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "connect" }),
    });
    assert.equal(forbiddenDrive.status, 403);
    checks++;
    await api(2, "deleteProject", { id: tag, confirmName: tag }, false);
    await api(
      0,
      "deleteProject",
      { id: tag, confirmName: "incorrecto" },
      false,
    );
    await api(0, "deleteProject", { id: tag, confirmName: tag });
    assert.equal(
      (
        sqlite
          .prepare("SELECT COUNT(*) n FROM evaluations WHERE project_id=?")
          .get(tag) as { n: number }
      ).n,
      1,
    );
    assert.equal(
      (
        sqlite
          .prepare("SELECT COUNT(*) n FROM import_previews WHERE project_id=?")
          .get(tag) as { n: number }
      ).n,
      0,
    );
    checks += 2;
    const template = await get(3, "/plantilla-mecaplan.xlsx");
    assert.equal((await template.arrayBuffer()).byteLength > 1000, true);
    checks++;
    const webhook = await fetch(base + "/api/github/webhook", {
      method: "POST",
      body: "{}",
    });
    assert.equal(webhook.status, 503);
    checks++;
    console.log(
      `Integración HTTP: ${checks} comprobaciones correctas; datos temporales eliminados.`,
    );
  } finally {
    for (const row of sqlite
      .prepare("SELECT id,payload FROM projects")
      .all() as { id: string; payload: string }[]) {
      const project = JSON.parse(row.payload);
      if (project.name.startsWith(tag))
        sqlite.prepare("DELETE FROM projects WHERE id=?").run(row.id);
    }
    sqlite.prepare("DELETE FROM evaluations WHERE id=?").run(tag + "-grade");
    sqlite
      .prepare("DELETE FROM evaluation_versions WHERE project_id=?")
      .run(tag);
    sqlite.prepare("DELETE FROM retained_projects WHERE id=?").run(tag);
    for (const id of ids) {
      sqlite.prepare("DELETE FROM global_audit WHERE actor_id=?").run(id);
      sqlite.prepare("DELETE FROM import_previews WHERE user_id=?").run(id);
      sqlite.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      sqlite.prepare("DELETE FROM users WHERE id=?").run(id);
    }
    for (const id of createdFiles) await unlink(filePath(id)).catch(() => {});
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
