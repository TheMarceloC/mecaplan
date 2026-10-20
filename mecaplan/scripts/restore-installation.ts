import { readFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
async function main() {
  const source = path.resolve(process.argv[2] ?? ""),
    destination = process.argv[3] ? path.resolve(process.argv[3]) : "";
  if (!process.argv[2] || !destination)
    throw Error(
      "Uso: pnpm exec tsx scripts/restore-installation.ts CARPETA_RESPALDO CARPETA_NUEVA",
    );
  if (existsSync(destination))
    throw Error(
      "El destino debe ser una carpeta nueva para no sobrescribir datos.",
    );
  const manifest = z
    .object({
      format: z.literal("mecaplan-installation-v1"),
      files: z.array(
        z.object({
          path: z.string(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          bytes: z.number().int().nonnegative(),
        }),
      ),
    })
    .parse(
      JSON.parse(
        await readFile(path.join(source, "backup-manifest.json"), "utf8"),
      ),
    );
  for (const item of manifest.files) {
    const file = path.resolve(source, item.path);
    if (!file.startsWith(source + path.sep))
      throw Error("El manifiesto contiene una ruta no válida.");
    const bytes = await readFile(file);
    if (
      bytes.length !== item.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== item.sha256
    )
      throw Error("El respaldo no coincide con su manifiesto.");
    const target = path.resolve(destination, item.path);
    if (!target.startsWith(destination + path.sep))
      throw Error("Destino no válido.");
  }
  await mkdir(destination, { recursive: true });
  for (const item of manifest.files) {
    const target = path.resolve(destination, item.path);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.resolve(source, item.path), target);
  }
  const db = new DatabaseSync(path.join(destination, "mecaplan.sqlite"), {
    readOnly: true,
  });
  try {
    const check = db.prepare("PRAGMA integrity_check").get() as {
      integrity_check: string;
    };
    if (check.integrity_check !== "ok")
      throw Error("La base restaurada no supera integrity_check.");
  } finally {
    db.close();
  }
  console.log(
    "Copia restaurada y verificada en " +
      destination +
      ". Usa MECAPLAN_DATA_DIR para abrirla; conserva la instalación original.",
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
