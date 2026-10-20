import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";
import { dataDirectory } from "../src/server/data-directory";
import { projectSchema } from "../src/lib/model";
import { validateProjectStructure } from "../src/lib/control";
const file = path.join(dataDirectory(), "mecaplan.sqlite");
if (!existsSync(file))
  throw Error(
    "No hay base de datos en esta carpeta. Inicia la aplicación o selecciona MECAPLAN_DATA_DIR.",
  );
const db = new DatabaseSync(file, { readOnly: true });
try {
  const issues: { projectId: string; message: string }[] = [];
  const rows = db.prepare("SELECT id,payload FROM projects").all() as {
    id: string;
    payload: string;
  }[];
  for (const row of rows)
    try {
      const p = projectSchema.parse(JSON.parse(row.payload));
      validateProjectStructure(p);
    } catch (e) {
      issues.push({
        projectId: row.id,
        message: e instanceof Error ? e.message : "Datos no válidos",
      });
    }
  console.log(
    JSON.stringify(
      {
        mode: "solo lectura",
        integrity: db.prepare("PRAGMA integrity_check").all(),
        projects: rows.length,
        issues,
      },
      null,
      2,
    ),
  );
  if (issues.length) process.exitCode = 1;
} finally {
  db.close();
}
