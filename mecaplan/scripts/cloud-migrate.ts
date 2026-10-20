import {
  readLocalSnapshot,
  migrationPlan,
  migrateSnapshot,
} from "../src/server/cloud-migration";
import { closeDatabasePool } from "../src/server/repositories/sql-driver";
import "./load-cloud-env";
async function main() {
  const source = process.argv.find((a) => a.startsWith("--source="))?.slice(9);
  if (!source)
    throw Error(
      "Uso: pnpm run cloud:migrate --source=RUTA_SQLITE [--apply]. Sin --apply sólo analiza el origen.",
    );
  const snapshot = readLocalSnapshot(source),
    plan = migrationPlan(snapshot);
  console.log(JSON.stringify(plan, null, 2));
  if (!process.argv.includes("--apply")) return;
  process.env.MECAPLAN_DATABASE = "postgres";
  try {
    console.log(JSON.stringify(await migrateSnapshot(snapshot), null, 2));
  } finally {
    await closeDatabasePool();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "No se pudo migrar.");
  process.exitCode = 1;
});
