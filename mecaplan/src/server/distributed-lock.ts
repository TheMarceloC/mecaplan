import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { databaseDialect, sql } from "./repositories/sql-driver";
const held = new AsyncLocalStorage<Set<string>>();
const leaseMs = 120000;
/** Persisted leases serialize separate Vercel instances; CAS still protects project payloads. */
export async function withDistributedLock<T>(
  name: string,
  work: () => Promise<T>,
): Promise<T> {
  if (databaseDialect() !== "postgres" || held.getStore()?.has(name))
    return work();
  const owner = randomUUID(),
    deadline = Date.now() + 10000;
  while (true) {
    const now = Date.now();
    const result = await sql
      .prepare(
        "INSERT INTO app_locks(name,owner,expires_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE app_locks.expires_at<?",
      )
      .run(name, owner, now + leaseMs, now);
    if (result.changes) break;
    if (Date.now() >= deadline)
      throw Error(
        "Otra operación está en curso. Inténtalo de nuevo en unos segundos.",
      );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  let lost = false;
  const timer = setInterval(() => {
    void sql
      .prepare("UPDATE app_locks SET expires_at=? WHERE name=? AND owner=?")
      .run(Date.now() + leaseMs, name, owner)
      .then((r) => {
        if (!r.changes) lost = true;
      })
      .catch(() => {
        lost = true;
      });
  }, 15000);
  timer.unref();
  try {
    const result = await held.run(
      new Set([...(held.getStore() ?? []), name]),
      work,
    );
    if (lost)
      throw Error(
        "No se pudo confirmar el bloqueo de la operación. Revisa el resultado antes de reintentar.",
      );
    return result;
  } finally {
    clearInterval(timer);
    await sql
      .prepare("DELETE FROM app_locks WHERE name=? AND owner=?")
      .run(name, owner);
  }
}
