import { dataDirectory } from "./data-directory";
import fs from "node:fs/promises";
import path from "node:path";
import { postgresEnabled } from "./repositories/sql-driver";
export const uploadDirectory = () => path.join(dataDirectory(), "uploads");
export const maxUpload = () =>
  Math.min(
    (postgresEnabled() ? 3 : 50) * 1024 * 1024,
    Math.max(1024, Number(process.env.MAX_UPLOAD_BYTES) || 10 * 1024 * 1024),
  );
export function filePath(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
    throw Error("Identificador de archivo no válido.");
  return path.join(uploadDirectory(), id + ".bin");
}
export function detectUpload(name: string, bytes: Uint8Array) {
  const ext = path.extname(name).toLowerCase(),
    head = Buffer.from(bytes.subarray(0, 32));
  if (bytes.length > maxUpload())
    throw Error("El archivo supera el límite de tamaño configurado.");
  if (ext === ".pdf" && head.subarray(0, 5).toString() === "%PDF-")
    return "application/pdf";
  if (
    ext === ".png" &&
    head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    [".jpg", ".jpeg"].includes(ext) &&
    head[0] === 255 &&
    head[1] === 216 &&
    head[2] === 255
  )
    return "image/jpeg";
  if (
    ext === ".webp" &&
    head.subarray(0, 4).toString() === "RIFF" &&
    head.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  if (ext === ".xlsx" && head[0] === 80 && head[1] === 75)
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (
    [".txt", ".md", ".csv", ".step", ".stp", ".stl"].includes(ext) &&
    !bytes.subarray(0, 4096).includes(0)
  )
    return "text/plain";
  throw Error(
    "Tipo no permitido o contenido que no corresponde al archivo. Usa PDF, imagen, XLSX o texto/STEP/STL ASCII.",
  );
}
export async function storeUpload(id: string, bytes: Uint8Array) {
  if (postgresEnabled())
    throw Error(
      "En la nube los documentos se conservan en OneDrive. Migra los archivos locales antes de restaurar este respaldo.",
    );
  await fs.mkdir(uploadDirectory(), { recursive: true });
  await fs.writeFile(filePath(id), bytes, { flag: "wx" });
}
