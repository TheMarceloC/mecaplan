import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { allProjects, findUser, saveUser, saveProject } from "./index";
import type { Project, Activity } from "../../lib/model";
const offset = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const people = [
  ["demo", "Sofía Martínez", "electronics", "admin", true],
  ["diego", "Diego Ramírez", "electronics", "member", true],
  ["ana", "Ana López", "electronics", "member", false],
  ["carlos", "Carlos Méndez", "software", "member", true],
  ["valeria", "Valeria Ortiz", "software", "member", false],
  ["andres", "Andrés García", "cad", "member", true],
  ["lucia", "Lucía Pérez", "cad", "member", false],
  ["mateo", "Mateo Castillo", "software", "member", false],
  ["elena", "Elena Ruiz", "cad", "member", false],
] as const;
export async function seedDemo(reset = false) {
  if (!(await findUser("demo@mecaplan.local")))
    for (const [id, name] of people)
      await saveUser({
        id,
        name,
        email: `${id}@mecaplan.local`,
        passwordHash: await hash(randomBytes(24).toString("hex"), 10),
        globalRole: "user",
        status: "active",
      });
  if ((await allProjects()).length && !reset) return;
  const teams = [
    { id: "electronics", name: "Electrónica", color: "#0F49B6" },
    { id: "software", name: "Programación", color: "#03AED2" },
    { id: "cad", name: "CAD y Manufactura", color: "#05065C" },
  ];
  const rows: [string, string, Activity["status"], number, string][] = [
    ["Definir requisitos del sistema", "electronics", "Hecha", -25, "demo"],
    ["Diseñar arquitectura electrónica", "electronics", "Hecha", -22, "diego"],
    ["Modelar estructura del brazo", "cad", "Hecha", -18, "andres"],
    ["Seleccionar sensores y actuadores", "electronics", "Hecha", -16, "ana"],
    ["Preparar entorno de firmware", "software", "Hecha", -14, "carlos"],
    ["Validar dimensiones de la PCB", "cad", "Hecha", -10, "lucia"],
    ["Diseñar tarjeta de control", "electronics", "En progreso", 2, "diego"],
    [
      "Implementar lectura de sensores",
      "software",
      "En progreso",
      3,
      "valeria",
    ],
    ["Fabricar piezas del efector final", "cad", "Bloqueada", -2, "andres"],
    [
      "Integrar control de servomotores",
      "software",
      "En revisión",
      5,
      "carlos",
    ],
    ["Revisar esquemático de potencia", "electronics", "En progreso", 1, "ana"],
    ["Ensamblar estructura mecánica", "cad", "Pendiente", 8, "elena"],
    ["Calibrar sistema de visión", "software", "Pendiente", 10, "mateo"],
    ["Integrar subsistemas", "electronics", "Pendiente", 14, "demo"],
    [
      "Ejecutar pruebas de clasificación",
      "software",
      "Pendiente",
      18,
      "carlos",
    ],
    ["Preparar documentación final", "cad", "Pendiente", 24, "lucia"],
  ];
  const activities: Activity[] = rows.map(
    ([title, teamId, status, end, person], i) => ({
      id: `a${i + 1}`,
      code: `ACT-${i + 1}`,
      title,
      description:
        "Entregable del proyecto. Coordinar la revisión con el equipo y documentar los resultados.",
      teamId,
      parentId: null,
      status,
      priority: i === 8 || i === 6 ? "Alta" : "Media",
      start: offset(end - 4),
      end: offset(end),
      duration: 5,
      responsible: [person],
      accountable:
        teamId === "electronics"
          ? "demo"
          : teamId === "software"
            ? "carlos"
            : "andres",
      consulted: [],
      informed: [],
      blockedReason:
        status === "Bloqueada"
          ? "Pendiente de recibir el material para impresión 3D."
          : "",
      dependencies: i ? [`a${i}`] : [],
      commits: teamId === "software" ? (i % 4) + 1 : 0,
      deletedAt: null,
    }),
  );
  const p: Project = {
    id: "robot",
    name: "Brazo robótico clasificador",
    description:
      "Diseño y construcción de un sistema de clasificación automatizada por visión artificial.",
    start: offset(-28),
    weeks: 8,
    status: "active",
    teams,
    members: people.map(([id, name, teamId, role, lead]) => ({
      id,
      name,
      teamId,
      role,
      lead,
    })),
    activities,
    comments: [
      {
        id: "c1",
        activityId: "a9",
        author: "Andrés García",
        body: "El proveedor confirmó la entrega de material para esta semana. Ajustaré la fecha al recibirlo.",
        date: new Date().toISOString(),
      },
    ],
    history: [
      {
        id: "h1",
        actor: "Carlos Méndez",
        action: "Envió a revisión",
        entity: "Integrar control de servomotores",
        date: new Date(Date.now() - 3600000).toISOString(),
        before: "En progreso",
        after: "En revisión",
      },
      {
        id: "h2",
        actor: "Diego Ramírez",
        action: "Actualizó una actividad",
        entity: "Diseñar tarjeta de control",
        date: new Date(Date.now() - 7200000).toISOString(),
        before: "Pendiente",
        after: "En progreso",
      },
      {
        id: "h3",
        actor: "Andrés García",
        action: "Reportó un bloqueo",
        entity: "Fabricar piezas del efector final",
        date: new Date(Date.now() - 10800000).toISOString(),
        before: "En progreso",
        after: "Bloqueada",
      },
    ],
  };
  await saveProject(p, { overwrite: reset });
  await saveProject(
    {
      ...p,
      id: "greenhouse",
      name: "Invernadero inteligente",
      description:
        "Monitoreo y automatización de un invernadero de pequeña escala.",
      weeks: 10,
      start: offset(-7),
      activities: activities.slice(0, 9).map((a, i) => ({
        ...a,
        status: i < 2 ? "Hecha" : "Pendiente",
        title: [
          "Definir variables de monitoreo",
          "Diseñar distribución del invernadero",
          "Seleccionar sensores ambientales",
          "Diseñar sistema de riego",
          "Programar adquisición de datos",
          "Modelar soporte de sensores",
          "Diseñar interfaz de monitoreo",
          "Integrar sistema de ventilación",
          "Validar condiciones ambientales",
        ][i],
        start: offset(i * 3),
        end: offset(i * 3 + 4),
        blockedReason: "",
      })),
      comments: [],
      history: [],
    },
    { overwrite: reset },
  );
}
