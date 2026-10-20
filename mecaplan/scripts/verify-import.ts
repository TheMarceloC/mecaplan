import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compare } from "bcryptjs";
import { sqlite } from "../src/server/repositories/database";
async function main() {
  const credentials = JSON.parse(
    await readFile("data/generated-credentials.json", "utf8"),
  ) as { id: string; password: string }[];
  assert.equal(credentials.length, 18);
  assert.equal(new Set(credentials.map((c) => c.password)).size, 18);
  for (const c of credentials) {
    const u = sqlite
      .prepare(
        "SELECT password_hash,must_change_password FROM users WHERE id=?",
      )
      .get(c.id) as { password_hash: string; must_change_password: number };
    assert.ok(u);
    assert.ok(await compare(c.password, u.password_hash));
    assert.equal(u.must_change_password, 1);
  }
  const p = JSON.parse(
    (
      sqlite
        .prepare("SELECT payload FROM projects WHERE id=?")
        .get("digit360") as { payload: string }
    ).payload,
  );
  assert.equal(p.members.length, 18);
  assert.equal(p.activities.length, 25);
  assert.equal(p.control.matrixSheets.length, 11);
  assert.equal(p.control.budget.length, 0);
  assert.ok(p.activities.every((a: { unscheduled: boolean }) => a.unscheduled));
  const adminIds = p.members
    .filter((m: { teamId: string }) => m.teamId === "software")
    .map((m: { id: string }) => m.id);
  assert.equal(adminIds.length, 6);
  for (const id of adminIds) {
    const u = sqlite
      .prepare("SELECT global_role,is_instructor FROM users WHERE id=?")
      .get(id) as { global_role: string; is_instructor: number };
    assert.equal(u.global_role, "superuser");
    assert.equal(u.is_instructor, 0);
  }
  const teacher = sqlite
    .prepare(
      "SELECT name,email,global_role,is_instructor FROM users WHERE id=?",
    )
    .get("digit-instructor") as {
    name: string;
    email: string;
    global_role: string;
    is_instructor: number;
  };
  assert.equal(teacher.name, "Juan Miguel Mejía Saavedra");
  assert.equal(teacher.email, "juan.mejia@unitec.edu.hn");
  assert.equal(teacher.global_role, "superuser");
  assert.equal(teacher.is_instructor, 1);
  assert.equal(
    p.control.integrationLeadId,
    credentials.find((c) => c.id === p.control.integrationLeadId)?.id,
  );
  assert.equal(
    p.members.find((m: { id: string }) => m.id === p.control.integrationLeadId)
      .name,
    "Carlos Marcelo Alvarado",
  );
  assert.equal(
    (
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM evaluations WHERE project_id=?")
        .get("digit360") as { n: number }
    ).n,
    0,
  );
  console.log(
    "Importación verificada: 18 hashes y cambios iniciales, 6 administradores de Programación, docente privado, 25 actividades y 11 hojas. Sin notas ni precios inventados.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
