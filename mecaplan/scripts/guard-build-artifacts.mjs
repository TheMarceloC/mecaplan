import fs from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  dist = path.resolve(root, process.env.BUILD_OUT || ".next");
if (!dist.startsWith(root + path.sep))
  throw Error("El directorio de compilación debe estar dentro del proyecto.");
const privateDirs = ["data", "outputs", "work", "backups", "test-results"].map(
  (p) => path.resolve(root, p) + path.sep,
);
const key = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
function isPrivate(file) {
  return privateDirs.some((p) => key(file).startsWith(key(p)));
}
async function walk(folder) {
  const files = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const p = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(p)));
    else if (entry.name.endsWith(".nft.json")) files.push(p);
  }
  return files;
}
let checked = 0,
  removed = 0;
for (const file of await walk(dist)) {
  const trace = JSON.parse(await fs.readFile(file, "utf8"));
  const safe = trace.files.filter(
    (p) => !isPrivate(path.resolve(path.dirname(file), p)),
  );
  removed += trace.files.length - safe.length;
  checked++;
  if (safe.length !== trace.files.length)
    await fs.writeFile(file, JSON.stringify({ ...trace, files: safe }));
}
if (!checked)
  throw Error("No se encontraron manifiestos de compilación para verificar.");
console.log(
  `Manifiestos verificados: ${checked}. Referencias a datos privados excluidas: ${removed}.`,
);
