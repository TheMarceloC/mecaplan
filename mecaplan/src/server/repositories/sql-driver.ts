import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient } from "pg";
import { sqlite } from "./sqlite";

export type SqlResult = { rows: Record<string, any>[]; changes: number };
export interface SqlDriver {
  dialect: "sqlite" | "postgres";
  query(text: string, values: unknown[]): Promise<SqlResult>;
  transaction<T>(work: (driver: SqlDriver) => Promise<T>): Promise<T>;
}
const context = new AsyncLocalStorage<SqlDriver>();
const inTransaction = new AsyncLocalStorage<boolean>();
export const postgresEnabled = () =>
  process.env.MECAPLAN_DATABASE === "postgres" || process.env.VERCEL === "1";
const shared = globalThis as unknown as { mecaPgPool?: Pool };

function pool() {
  if (!process.env.DATABASE_URL)
    throw Error(
      "Configura DATABASE_URL de Supabase; no se permite SQLite en Vercel.",
    );
  const url = new URL(process.env.DATABASE_URL);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  return (shared.mecaPgPool ??= new Pool({
    connectionString: url.toString(),
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    // TLS certificate verification stays enabled; supply the Supabase CA when needed.
    ssl: {
      rejectUnauthorized: true,
      ...(process.env.DATABASE_SSL_CA
        ? { ca: process.env.DATABASE_SSL_CA.replaceAll("\\n", "\n") }
        : {}),
    },
  }));
}

/** Only translate the parameter markers and three legacy expressions we emit. Never user SQL. */
export function postgresSql(text: string) {
  let index = 0;
  let quoted = false;
  let output = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'") {
      if (quoted && text[i + 1] === "'") {
        output += "''";
        i++;
        continue;
      }
      quoted = !quoted;
    }
    output += c === "?" && !quoted ? "$" + ++index : c;
  }
  return output
    .replace(
      /json_extract\(projects\.payload,'\$\.version'\)/g,
      "(projects.payload::jsonb->>'version')::integer",
    )
    .replace(/ORDER BY rowid DESC/g, "ORDER BY sequence DESC");
}
function pgDriver(client?: PoolClient): SqlDriver {
  return {
    dialect: "postgres",
    async query(text, values) {
      // SET LOCAL avoids dependence on session state in transaction-pooling mode.
      const connection = client ?? (await pool().connect());
      try {
        if (!client) await connection.query("BEGIN");
        await connection.query("SET LOCAL search_path TO mecaplan, pg_catalog");
        const result = await connection.query(postgresSql(text), values);
        if (!client) await connection.query("COMMIT");
        return { rows: result.rows, changes: result.rowCount ?? 0 };
      } catch (error) {
        if (!client) await connection.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        if (!client) connection.release();
      }
    },
    async transaction(work) {
      if (client) return work(pgDriver(client));
      const connection = await pool().connect();
      try {
        await connection.query("BEGIN");
        await connection.query("SET LOCAL search_path TO mecaplan, pg_catalog");
        const result = await work(pgDriver(connection));
        await connection.query("COMMIT");
        return result;
      } catch (error) {
        await connection.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}
const localDriver: SqlDriver = {
  dialect: "sqlite",
  async query(text, values) {
    const stmt = sqlite.prepare(text);
    if (/^\s*(SELECT|WITH|PRAGMA)/i.test(text))
      return {
        rows: stmt.all(...(values as never[])) as Record<string, any>[],
        changes: 0,
      };
    const result = stmt.run(...(values as never[]));
    return { rows: [], changes: Number(result.changes) };
  },
  async transaction(work) {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = await work(localDriver);
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
};
const driver = () =>
  context.getStore() ?? (postgresEnabled() ? pgDriver() : localDriver);
export const databaseDialect = () => driver().dialect;
export async function transaction<T>(work: () => Promise<T>): Promise<T> {
  if (inTransaction.getStore()) return work();
  return driver().transaction((d) =>
    context.run(d, () => inTransaction.run(true, work)),
  );
}
/** Scoped driver injection also lets the PostgreSQL engine exercise the real repositories in tests. */
export function withSqlDriver<T>(value: SqlDriver, work: () => Promise<T>) {
  return context.run(value, work);
}
export const sql = {
  prepare(text: string) {
    return {
      async all(...values: unknown[]) {
        return (await driver().query(text, values)).rows;
      },
      async get(...values: unknown[]) {
        return (await driver().query(text, values)).rows[0];
      },
      async run(...values: unknown[]) {
        return { changes: (await driver().query(text, values)).changes };
      },
    };
  },
};
export async function closeDatabasePool() {
  await shared.mecaPgPool?.end();
  shared.mecaPgPool = undefined;
}
