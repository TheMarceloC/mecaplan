import { createHash, createDecipheriv } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { projectSchema } from "@/lib/model";
import { validateProjectStructure } from "@/lib/control";
import { sql, transaction, databaseDialect } from "./repositories/sql-driver";

export const migrationColumns = {
  users: [
    "id",
    "name",
    "email",
    "password_hash",
    "global_role",
    "status",
    "username",
    "is_instructor",
    "must_change_password",
  ],
  projects: ["id", "payload"],
  evaluations: ["id", "project_id", "author_id", "payload"],
  evaluation_versions: [
    "id",
    "evaluation_id",
    "project_id",
    "actor_id",
    "date",
    "payload",
  ],
  retained_projects: ["id", "name", "deleted_at", "deleted_by"],
  global_audit: ["id", "actor_id", "action", "date", "payload"],
  storage_connections: ["id", "payload"],
  storage_operations: ["id", "project_id", "actor_id", "date", "payload"],
} as const;
export type MigrationTable = keyof typeof migrationColumns;
export type MigrationSnapshot = Record<MigrationTable, Record<string, any>[]>;
export function readLocalSnapshot(file: string): MigrationSnapshot {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec("BEGIN");
    if (
      (db.prepare("PRAGMA integrity_check").get() as any).integrity_check !==
      "ok"
    )
      throw Error("La base de origen no es íntegra.");
    const result = {} as MigrationSnapshot;
    for (const [table, columns] of Object.entries(migrationColumns)) {
      const exists = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      result[table as MigrationTable] = exists
        ? (db
            .prepare(
              `SELECT ${columns.join(",")} FROM ${table} ORDER BY ${table === "evaluation_versions" ? "rowid" : "id"}`,
            )
            .all() as Record<string, any>[])
        : [];
    }
    db.exec("COMMIT");
    return result;
  } finally {
    db.close();
  }
}
export function migrationPlan(data: MigrationSnapshot) {
  const users = new Set(data.users.map((u) => u.id));
  const localFiles: { projectId: string; fileId: string }[] = [];
  for (const row of data.projects) {
    const p = projectSchema.parse(JSON.parse(row.payload));
    validateProjectStructure(p);
    if (p.members.some((m) => !users.has(m.id)))
      throw Error(
        "Hay miembros sin cuenta en el origen; corrige el diagnóstico antes de migrar.",
      );
    for (const file of p.control?.files ?? [])
      if (file.provider !== "onedrive")
        localFiles.push({ projectId: p.id, fileId: file.id });
  }
  return {
    tables: Object.fromEntries(
      Object.entries(data).map(([table, rows]) => [table, rows.length]),
    ),
    localFiles,
    ready: localFiles.length === 0,
    sessionsMigrated: false,
  };
}
function digest(rows: Record<string, any>[], columns: readonly string[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [...rows]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((r) => columns.map((c) => r[c] ?? null)),
      ),
    )
    .digest("hex");
}
export function verifyCloudTokenKey(data: MigrationSnapshot) {
  const cache = data.storage_connections.find((r) => r.id === "onedrive-cache");
  if (!cache) return;
  const key = Buffer.from(process.env.ONEDRIVE_TOKEN_KEY ?? "", "base64"),
    bytes = Buffer.from(cache.payload, "base64");
  if (key.length !== 32)
    throw Error(
      "Configura la misma ONEDRIVE_TOKEN_KEY del origen antes de migrar los tokens.",
    );
  try {
    const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    cipher.update(bytes.subarray(28));
    cipher.final();
  } catch {
    throw Error(
      "ONEDRIVE_TOKEN_KEY no corresponde al caché cifrado del origen.",
    );
  }
}
export async function migrateSnapshot(data: MigrationSnapshot) {
  const plan = migrationPlan(data);
  if (!plan.ready)
    throw Error(
      "Quedan documentos locales. Migra los archivos a OneDrive desde la instalación local antes de copiar la base a Supabase.",
    );
  if (databaseDialect() !== "postgres")
    throw Error("La migración requiere PostgreSQL como destino.");
  verifyCloudTokenKey(data);
  return transaction(async () => {
    for (const table of Object.keys(migrationColumns) as MigrationTable[]) {
      const count = await sql
        .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
        .get();
      if (Number(count?.n) !== 0)
        throw Error(
          "El destino no está vacío. No se sobrescribirán datos existentes.",
        );
    }
    const verified: Record<string, number> = {};
    for (const table of Object.keys(migrationColumns) as MigrationTable[]) {
      const columns = migrationColumns[table];
      for (const row of data[table])
        await sql
          .prepare(
            `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
          )
          .run(...columns.map((c) => row[c] ?? null));
      const copy = await sql
        .prepare(`SELECT ${columns.join(",")} FROM ${table} ORDER BY id`)
        .all();
      if (digest(copy, columns) !== digest(data[table], columns))
        throw Error(
          "La verificación de datos migrados no coincide; se revierte la transacción.",
        );
      verified[table] = copy.length;
    }
    return { verified, sessionsMigrated: false };
  });
}
