import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { allProjects, findUser, saveUser, saveProject } from "./index";
import type { Project, Activity } from "../../lib/model";
import { controlSchema } from "../../lib/phase-schema";
import { reschedule } from "../../lib/control";
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
/** Fechas reales coherentes con el estado de cada actividad de ejemplo. */
function withActualDates(a: Activity): Activity {
  if (a.status === "Hecha")
    return { ...a, actualStart: a.start, actualEnd: a.end };
  if (["En progreso", "En revisión", "Bloqueada"].includes(a.status))
    return { ...a, actualStart: a.start, actualEnd: null };
  return a;
}
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
  // Título, equipo, estado, responsable, duración en días hábiles y predecesoras.
  // La red cabe en las 8 semanas del proyecto (ruta crítica de 39 días hábiles):
  // las fechas se calculan con CPM para que coincidan con las dependencias.
  const rows: [string, string, Activity["status"], string, number, number[]][] =
    [
      ["Definir requisitos del sistema", "electronics", "Hecha", "demo", 4, []],
      [
        "Diseñar arquitectura electrónica",
        "electronics",
        "Hecha",
        "diego",
        5,
        [1],
      ],
      ["Modelar estructura del brazo", "cad", "Hecha", "andres", 6, [1]],
      [
        "Seleccionar sensores y actuadores",
        "electronics",
        "Hecha",
        "ana",
        4,
        [2],
      ],
      ["Preparar entorno de firmware", "software", "Hecha", "carlos", 4, [1]],
      ["Validar dimensiones de la PCB", "cad", "Hecha", "lucia", 3, [3]],
      [
        "Diseñar tarjeta de control",
        "electronics",
        "En progreso",
        "diego",
        9,
        [4],
      ],
      [
        "Implementar lectura de sensores",
        "software",
        "En progreso",
        "valeria",
        8,
        [4, 5],
      ],
      [
        "Fabricar piezas del efector final",
        "cad",
        "Bloqueada",
        "andres",
        6,
        [3],
      ],
      [
        "Integrar control de servomotores",
        "software",
        "En revisión",
        "carlos",
        8,
        [5],
      ],
      [
        "Revisar esquemático de potencia",
        "electronics",
        "En progreso",
        "ana",
        8,
        [4],
      ],
      ["Ensamblar estructura mecánica", "cad", "Pendiente", "elena", 5, [9]],
      ["Calibrar sistema de visión", "software", "Pendiente", "mateo", 5, [8]],
      [
        "Integrar subsistemas",
        "electronics",
        "Pendiente",
        "demo",
        6,
        [7, 10, 11, 12],
      ],
      [
        "Ejecutar pruebas de clasificación",
        "software",
        "Pendiente",
        "carlos",
        6,
        [13, 14],
      ],
      ["Preparar documentación final", "cad", "Pendiente", "lucia", 5, [15]],
    ];
  const activities: Activity[] = rows.map(
    ([title, teamId, status, person, duration, after], i) => ({
      id: `a${i + 1}`,
      code: `ACT-${i + 1}`,
      title,
      description:
        "Entregable del proyecto. Coordinar la revisión con el equipo y documentar los resultados.",
      teamId,
      parentId: null,
      status,
      priority: i === 8 || i === 6 ? "Alta" : "Media",
      start: offset(0),
      end: offset(0),
      duration,
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
      dependencies: after.map((n) => `a${n}`),
      commits: teamId === "software" ? (i % 4) + 1 : 0,
      deletedAt: null,
    }),
  );
  // Presupuesto, gastos, riesgos y registros de ejemplo para que todas las
  // secciones tengan contenido al presentar la demostración.
  const control = controlSchema.parse({
    integrationLeadId: "demo",
    budget: [
      {
        id: "b1",
        teamId: "electronics",
        activityId: "a7",
        category: "Electrónica",
        name: "Microcontrolador ESP32-S3",
        quantity: 2,
        unitPriceCents: 38000,
        supplier: "Proveedor local",
        isBom: true,
      },
      {
        id: "b2",
        teamId: "electronics",
        activityId: "a14",
        category: "Actuadores",
        name: "Servomotor MG996R",
        quantity: 4,
        unitPriceCents: 22000,
        supplier: "Proveedor local",
        isBom: true,
      },
      {
        id: "b3",
        teamId: "cad",
        activityId: "a9",
        category: "Manufactura",
        name: "Filamento PLA 1 kg",
        quantity: 3,
        unitPriceCents: 45000,
        isBom: true,
      },
      {
        id: "b4",
        teamId: "software",
        activityId: "a13",
        category: "Visión",
        name: "Cámara USB 1080p",
        quantity: 1,
        unitPriceCents: 65000,
        isBom: true,
      },
    ],
    expenses: [
      {
        id: "e1",
        teamId: "cad",
        budgetItemId: "b3",
        activityId: "a9",
        amountCents: 90000,
        date: offset(-12),
        paidBy: "andres",
        description: "Compra de 2 rollos de PLA",
        status: "approved",
        decidedBy: "demo",
      },
      {
        id: "e2",
        teamId: "electronics",
        budgetItemId: "b1",
        activityId: "a7",
        amountCents: 76000,
        date: offset(-3),
        paidBy: "diego",
        description: "ESP32-S3 para la tarjeta de control",
      },
    ],
    risks: [
      {
        id: "r1",
        description: "El material para imprimir el efector final llega tarde",
        probability: 4,
        impact: 4,
        mitigation:
          "Reservar la impresora del laboratorio y tener un proveedor alterno",
        nextAction: "Confirmar la fecha de entrega con el proveedor",
        dueDate: offset(2),
        ownerId: "andres",
        status: "open",
      },
      {
        id: "r2",
        description: "La cámara no distingue bien los colores con poca luz",
        probability: 3,
        impact: 4,
        mitigation: "Agregar iluminación LED y calibrar el balance de blancos",
        ownerId: "mateo",
        status: "open",
      },
      {
        id: "r3",
        description:
          "El ruido eléctrico de los servos reinicia el microcontrolador",
        probability: 2,
        impact: 5,
        mitigation: "Fuente separada para servos y capacitores de desacople",
        ownerId: "ana",
        status: "mitigated",
      },
    ],
    records: [
      {
        id: "rec1",
        kind: "weekly",
        title: "Bitácora de la semana 4",
        date: offset(-5),
        teamId: "electronics",
        body: "Se cerró la selección de sensores. La tarjeta de control avanza según lo previsto.",
        ownerId: "demo",
        completed: true,
      },
      {
        id: "rec2",
        kind: "meeting",
        title: "Reunión de integración",
        date: offset(-2),
        body: "Acuerdo: integrar los servos con la tarjeta de control cuando llegue el PLA.",
        ownerId: "carlos",
        attendees: ["demo", "carlos", "andres"],
        items: [
          { id: "rec2-1", title: "Confirmar pinout de servos", done: true },
          { id: "rec2-2", title: "Imprimir soporte de cámara", done: false },
        ],
      },
      {
        id: "rec3",
        kind: "acceptance",
        title: "Prueba de clasificación por color",
        date: offset(18),
        teamId: "software",
        ownerId: "carlos",
        target: "90 % o más de piezas bien clasificadas",
      },
    ],
  });
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
    control,
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
  reschedule(p);
  p.activities = p.activities.map(withActualDates);
  await saveProject(p, { overwrite: reset });
  const greenhouse: Project = {
    ...p,
    id: "greenhouse",
    name: "Invernadero inteligente",
    description:
      "Monitoreo y automatización de un invernadero de pequeña escala.",
    weeks: 10,
    start: offset(-7),
    control: undefined,
    activities: activities.slice(0, 9).map((a, i) => ({
      ...a,
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
      blockedReason: "",
    })),
    comments: [],
    history: [],
  };
  // El estado de cada actividad del invernadero sale de sus fechas calculadas.
  reschedule(greenhouse);
  const now = offset(0);
  greenhouse.activities = greenhouse.activities.map((a) =>
    withActualDates({
      ...a,
      status:
        a.end < now ? "Hecha" : a.start <= now ? "En progreso" : "Pendiente",
    }),
  );
  await saveProject(greenhouse, { overwrite: reset });
}
