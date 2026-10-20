import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/github/webhook/route";
import { sqlite } from "../src/server/repositories/database";
import { projectSchema, activitySchema } from "../src/lib/model";
import { controlSchema } from "../src/lib/phase-schema";
async function main() {
  const id = "webhook-test-" + randomUUID(),
    secret = randomBytes(32).toString("hex"),
    before = {
      enabled: process.env.ENABLE_LOCAL_WEBHOOK,
      secret: process.env.GITHUB_WEBHOOK_SECRET,
    };
  const p = projectSchema.parse({
    id,
    name: id,
    description: "Evento simulado local",
    start: "2026-10-19",
    weeks: 8,
    status: "planning",
    teams: [{ id: "software", name: "Programación", color: "#03AED2" }],
    members: [],
    comments: [],
    history: [],
    activities: [
      activitySchema.parse({
        id: "task",
        code: "ACT-1",
        title: "Tarea de simulación",
        teamId: "software",
        status: "Pendiente",
        priority: "Media",
        start: "2026-10-19",
        end: "2026-10-19",
        duration: 1,
        responsible: [],
        accountable: "",
      }),
    ],
    control: controlSchema.parse({
      repositories: [
        { id: "repo", teamId: "software", fullName: id + "/simulado" },
      ],
    }),
  });
  const payload = {
    repository: { full_name: id + "/simulado" },
    commits: [
      {
        id: "a".repeat(40),
        message: "ACT-1 implementación de prueba",
        timestamp: new Date().toISOString(),
        url: "https://github.com/" + id + "/simulado/commit/" + "a".repeat(40),
        author: { name: "Simulador local" },
      },
    ],
  };
  async function send(value: unknown, event = "push", valid = true) {
    const body = JSON.stringify(value),
      signature =
        "sha256=" +
        createHmac("sha256", valid ? secret : "incorrecto")
          .update(body)
          .digest("hex");
    return POST(
      new NextRequest("http://localhost/api/github/webhook", {
        method: "POST",
        headers: { "x-github-event": event, "x-hub-signature-256": signature },
        body,
      }),
    );
  }
  const read = () =>
    JSON.parse(
      (
        sqlite.prepare("SELECT payload FROM projects WHERE id=?").get(id) as {
          payload: string;
        }
      ).payload,
    );
  try {
    sqlite
      .prepare("INSERT INTO projects VALUES(?,?)")
      .run(id, JSON.stringify(p));
    process.env.ENABLE_LOCAL_WEBHOOK = "1";
    process.env.GITHUB_WEBHOOK_SECRET = secret;
    assert.equal((await send(payload, "push", false)).status, 401);
    assert.equal((await send(payload)).status, 200);
    assert.equal(read().activities[0].status, "En progreso");
    assert.equal(read().control.commits.length, 1);
    await send(payload);
    assert.equal(read().control.commits.length, 1);
    payload.commits[0].id = "b".repeat(40);
    payload.commits[0].message = "ACT-1 #done";
    await send(payload);
    assert.equal(read().activities[0].status, "En progreso");
    assert.equal(read().control.changes[0].value, "Hecha");
    const pr = {
      repository: payload.repository,
      pull_request: {
        head: { sha: "c".repeat(40) },
        title: "ACT-1 revisión",
        updated_at: new Date().toISOString(),
        html_url: "https://github.com/" + id + "/simulado/pull/1",
        user: { login: "simulador" },
      },
    };
    assert.equal((await send(pr, "pull_request")).status, 200);
    assert.equal(read().control.changes[1].value, "En revisión");
    assert.equal((await send(payload, "ping")).status, 202);
    process.env.ENABLE_LOCAL_WEBHOOK = "0";
    assert.equal((await send(payload)).status, 503);
    console.log(
      "Webhook: firma, rechazo, push, PR, deduplicación y sugerencias verificados sin internet.",
    );
  } finally {
    sqlite.prepare("DELETE FROM projects WHERE id=?").run(id);
    for (const [key, value] of Object.entries({
      ENABLE_LOCAL_WEBHOOK: before.enabled,
      GITHUB_WEBHOOK_SECRET: before.secret,
    }))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
