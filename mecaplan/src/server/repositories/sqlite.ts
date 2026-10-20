import { dataDirectory } from "../data-directory";
import { DatabaseSync } from "node:sqlite";

import { mkdirSync } from "node:fs";
import { join } from "node:path";
const globalDb = globalThis as unknown as { mecaSqlite?: DatabaseSync };
function getDatabase(): DatabaseSync {
  if (
    process.env.VERCEL === "1" ||
    process.env.MECAPLAN_DATABASE === "postgres"
  )
    throw Error("SQLite no esta habilitado en el backend PostgreSQL.");
  if (globalDb.mecaSqlite) return globalDb.mecaSqlite;
  mkdirSync(dataDirectory(), { recursive: true });
  const connection = new DatabaseSync(join(dataDirectory(), "mecaplan.sqlite"));
  connection.exec(
    "PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;",
  );
  connection.exec("BEGIN IMMEDIATE");
  try {
    connection.exec(`
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,global_role TEXT NOT NULL,status TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
`);
    const columns = new Set(
      (
        connection.prepare("PRAGMA table_info(users)").all() as {
          name: string;
        }[]
      ).map((c) => c.name),
    );
    if (!columns.has("username"))
      connection.exec("ALTER TABLE users ADD COLUMN username TEXT");
    if (!columns.has("is_instructor"))
      connection.exec(
        "ALTER TABLE users ADD COLUMN is_instructor INTEGER NOT NULL DEFAULT 0",
      );
    if (!columns.has("must_change_password"))
      connection.exec(
        "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
      );
    connection.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username) WHERE username IS NOT NULL; CREATE TABLE IF NOT EXISTS evaluations(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,author_id TEXT NOT NULL,payload TEXT NOT NULL);",
    );
    connection.exec(
      `CREATE TABLE IF NOT EXISTS global_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,date TEXT NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS import_previews(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL,base_hash TEXT NOT NULL,file_hash TEXT NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS storage_connections(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS oauth_states(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL,payload TEXT NOT NULL);`,
    );

    connection.exec(`
 CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS evaluation_versions(id TEXT PRIMARY KEY,evaluation_id TEXT NOT NULL,project_id TEXT NOT NULL,actor_id TEXT NOT NULL,date TEXT NOT NULL,payload TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS evaluation_versions_evaluation ON evaluation_versions(evaluation_id,date);
 CREATE TABLE IF NOT EXISTS retained_projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,deleted_at TEXT NOT NULL,deleted_by TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS storage_operations(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,actor_id TEXT NOT NULL,date TEXT NOT NULL,payload TEXT NOT NULL);
 INSERT OR IGNORE INTO schema_migrations VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
`);

    connection.exec("COMMIT");
    globalDb.mecaSqlite = connection;
    return connection;
  } catch (error) {
    try {
      connection.exec("ROLLBACK");
    } finally {
      connection.close();
    }
    throw error;
  }
}
// Importing a Route Handler during build must not open or migrate the installation DB.
const sqlite = new Proxy({} as DatabaseSync, {
  get(_target, key) {
    const connection = getDatabase();
    const value = Reflect.get(connection, key);
    return typeof value === "function" ? value.bind(connection) : value;
  },
});

export { sqlite };
