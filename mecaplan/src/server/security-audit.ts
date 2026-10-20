import { randomUUID } from "node:crypto";
import { sql } from "./repositories/database";
/** Explicit safe metadata only. Passwords, tokens and private evaluations never belong here. */
export async function securityAudit(
  actorId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  await sql
    .prepare("INSERT INTO global_audit VALUES(?,?,?,?,?)")
    .run(
      randomUUID(),
      actorId,
      action,
      new Date().toISOString(),
      JSON.stringify(metadata),
    );
}
