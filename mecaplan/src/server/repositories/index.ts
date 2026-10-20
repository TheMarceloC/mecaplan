import { normalizeProjectCodes } from "../../lib/codes";
import { eq, or } from "drizzle-orm";
import { sql, db, users, projects } from "./database";
import { projectSchema, type Project, type User } from "../../lib/model";
import { canonical, RevisionConflict } from "@/lib/revisions";
export async function allUsers() {
  return (await db.select().from(users)) as User[];
}
export async function findUser(email: string) {
  return (
    await db
      .select()
      .from(users)
      .where(or(eq(users.email, email), eq(users.username, email)))
  )[0] as User | undefined;
}
export async function userById(id: string) {
  return (await db.select().from(users).where(eq(users.id, id)))[0] as
    | User
    | undefined;
}
export async function saveUser(u: User) {
  await sql
    .prepare(
      "INSERT INTO users(id,name,email,password_hash,global_role,status,username,is_instructor,must_change_password) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,password_hash=excluded.password_hash,global_role=excluded.global_role,status=excluded.status,username=excluded.username,is_instructor=excluded.is_instructor,must_change_password=excluded.must_change_password",
    )
    .run(
      u.id,
      u.name,
      u.email,
      u.passwordHash,
      u.globalRole,
      u.status,
      u.username ?? null,
      Number(u.isInstructor ?? false),
      Number(u.mustChangePassword ?? false),
    );
}
export async function allProjects(): Promise<Project[]> {
  return (await db.select().from(projects)).map((p) =>
    normalizeProjectCodes(projectSchema.parse(JSON.parse(p.payload))),
  );
}
export async function saveProject(
  p: Project,
  options: { overwrite?: boolean } = {},
) {
  const current = (await sql
    .prepare("SELECT payload FROM projects WHERE id=?")
    .get(p.id)) as { payload: string } | undefined;
  const expected =
    options.overwrite && current
      ? (JSON.parse(current.payload).version ?? 0)
      : (p.version ?? 0);
  const valid = projectSchema.parse(
    normalizeProjectCodes({ ...p, version: expected + 1 }),
  );
  // Each activity has its own edit revision. Comments do not invalidate a draft.
  const previous = current
    ? normalizeProjectCodes(projectSchema.parse(JSON.parse(current.payload)))
    : undefined;
  for (const activity of valid.activities) {
    const old = previous?.activities.find((a) => a.id === activity.id);
    activity.revision = !old
      ? 1
      : (old.revision ?? 0) + (canonical(old) === canonical(activity) ? 0 : 1);
  }
  const result = await sql
    .prepare(
      "INSERT INTO projects(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE COALESCE(json_extract(projects.payload,'$.version'),0)=?",
    )
    .run(p.id, JSON.stringify(valid), expected);
  if (!result.changes)
    throw new RevisionConflict(
      "El proyecto cambió en otra sesión. Actualiza la página y vuelve a guardar.",
    );
  p.version = valid.version;
  p.activities = valid.activities;
}
export function audit(
  p: Project,
  actor: string,
  action: string,
  entity: string,
  before: unknown,
  after: unknown,
) {
  p.history.unshift({
    id: crypto.randomUUID(),
    actor,
    action,
    entity,
    date: new Date().toISOString(),
    before: JSON.stringify(before),
    after: JSON.stringify(after),
  });
}
