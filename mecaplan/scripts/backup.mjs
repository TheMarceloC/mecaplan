import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
const db = new DatabaseSync("data/mecaplan.sqlite");
if (!existsSync("data/before-phase1b-consistent.sqlite"))
  db.prepare("VACUUM INTO ?").run("data/before-phase1b-consistent.sqlite");
db.close();
console.log("Copia SQLite consistente disponible.");
