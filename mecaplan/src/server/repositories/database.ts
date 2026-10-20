import { drizzle } from "drizzle-orm/sqlite-proxy";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "./sql-driver";
export { sql, transaction, databaseDialect } from "./sql-driver";
export { sqlite } from "./sqlite";
export const users = sqliteTable("users", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  globalRole: text("global_role").notNull(),
  status: text().notNull(),
  username: text(),
  isInstructor: integer("is_instructor", { mode: "boolean" })
    .notNull()
    .default(false),
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(false),
});
export const projects = sqliteTable("projects", {
  id: text().primaryKey(),
  payload: text().notNull(),
});
export const sessions = sqliteTable("sessions", {
  id: text().primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const db = drizzle(async (query, params, method) => {
  const stmt = sql.prepare(query);
  if (method === "run") {
    await stmt.run(...params);
    return { rows: [] };
  }
  if (method === "get") {
    const row = await stmt.get(...params);
    return { rows: row ? Object.values(row) : [] };
  }
  return { rows: (await stmt.all(...params)).map((row) => Object.values(row)) };
});
