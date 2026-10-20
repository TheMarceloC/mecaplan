import { describe, it, expect } from "vitest";
import {
  dependencyConflicts,
  durationBetween,
  endFromDuration,
  planning,
  scheduledCriticalIds,
  startConflicts,
} from "../src/lib/control";
import { byCode } from "../src/lib/codes";
import {
  projectSchema,
  activitySchema,
  type PublicUser,
} from "../src/lib/model";
import { controlSchema } from "../src/lib/phase-schema";
import {
  describeImpact,
  impactNeedsConfirmation,
} from "../src/lib/plan-impact";
import { mutateControl } from "../src/server/control-service";
import { detectUpload } from "../src/server/uploads";

const activity = (
  id: string,
  start: string,
  end: string,
  duration: number,
  extra: Record<string, unknown> = {},
) =>
  activitySchema.parse({
    id,
    code: "ELE-" + id.slice(1).padStart(3, "0"),
    title: "Actividad " + id,
    teamId: "e",
    status: "Pendiente",
    priority: "Media",
    start,
    end,
    duration,
    responsible: ["m"],
    accountable: "m",
    ...extra,
  });
const project = (activities: ReturnType<typeof activity>[]) =>
  projectSchema.parse({
    id: "p",
    name: "Proyecto de prueba",
    description: "",
    start: "2026-10-19",
    weeks: 4,
    status: "active",
    teams: [{ id: "e", name: "Electrónica", color: "#123456" }],
    members: [
      { id: "m", name: "Persona", teamId: "e", role: "member", lead: false },
    ],
    activities,
    comments: [],
    history: [],
  });

describe("fechas del formulario de actividad", () => {
  it("calcula la entrega con días hábiles, contando el día de inicio", () => {
    // Martes 20 de octubre + 5 días hábiles: martes a lunes.
    expect(endFromDuration("2026-10-20", 5)).toBe("2026-10-26");
    expect(endFromDuration("2026-10-20", 1)).toBe("2026-10-20");
    expect(endFromDuration("2026-10-20", 0)).toBe("2026-10-20");
  });
  it("recalcula la duración cuando se edita la entrega", () => {
    expect(durationBetween("2026-10-20", "2026-10-26")).toBe(5);
    expect(durationBetween("2026-10-20", "2026-10-20")).toBe(1);
    expect(durationBetween("2026-10-20", "2026-10-19")).toBe(0);
  });
});

describe("ruta crítica y dependencias en la interfaz", () => {
  it("no marca como críticas las actividades sin planificar", () => {
    // Dos actividades de un día sin dependencias: ambas tienen holgura cero.
    const p = project([
      activity("a1", "2026-10-19", "2026-10-19", 1, { unscheduled: true }),
      activity("a2", "2026-10-19", "2026-10-19", 1),
    ]);
    expect(planning(p).criticalIds).toContain("a1");
    expect(scheduledCriticalIds(p).has("a1")).toBe(false);
    expect(scheduledCriticalIds(p).has("a2")).toBe(true);
  });
  it("detecta una sucesora que empieza antes de que termine su predecesora", () => {
    const p = project([
      activity("a1", "2026-10-19", "2026-10-23", 5),
      activity("a2", "2026-10-22", "2026-10-28", 5, { dependencies: ["a1"] }),
      activity("a3", "2026-10-26", "2026-10-30", 5, { dependencies: ["a1"] }),
    ]);
    expect(dependencyConflicts(p)).toEqual([
      { activityId: "a2", predecessorId: "a1", required: "2026-10-26" },
    ]);
  });
  it("respeta el desfase y omite las actividades sin planificar", () => {
    const p = project([
      activity("a1", "2026-10-19", "2026-10-23", 5),
      activity("a2", "2026-10-26", "2026-10-30", 5, {
        dependencies: ["a1"],
        dependencyLags: { a1: 2 },
      }),
      activity("a3", "2026-10-19", "2026-10-19", 1, {
        dependencies: ["a1"],
        unscheduled: true,
      }),
    ]);
    expect(dependencyConflicts(p).map((k) => k.activityId)).toEqual(["a2"]);
  });
});

describe("orden natural por código", () => {
  it("ordena ELE-002 antes de ELE-010", () => {
    expect(
      [{ code: "ELE-010" }, { code: "ELE-002" }, { code: "MAN-001" }]
        .sort(byCode)
        .map((a) => a.code),
    ).toEqual(["ELE-002", "ELE-010", "MAN-001"]);
  });
});

describe("tipos de archivo admitidos", () => {
  const zip = new Uint8Array([80, 75, 3, 4, 20, 0, 0, 0]);
  it("acepta Word, PowerPoint y ZIP con firma PK", () => {
    expect(detectUpload("informe.docx", zip)).toContain("wordprocessingml");
    expect(detectUpload("avance.pptx", zip)).toContain("presentationml");
    expect(detectUpload("codigo.zip", zip)).toBe("application/zip");
  });
  it("acepta STL binario con tamaño coherente y rechaza uno truncado", () => {
    const stl = new Uint8Array(84 + 50 * 2);
    new DataView(stl.buffer).setUint32(80, 2, true);
    expect(detectUpload("pieza.stl", stl)).toBe("model/stl");
    expect(() => detectUpload("pieza.stl", stl.subarray(0, 120))).toThrow();
  });
  it("acepta código fuente de texto y rechaza binarios disfrazados", () => {
    const code = new TextEncoder().encode("void setup() {}\n");
    expect(detectUpload("firmware.ino", code)).toBe("text/plain");
    expect(() =>
      detectUpload("firmware.ino", new Uint8Array([0, 1, 2])),
    ).toThrow();
    expect(() => detectUpload("informe.docx", code)).toThrow();
  });
});

describe("aprobación de gastos", () => {
  const user = (id: string): PublicUser => ({
    id,
    name: "Administrador " + id,
    email: id + "@example.invalid",
    globalRole: "user",
    status: "active",
  });
  const withExpense = () => {
    const p = project([activity("a1", "2026-10-19", "2026-10-23", 5)]);
    p.members.push(
      { id: "u", name: "Autora", teamId: "e", role: "admin", lead: true },
      { id: "v", name: "Revisor", teamId: "e", role: "admin", lead: false },
    );
    p.control = controlSchema.parse({
      expenses: [
        {
          id: "g",
          teamId: "e",
          amountCents: 125050,
          date: "2026-10-20",
          paidBy: "u",
          description: "Silicona para la yema",
        },
      ],
    });
    return p;
  };
  it("quien registró el gasto no puede aprobarlo", async () => {
    const p = withExpense();
    await expect(
      mutateControl(
        "decideExpense",
        { id: "g", status: "approved" },
        p,
        user("u"),
      ),
    ).rejects.toThrow(/registraste/);
    expect(p.control!.expenses[0].status).toBe("pending");
  });
  it("otra persona con permiso sí puede aprobarlo", async () => {
    const p = withExpense();
    await mutateControl(
      "decideExpense",
      { id: "g", status: "approved" },
      p,
      user("v"),
    );
    expect(p.control!.expenses[0]).toMatchObject({
      status: "approved",
      decidedBy: "v",
    });
  });
  it("quien lo registró puede rechazarlo para retirarlo", async () => {
    const p = withExpense();
    await mutateControl(
      "decideExpense",
      { id: "g", status: "rejected" },
      p,
      user("u"),
    );
    expect(p.control!.expenses[0].status).toBe("rejected");
  });
});

describe("aviso de dependencias en el formulario", () => {
  it("indica el primer inicio válido para el borrador", () => {
    const p = project([activity("a1", "2026-10-19", "2026-10-23", 5)]);
    const draft = activity("a2", "2026-10-21", "2026-10-27", 5, {
      dependencies: ["a1"],
    });
    expect(startConflicts(p, draft)).toEqual([
      { activityId: "a2", predecessorId: "a1", required: "2026-10-26" },
    ]);
    expect(startConflicts(p, { ...draft, start: "2026-10-26" })).toEqual([]);
  });
});

describe("confirmación del impacto en la ruta crítica", () => {
  const impact = (before: string, after: string, overflow = 0) => ({
    before: { finish: before, overflowDays: 0 },
    after: { finish: after, overflowDays: overflow },
  });
  it("no pide confirmar si el fin y el exceso no cambian", () => {
    expect(impactNeedsConfirmation(impact("2026-11-13", "2026-11-13"))).toBe(
      false,
    );
  });
  it("pide confirmar si el fin se mueve o aparece exceso", () => {
    expect(impactNeedsConfirmation(impact("2026-11-13", "2026-11-18"))).toBe(
      true,
    );
    expect(impactNeedsConfirmation(impact("2026-11-13", "2026-11-13", 2))).toBe(
      true,
    );
  });
  it("explica el cambio con fechas legibles", () => {
    const text = describeImpact(impact("2026-11-13", "2026-11-20", 3));
    expect(text).toContain("13 nov 2026");
    expect(text).toContain("20 nov 2026");
    expect(text).toContain("3 días hábiles después de la fecha límite");
  });
});
