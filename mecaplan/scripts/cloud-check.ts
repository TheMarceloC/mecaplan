import { sql, closeDatabasePool } from "../src/server/repositories/sql-driver";
import "./load-cloud-env";
async function main() {
  // Linking existing OneDrive files does not require Microsoft OAuth credentials.
  const automaticUploads = [
    "MICROSOFT_TENANT_ID",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
  ].some((k) => !!process.env[k]);
  const missing = [
    "DATABASE_URL",
    ...(automaticUploads
      ? [
          "MICROSOFT_TENANT_ID",
          "MICROSOFT_CLIENT_ID",
          "MICROSOFT_CLIENT_SECRET",
          "ONEDRIVE_REDIRECT_URI",
          "ONEDRIVE_TOKEN_KEY",
        ]
      : []),
  ].filter((k) => !process.env[k]);
  if (missing.length)
    throw Error(
      "Falta configuración: " +
        missing.join(", ") +
        ". Revisa .env.vercel.example.",
    );
  if (process.env.MECAPLAN_DATABASE !== "postgres")
    throw Error("MECAPLAN_DATABASE debe ser postgres.");
  if (automaticUploads) {
    const callback = new URL(process.env.ONEDRIVE_REDIRECT_URI!);
    if (
      callback.protocol !== "https:" ||
      ["localhost", "127.0.0.1"].includes(callback.hostname) ||
      callback.pathname !== "/api/onedrive/callback"
    )
      throw Error(
        "Configura el callback HTTPS del dominio definitivo de Vercel.",
      );
    if (Buffer.from(process.env.ONEDRIVE_TOKEN_KEY!, "base64").length !== 32)
      throw Error("ONEDRIVE_TOKEN_KEY debe contener 32 bytes en base64.");
  }
  if (process.env.ENABLE_DEMO !== "0") throw Error("Configura ENABLE_DEMO=0.");
  if (process.argv.includes("--database")) {
    try {
      const version = await sql
        .prepare("SELECT version FROM schema_migrations WHERE version=2")
        .get();
      if (!version)
        throw Error("Aplica el esquema PostgreSQL antes de desplegar.");
      const connected = await sql
        .prepare(
          "SELECT COUNT(*) AS n FROM storage_connections WHERE id IN ('onedrive-cache','onedrive-account')",
        )
        .get();
      if (Number(connected?.n) && !automaticUploads)
        throw Error(
          "Hay una conexión OneDrive guardada. Conserva su configuración de Microsoft y cifrado o desconéctala antes de usar solo enlaces.",
        );
      const users = await sql
        .prepare(
          "SELECT COUNT(*) AS n FROM users WHERE is_instructor=1 AND status='active'",
        )
        .get();
      if (!Number(users?.n))
        throw Error(
          "Migra los usuarios, incluido el ingeniero, antes de desplegar.",
        );
      const projects = await sql.prepare("SELECT payload FROM projects").all();
      if (
        projects.some((p) =>
          (JSON.parse(p.payload).control?.files ?? []).some(
            (f: any) => f.provider !== "onedrive",
          ),
        )
      )
        throw Error("Hay documentos locales pendientes de migrar a OneDrive.");
      console.log("Conexión, esquema y datos de despliegue verificados.");
    } finally {
      await closeDatabasePool();
    }
  }
  console.log(
    `Configuración de nube verificada. OneDrive: ${automaticUploads ? "subida automática" : "enlaces manuales"}. Los secretos no se imprimen.`,
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Falló la comprobación.");
  process.exitCode = 1;
});
