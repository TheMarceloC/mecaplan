import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  postgresSql,
  withSqlDriver,
  transaction,
  sql,
  type SqlDriver,
} from "../src/server/repositories/sql-driver";
import {
  allProjects,
  saveProject,
  saveUser,
  findUser,
  userById,
} from "../src/server/repositories";
import { saveEvaluationVersion } from "../src/server/repositories/evaluations";
import { mutateGlobal } from "../src/server/global-service";
import { projectSchema, activitySchema } from "../src/lib/model";
import { evaluationSchema } from "../src/lib/phase-schema";
import {
  migrateSnapshot,
  migrationPlan,
  migrationColumns,
  type MigrationSnapshot,
} from "../src/server/cloud-migration";
import { withDistributedLock } from "../src/server/distributed-lock";
import { demoEnabled } from "../src/server/demo-mode";
import { db, sessions } from "../src/server/repositories/database";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { updateOwnProfile } from "../src/server/account-service";
let pg: PGlite, driver: SqlDriver, migration: string;
function adapter(target: any): SqlDriver {
  return {
    dialect: "postgres",
    async query(text, params) {
      const r = await target.query(postgresSql(text), params);
      return { rows: r.rows, changes: r.affectedRows ?? 0 };
    },
    async transaction(work) {
      return target.transaction
        ? target.transaction((tx: any) => work(adapter(tx)))
        : work(adapter(target));
    },
  };
}
const inPg = <T>(work: () => Promise<T>) => withSqlDriver(driver, work);
function fixture() {
  return projectSchema.parse({
    id: "p",
    name: "Proyecto PostgreSQL",
    description: "",
    start: "2026-10-20",
    weeks: 8,
    status: "planning",
    comments: [],
    history: [],
    teams: [
      { id: "s", name: "Programación", color: "#05065c", codePrefix: "PRO" },
    ],
    members: [
      { id: "u", name: "Estudiante", teamId: "s", role: "admin", lead: true },
    ],
    activities: [
      activitySchema.parse({
        id: "a",
        code: "PRO-001",
        title: "Actividad",
        teamId: "s",
        status: "Pendiente",
        priority: "Media",
        start: "2026-10-20",
        end: "2026-10-20",
        duration: 1,
        responsible: ["u"],
        accountable: "u",
      }),
    ],
  });
}
const user = {
  id: "u",
  name: "Estudiante",
  email: "u@example.invalid",
  passwordHash: "hash-sintetico-preservado",
  globalRole: "superuser" as const,
  status: "active" as const,
  username: "estudiante",
  isInstructor: false,
  mustChangePassword: true,
};
function snapshot(): MigrationSnapshot {
  const data = Object.fromEntries(
    Object.keys(migrationColumns).map((k) => [k, []]),
  ) as unknown as MigrationSnapshot;
  data.users = [
    {
      id: "u",
      name: user.name,
      email: user.email,
      password_hash: user.passwordHash,
      global_role: "superuser",
      status: "active",
      username: "estudiante",
      is_instructor: 0,
      must_change_password: 1,
    },
  ];
  data.projects = [{ id: "p", payload: JSON.stringify(fixture()) }];
  return data;
}
beforeAll(async () => {
  pg = new PGlite();
  migration = await readFile(
    "supabase/migrations/202610200001_mecaplan.sql",
    "utf8",
  );
  await pg.exec(migration);
  await pg.exec("SET search_path TO mecaplan, pg_catalog");
  driver = adapter(pg);
}, 30000);
beforeEach(async () => {
  vi.unstubAllEnvs();
  await pg.exec(
    "RESET ROLE; SET search_path TO mecaplan, pg_catalog; TRUNCATE " +
      Object.keys(migrationColumns).join(",") +
      ",sessions,app_locks",
  );
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await pg.close();
});
it("el cambio de perfil y sus membresías se confirman juntos o revierten en PostgreSQL", () =>
  inPg(async () => {
    const password = "synthetic-postgres-account-password";
    await saveUser({
      ...user,
      mustChangePassword: false,
      passwordHash: await hash(password, 4),
    });
    await saveProject(fixture());
    await pg.exec(
      "CREATE FUNCTION fail_profile_project() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rollback'; END $$; CREATE TRIGGER fail_profile_project BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION fail_profile_project()",
    );
    const input = {
      name: "Nombre nuevo",
      email: "new@example.invalid",
      username: "nuevo.usuario",
      currentPassword: password,
    };
    try {
      await expect(updateOwnProfile(user.id, input)).rejects.toThrow(
        /synthetic rollback/,
      );
      expect(await userById(user.id)).toMatchObject({
        name: user.name,
        email: user.email,
      });
      expect((await allProjects())[0].members[0].name).toBe("Estudiante");
    } finally {
      await pg.exec(
        "DROP TRIGGER fail_profile_project ON projects; DROP FUNCTION fail_profile_project()",
      );
    }
    expect(await updateOwnProfile(user.id, input)).toEqual({
      identityChanged: true,
    });
    expect(await findUser("nuevo.usuario")).toMatchObject({
      name: "Nombre nuevo",
      email: "new@example.invalid",
      globalRole: "superuser",
    });
    expect((await allProjects())[0].members[0].name).toBe("Nombre nuevo");
  }));
it("el esquema PostgreSQL se aplica de forma aditiva e idempotente y protege sus tablas", async () => {
  await pg.exec(migration);
  const r = await pg.query<{ relrowsecurity: boolean }>(
    "SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mecaplan' AND c.relkind='r'",
  );
  expect(r.rows.length).toBeGreaterThan(10);
  expect(r.rows.every((r) => r.relrowsecurity)).toBe(true);
});
it("un rol anónimo no puede consultar cuentas ni notas privadas", async () => {
  await pg.exec("CREATE ROLE anon; SET ROLE anon");
  try {
    await expect(pg.query("SELECT * FROM mecaplan.users")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      pg.query("SELECT * FROM mecaplan.evaluations"),
    ).rejects.toThrow(/permission denied/);
  } finally {
    await pg.exec("RESET ROLE");
  }
});
it("el repositorio conserva hashes, nombre de usuario y banderas de cuenta en PostgreSQL", () =>
  inPg(async () => {
    await saveUser(user);
    expect(await findUser("estudiante")).toMatchObject(user);
    await saveUser({ ...user, name: "Nombre actualizado" });
    expect(await userById("u")).toMatchObject({
      name: "Nombre actualizado",
      passwordHash: user.passwordHash,
      isInstructor: false,
      mustChangePassword: true,
    });
  }));
it("CAS rechaza un agregado obsoleto sin sobrescribir otra edición en PostgreSQL", () =>
  inPg(async () => {
    const p = fixture();
    await saveProject(p);
    const first = structuredClone(p),
      stale = structuredClone(p);
    first.activities[0].title = "Edición reciente";
    await saveProject(first);
    stale.activities[0].title = "Edición obsoleta";
    await expect(saveProject(stale)).rejects.toThrow(/cambió/);
    expect((await allProjects())[0].activities[0].title).toBe(
      "Edición reciente",
    );
  }));
it("la transacción revierte todas las filas si falla una escritura", () =>
  inPg(async () => {
    await expect(
      transaction(async () => {
        await saveUser(user);
        throw Error("fallo simulado");
      }),
    ).rejects.toThrow("fallo simulado");
    expect(await userById("u")).toBeUndefined();
  }));
it("las sesiones conservan sus campos y se pueden revocar en PostgreSQL", () =>
  inPg(async () => {
    await db.insert(sessions).values({
      id: "session-hash",
      userId: "u",
      expiresAt: "2026-10-27T00:00:00.000Z",
    });
    expect(
      (
        await db.select().from(sessions).where(eq(sessions.id, "session-hash"))
      )[0],
    ).toEqual({
      id: "session-hash",
      userId: "u",
      expiresAt: "2026-10-27T00:00:00.000Z",
    });
    await db.delete(sessions).where(eq(sessions.id, "session-hash"));
    expect(await db.select().from(sessions)).toHaveLength(0);
  }));
it("borrar un proyecto conserva sus dos versiones privadas en orden", () =>
  inPg(async () => {
    const p = fixture();
    await saveProject(p);
    const e = evaluationSchema.parse({
      id: "e",
      projectId: p.id,
      authorId: "teacher",
      title: "Evaluación",
      targetType: "project",
      date: "2026-10-20",
      criteria: [{ name: "Criterio", score: 1, max: 2 }],
      notes: "Primera versión privada",
    });
    await saveEvaluationVersion(e, "teacher");
    await saveEvaluationVersion(
      { ...e, notes: "Segunda versión privada" },
      "teacher",
    );
    await mutateGlobal(
      "deleteProject",
      { id: p.id, confirmName: p.name },
      { ...user, mustChangePassword: false },
    );
    const versions = await sql
      .prepare(
        "SELECT payload FROM evaluation_versions WHERE evaluation_id=? ORDER BY rowid DESC",
      )
      .all("e");
    expect(versions).toHaveLength(2);
    expect(JSON.parse(versions[0].payload).notes).toBe(
      "Segunda versión privada",
    );
    expect(await allProjects()).toHaveLength(0);
    expect(
      await sql
        .prepare("SELECT id FROM retained_projects WHERE id=?")
        .get(p.id),
    ).toBeTruthy();
  }));
it("migración verifica datos íntegros, conserva contraseña y rechaza destino ocupado", () =>
  inPg(async () => {
    const data = snapshot();
    const result = await migrateSnapshot(data);
    expect(result.verified.users).toBe(1);
    expect(await userById("u")).toMatchObject(user);
    expect(await sql.prepare("SELECT * FROM sessions").all()).toHaveLength(0);
    await expect(migrateSnapshot(data)).rejects.toThrow(/no está vacío/);
  }));
it("la migración no escribe si faltan documentos por pasar a OneDrive", () =>
  inPg(async () => {
    const data = snapshot(),
      p = JSON.parse(data.projects[0].payload);
    p.control = {
      files: [
        {
          id: "file",
          provider: "local",
          name: "matriz.xlsx",
          mime: "application/octet-stream",
          size: 1,
          uploadedBy: "u",
          date: "2026-10-20",
        },
      ],
    };
    data.projects[0].payload = JSON.stringify(p);
    expect(migrationPlan(data).ready).toBe(false);
    await expect(migrateSnapshot(data)).rejects.toThrow(/OneDrive/);
    expect(await allProjects()).toHaveLength(0);
  }));
it("dos operaciones independientes respetan el bloqueo persistido", () =>
  inPg(async () => {
    const events: string[] = [];
    await Promise.all([
      withDistributedLock("test", async () => {
        events.push("a-inicio");
        await new Promise((r) => setTimeout(r, 30));
        events.push("a-fin");
      }),
      withDistributedLock("test", async () => {
        events.push("b-inicio");
        events.push("b-fin");
      }),
    ]);
    expect(events).toEqual(["a-inicio", "a-fin", "b-inicio", "b-fin"]);
    expect(await sql.prepare("SELECT * FROM app_locks").all()).toHaveLength(0);
  }));
it("el modo PostgreSQL bloquea el acceso de demostración aunque ENABLE_DEMO sea 1", () => {
  vi.stubEnv("MECAPLAN_DATABASE", "postgres");
  vi.stubEnv("ENABLE_DEMO", "1");
  expect(demoEnabled()).toBe(false);
});
it("parámetros y JSON versionado se traducen sin tocar signos dentro de literales", () => {
  expect(postgresSql("SELECT '?' AS text, ? AS value")).toBe(
    "SELECT '?' AS text, $1 AS value",
  );
  expect(
    postgresSql("COALESCE(json_extract(projects.payload,'$.version'),0)=?"),
  ).toContain("(projects.payload::jsonb->>'version')::integer");
});
