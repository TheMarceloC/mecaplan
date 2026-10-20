import { DatabaseSync } from "node:sqlite";
import {
  mkdir,
  cp,
  readdir,
  readFile,
  writeFile,
  stat,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { dataDirectory } from "../src/server/data-directory";
async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const source = dataDirectory(),
    destination = path.resolve(
      args[0] ??
        path.join(
          "backups",
          "mecaplan-" + new Date().toISOString().replace(/[:.]/g, "-"),
        ),
    );
  if (!existsSync(path.join(source, "mecaplan.sqlite")))
    throw Error("No existe la base de datos que quieres respaldar.");
  if (existsSync(destination))
    throw Error("La carpeta de destino ya existe. Elige una carpeta nueva.");
  await mkdir(destination, { recursive: true });
  const db = new DatabaseSync(path.join(source, "mecaplan.sqlite"), {
    readOnly: true,
  });
  try {
    db.prepare("VACUUM INTO ?").run(path.join(destination, "mecaplan.sqlite"));
  } finally {
    db.close();
  }
  for (const name of ["uploads", "onedrive-token-key.bin"])
    if (existsSync(path.join(source, name)))
      await cp(path.join(source, name), path.join(destination, name), {
        recursive: true,
        errorOnExist: true,
      });
  const files: { path: string; bytes: number; sha256: string }[] = [];
  async function walk(dir: string) {
    for (const name of await readdir(dir)) {
      const file = path.join(dir, name),
        info = await stat(file);
      if (info.isDirectory()) await walk(file);
      else
        files.push({
          path: path.relative(destination, file).replaceAll("\\", "/"),
          bytes: info.size,
          sha256: createHash("sha256")
            .update(await readFile(file))
            .digest("hex"),
        });
    }
  }
  await walk(destination);
  await writeFile(
    path.join(destination, "backup-manifest.json"),
    JSON.stringify(
      {
        format: "mecaplan-installation-v1",
        created: new Date().toISOString(),
        private: true,
        files,
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(destination, "LEEME_PRIVADO.txt"),
    "Copia privada: contiene cuentas, sesiones, evaluaciones y tokens cifrados de almacenamiento. No la incluyas en el ZIP de distribución. Conserva .env.local por separado. Para una copia consistente de adjuntos detén el servidor antes de ejecutar el respaldo.\n",
  );
  console.log("Respaldo privado creado en " + destination);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
