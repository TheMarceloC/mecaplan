import { sqlite } from "../src/server/repositories/database";
import { projectSchema } from "../src/lib/model";
import { normalizeProjectCodes } from "../src/lib/codes";
import { audit } from "../src/server/repositories";
let changed = 0;
sqlite.exec("BEGIN IMMEDIATE");
try {
  for (const row of sqlite.prepare("SELECT id,payload FROM projects").all() as {
    id: string;
    payload: string;
  }[]) {
    const p = projectSchema.parse(JSON.parse(row.payload)),
      before = JSON.stringify(p),
      codes = p.activities.map((a) => ({
        id: a.id,
        code: a.code,
        teamId: a.teamId,
      }));
    normalizeProjectCodes(p);
    if (JSON.stringify(p) === before) continue;
    audit(
      p,
      "Sistema",
      "Actualizó códigos por equipo",
      p.name,
      codes,
      p.activities.map((a) => ({
        id: a.id,
        code: a.code,
        aliases: a.aliases ?? [],
      })),
    );
    sqlite
      .prepare("UPDATE projects SET payload=? WHERE id=?")
      .run(JSON.stringify(projectSchema.parse(p)), p.id);
    changed++;
  }
  sqlite.exec("COMMIT");
  console.log(
    `Códigos y prefijos actualizados en ${changed} proyectos. Identidades, asignaciones y alias conservados.`,
  );
} catch (e) {
  sqlite.exec("ROLLBACK");
  throw e;
}
