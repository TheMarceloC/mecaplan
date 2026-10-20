import { randomUUID } from "node:crypto";
import { sql, transaction } from "./database";
import { evaluationSchema, type Evaluation } from "@/lib/phase-schema";

export async function saveEvaluationVersion(e: Evaluation, actorId: string) {
  return transaction(async () => {
    const old = (await sql
      .prepare("SELECT payload FROM evaluations WHERE id=?")
      .get(e.id)) as { payload: string } | undefined;
    if (
      old &&
      evaluationSchema.parse(JSON.parse(old.payload)).projectId !== e.projectId
    )
      throw Error("Evaluación no encontrada en este proyecto.");

    if (
      old &&
      !(await sql
        .prepare(
          "SELECT 1 FROM evaluation_versions WHERE evaluation_id=? LIMIT 1",
        )
        .get(e.id))
    ) {
      await sql
        .prepare(
          "INSERT INTO evaluation_versions(id,evaluation_id,project_id,actor_id,date,payload) VALUES(?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          e.id,
          e.projectId,
          evaluationSchema.parse(JSON.parse(old.payload)).authorId,
          new Date().toISOString(),
          old.payload,
        );
    }
    await sql
      .prepare(
        "INSERT INTO evaluations VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,author_id=excluded.author_id",
      )
      .run(e.id, e.projectId, actorId, JSON.stringify(e));
    await sql
      .prepare(
        "INSERT INTO evaluation_versions(id,evaluation_id,project_id,actor_id,date,payload) VALUES(?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        e.id,
        e.projectId,
        actorId,
        new Date().toISOString(),
        JSON.stringify(e),
      );
  });
}
