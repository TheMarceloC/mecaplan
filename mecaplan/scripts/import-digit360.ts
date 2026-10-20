import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import {
  allProjects,
  findUser,
  saveProject,
  saveUser,
  audit,
} from "../src/server/repositories";
import {
  activitySchema,
  projectSchema,
  today,
  type Person,
} from "../src/lib/model";
import { controlSchema } from "../src/lib/phase-schema";
type Row = { row: number; values: (string | number | null)[] };
type Book = { file: string; sheets: { name: string; rows: Row[] }[] };
async function main() {
  const input = JSON.parse(
    await fs.readFile("data/import-source.json", "utf8"),
  ) as Book[];
  if ((await allProjects()).some((p) => p.id === "digit360")) {
    console.log(
      "Digit 360 ya está cargado. No se regeneran credenciales ni se sobrescriben cambios.",
    );
    return;
  }
  const normalize = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.|\.$/g, "");
  const rows = input[0].sheets[0].rows.filter(
    (r) => typeof r.values[1] === "number",
  );
  const credentials: {
    name: string;
    team: string;
    role: string;
    email: string;
    username: string;
    password: string;
    id: string;
  }[] = [];
  let team = "";
  const members: Person[] = [];
  for (const { values: v } of rows) {
    if (v[2]) team = String(v[2]).trim();
    const sourceName = String(v[3]).trim(),
      email = String(v[5] ?? "")
        .trim()
        .toLowerCase();
    const username = normalize(sourceName);
    const lead = /l[ií]der/i.test(String(v[4] ?? ""));
    const software = team === "Programación";
    const name =
      email === "c.marcelo.al@unitec.edu"
        ? "Carlos Marcelo Alvarado"
        : sourceName;
    const existing = await findUser(email || username);
    const id = existing?.id ?? "digit-" + String(v[1]);
    const password = randomBytes(18).toString("base64url") + "!7aA";

    await saveUser({
      id,
      name,
      email: email || username,
      username,
      passwordHash: await hash(password, 12),
      globalRole: software ? "superuser" : "user",
      status: "active",
      isInstructor: false,
      mustChangePassword: true,
    });
    members.push({
      id,
      name,
      teamId:
        team === "Electrónica" ? "electronics" : software ? "software" : "cad",
      role: software ? "admin" : "member",
      lead: lead || email === "c.marcelo.al@unitec.edu",
    });
    credentials.push({
      id,
      name,
      team,
      email,
      username,
      password,
      role: software
        ? email === "c.marcelo.al@unitec.edu"
          ? "Administrador · Líder de integración"
          : "Administrador"
        : lead
          ? "Líder de equipo"
          : "Miembro",
    });
  }
  const instructor = {
    id: "digit-instructor",
    name: "Juan Miguel Mejía Saavedra",
    email: "juan.mejia@unitec.edu.hn",
    username: "juan.mejia",
    password: randomBytes(18).toString("base64url") + "!7aA",
  };
  if (await findUser(instructor.email))
    throw Error("La cuenta del ingeniero ya existe. No se sobrescribió.");
  await saveUser({
    ...instructor,
    passwordHash: await hash(instructor.password, 12),
    globalRole: "superuser",
    status: "active",
    isInstructor: true,
    mustChangePassword: true,
  });
  members.push({
    id: instructor.id,
    name: instructor.name,
    teamId: "instructor",
    role: "admin",
    lead: false,
  });
  credentials.push({
    ...instructor,
    team: "Docente",
    role: "Administrador y evaluador independiente",
  });
  const source = input[1],
    matrix = source.sheets.find((s) => s.name === "Matriz de Proyecto")!;
  const taskRows = matrix.rows.filter(
    (r) => typeof r.values[0] === "string" && /^DIG-\d+$/.test(r.values[0]),
  );
  const leader = members.find(
    (m) =>
      m.id ===
      credentials.find((c) => c.email === "c.marcelo.al@unitec.edu")!.id,
  )!;
  const teamId = (name: string) =>
    name === "Electrónica"
      ? "electronics"
      : name === "Programación"
        ? "software"
        : name === "Manufactura"
          ? "cad"
          : "integration";
  const rolePeople = (key: string) =>
    key === "integration"
      ? [leader]
      : key === "instructor"
        ? [members.at(-1)!]
        : members.filter((m) => m.teamId === key);
  const roleLead = (key: string) =>
    rolePeople(key).find((m) => m.lead) ?? rolePeople(key)[0];
  const activities = taskRows.map(({ row, values: v }) => {
    const teamRaci = Object.fromEntries(
      ["electronics", "software", "cad", "integration", "instructor"].map(
        (key, i) => [key, String(v[i + 6] ?? "")],
      ),
    );
    const accountableKey = Object.keys(teamRaci).find(
      (key) => teamRaci[key] === "A" || teamRaci[key] === "AR",
    );
    const peopleFor = (letter: string) =>
      Object.keys(teamRaci)
        .filter(
          (key) =>
            teamRaci[key] === letter ||
            (letter === "R" && teamRaci[key] === "AR"),
        )
        .flatMap((key) => rolePeople(key).map((m) => m.id));
    return activitySchema.parse({
      id: "digit-" + String(v[0]),
      code: v[0],
      title: v[2],
      description: `${v[1]}\nImportada de Matriz de Proyecto, fila ${row}. RACI personal inicial derivada de los equipos; confirmar en la primera revisión.`,
      teamId: teamId(String(v[3])),
      parentId: null,
      status: "Pendiente",
      priority: v[4],
      start: today(),
      end: today(),
      duration: 1,
      responsible: [...new Set(peopleFor("R"))],
      accountable: accountableKey ? (roleLead(accountableKey)?.id ?? "") : "",
      consulted: [...new Set(peopleFor("C"))],
      informed: [...new Set(peopleFor("I"))],
      teamRaci,
      sourceRow: row,
      unscheduled: true,
      evidence: [],
      reviewerId: "",
      blockedReason: "",
      dependencies: [],
      commits: 0,
      deletedAt: null,
    });
  });
  const fileId = "digit360-original";
  await fs.mkdir("data/uploads", { recursive: true });
  await fs.copyFile(
    path.join("C:/Users/cmarc/Downloads", source.file),
    "data/uploads/" + fileId + ".bin",
  );
  const stat = await fs.stat("data/uploads/" + fileId + ".bin");
  const cron = source.sheets.find((s) => s.name === "Cronograma")!;
  const c = controlSchema.parse({
    integrationLeadId: leader.id,
    requireCrossReview: true,
    currency: "HNL",
    sourceFileId: fileId,
    matrixSheets: source.sheets,
    files: [
      {
        id: fileId,
        name: source.file,
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: stat.size,
        activityId: "",
        uploadedBy: instructor.id,
        date: new Date().toISOString(),
      },
    ],
    milestones: cron.rows
      .filter((r) => r.row >= 9 && r.row <= 15 && r.values[0])
      .map(({ row, values: v }) => ({
        id: "milestone-" + row,
        title: String(v[0]),
        date: row === 15 ? "2026-12-11" : row === 14 ? "2026-12-04" : "",
        points: typeof v[3] === "number" ? v[3] : null,
        criteria: String(v[4] ?? ""),
        approved: false,
      })),
    records: [
      {
        id: "pa1",
        kind: "acceptance",
        title: "PA1 · Encendido y comunicación",
        date: today(),
        teamId: "integration",
        ownerId: leader.id,
        body: "Arranca sin intervención y entrega datos 60 s sin reiniciarse.",
        items: [],
        target: "",
        measurement: "",
        result: "pending",
        evidence: "",
      },
      {
        id: "pa2",
        kind: "acceptance",
        title: "PA2 · Respuesta al estímulo",
        date: today(),
        teamId: "integration",
        ownerId: leader.id,
        body: "Cada variable responde dentro del valor objetivo del equipo.",
        items: [],
        target: "",
        measurement: "",
        result: "pending",
        evidence: "",
      },
      {
        id: "pa3",
        kind: "acceptance",
        title: "PA3 · Salida o visualización",
        date: today(),
        teamId: "integration",
        ownerId: leader.id,
        body: "El indicador responde en el tiempo definido.",
        items: [],
        target: "",
        measurement: "",
        result: "pending",
        evidence: "",
      },
    ],
    importNotes: [
      "Fuente: Matriz_Gestion_Proyecto_Digit360.xlsx; se conservan sus 11 hojas y sus fórmulas como referencia, sin ejecutarlas como instrucciones.",
      "25 tareas importadas. Las fechas y duraciones no estaban definidas: 1 día es una estimación provisional, no un dato del Excel. Todas se marcan Sin planificar.",
      "Las dependencias no estaban definidas y quedan vacías. Confirma un plan antes de usar la fecha CPM como compromiso.",
      "La RACI por equipos se conserva exactamente. Las asignaciones personales iniciales se derivan de los integrantes y líderes del listado; son editables.",
      "Entrega final: 4 diciembre de 2026. MECATÓN: 11 diciembre de 2026. Los demás hitos no tenían fecha.",
      "Daniel Hernandez y Fernando Funes no tenían correo. Se habilitó ingreso por nombre de usuario, sin inventar direcciones.",
      "Carlos Alvarado (c.marcelo.al@unitec.edu) se identifica como Carlos Marcelo Alvarado por instrucción del usuario.",
      "Moneda inicial HNL, editable. No se importaron precios ni gastos inexistentes.",
    ],
  });
  const project = projectSchema.parse({
    id: "digit360",
    name: "Digit 360 · MEC402",
    description:
      "Gestión del proyecto Digit 360: electrónica, programación, manufactura e integración.",
    start: today(),
    weeks: 7,
    status: "planning",
    teams: [
      { id: "electronics", name: "Electrónica", color: "#0F49B6" },
      { id: "software", name: "Programación", color: "#03AED2" },
      { id: "cad", name: "Manufactura", color: "#05065C" },
      { id: "integration", name: "Integración", color: "#7870B8" },
      { id: "instructor", name: "Docente", color: "#4B5266" },
    ],
    members,
    activities,
    comments: [],
    history: [],
    control: c,
  });
  audit(
    project,
    "Importación autorizada",
    "Importó la matriz y los integrantes",
    "Digit 360",
    null,
    {
      students: 17,
      instructor: instructor.name,
      tasks: 25,
      source: source.file,
    },
  );
  await saveProject(project);
  await fs.writeFile(
    "data/generated-credentials.json",
    JSON.stringify(credentials, null, 2),
  );
  console.log(
    "17 estudiantes y 1 ingeniero creados; 25 tareas importadas. Credenciales guardadas en un archivo local privado.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
