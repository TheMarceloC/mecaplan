import { readFile } from "node:fs/promises";
import "./load-cloud-env";
import { Pool } from "pg";
async function main() {
  const file = "supabase/migrations/202610200001_mecaplan.sql";
  if (!process.argv.includes("--apply")) {
    console.log(
      "Esquema preparado en " +
        file +
        ". Usa --apply con DATABASE_URL del proyecto Supabase para aplicarlo.",
    );
    return;
  }
  if (!process.env.DATABASE_ADMIN_URL && !process.env.DATABASE_URL)
    throw Error("Falta DATABASE_URL o DATABASE_ADMIN_URL.");
  const url = new URL(
    process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL!,
  );
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  const pool = new Pool({
    connectionString: url.toString(),
    max: 1,
    ssl: {
      rejectUnauthorized: true,
      ...(process.env.DATABASE_SSL_CA
        ? { ca: process.env.DATABASE_SSL_CA.replaceAll("\\n", "\n") }
        : {}),
    },
  });
  try {
    await pool.query(await readFile(file, "utf8"));
    console.log(
      "Esquema privado mecaplan aplicado. No se importaron usuarios ni proyectos.",
    );
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(
    e instanceof Error ? e.message : "No se pudo preparar el esquema.",
  );
  process.exitCode = 1;
});
