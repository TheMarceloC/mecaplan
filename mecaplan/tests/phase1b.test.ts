import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  calculateCPM,
  addWorkingDays,
  workingDayDistance,
} from "../src/lib/cpm";
import { parseCommit, verifySignature } from "../src/lib/commits";
import {
  budgetTotals,
  parseMoney,
  csv,
  validateCompletion,
  control,
  planning,
} from "../src/lib/control";
import {
  projectSchema,
  activitySchema,
  type PublicUser,
} from "../src/lib/model";
import { controlSchema, evaluationSchema } from "../src/lib/phase-schema";
import { can } from "../src/server/auth/permissions";
import { agentContext } from "../src/lib/agent-context";
const a = activitySchema.parse({
  id: "a",
  code: "ACT-1",
  title: "Diseñar control",
  teamId: "e",
  status: "Pendiente",
  priority: "Alta",
  start: "2026-10-19",
  end: "2026-10-20",
  duration: 2,
  responsible: ["m"],
  accountable: "m",
});
const p = projectSchema.parse({
  id: "p",
  name: "Proyecto de prueba",
  description: "",
  start: "2026-10-19",
  weeks: 1,
  status: "active",
  teams: [
    { id: "e", name: "Electrónica", color: "#123456" },
    { id: "s", name: "Programación", color: "#654321" },
  ],
  members: [
    {
      id: "m",
      name: "Miembro de prueba",
      teamId: "e",
      role: "member",
      lead: false,
    },
    {
      id: "r",
      name: "Revisor de prueba",
      teamId: "s",
      role: "member",
      lead: false,
    },
  ],
  activities: [a],
  comments: [],
  history: [],
  control: controlSchema.parse({ requireCrossReview: true }),
});
describe("CPM: pasadas hacia adelante y atrás", () => {
  it("red simple", () => {
    const r = calculateCPM(
      [
        { id: "a", duration: 2 },
        { id: "b", duration: 3 },
      ],
      [{ predecessorId: "a", successorId: "b" }],
    );
    expect(r.duration).toBe(5);
    expect(r.criticalIds).toEqual(["a", "b"]);
    expect(r.items[1].earlyStart).toBe(2);
  });
  it("varias rutas y holgura", () => {
    const r = calculateCPM(
      [
        { id: "a", duration: 2 },
        { id: "b", duration: 5 },
        { id: "c", duration: 3 },
        { id: "d", duration: 1 },
      ],
      [
        { predecessorId: "a", successorId: "b" },
        { predecessorId: "a", successorId: "c" },
        { predecessorId: "b", successorId: "d" },
        { predecessorId: "c", successorId: "d" },
      ],
    );
    expect(r.duration).toBe(8);
    expect(r.items.find((x) => x.id === "c")?.slack).toBe(2);
    expect(r.criticalIds).toEqual(["a", "b", "d"]);
  });
  it("incluye desfases positivos y negativos", () => {
    expect(
      calculateCPM(
        [
          { id: "a", duration: 4 },
          { id: "b", duration: 3 },
        ],
        [{ predecessorId: "a", successorId: "b", lagDays: 2 }],
      ).duration,
    ).toBe(9);
    expect(
      calculateCPM(
        [
          { id: "a", duration: 4 },
          { id: "b", duration: 3 },
        ],
        [{ predecessorId: "a", successorId: "b", lagDays: -2 }],
      ).duration,
    ).toBe(5);
  });
  it("hitos de duración cero", () => {
    const r = calculateCPM(
      [
        { id: "a", duration: 3 },
        { id: "h", duration: 0 },
      ],
      [{ predecessorId: "a", successorId: "h" }],
    );
    expect(r.duration).toBe(3);
    expect(r.items.find((x) => x.id === "h")?.earlyStart).toBe(3);
    expect(r.criticalIds).toContain("h");
  });
  it("rechaza ciclos y referencias ajenas", () => {
    expect(() =>
      calculateCPM(
        [
          { id: "a", duration: 1 },
          { id: "b", duration: 1 },
        ],
        [
          { predecessorId: "a", successorId: "b" },
          { predecessorId: "b", successorId: "a" },
        ],
      ),
    ).toThrow(/ciclo/);
    expect(() =>
      calculateCPM(
        [{ id: "a", duration: 1 }],
        [{ predecessorId: "missing", successorId: "a" }],
      ),
    ).toThrow(/inexistente/);
  });
  it("actividades independientes", () => {
    const r = calculateCPM(
      [
        { id: "a", duration: 2 },
        { id: "b", duration: 5 },
      ],
      [],
    );
    expect(r.duration).toBe(5);
    expect(r.items.find((x) => x.id === "a")?.slack).toBe(3);
  });
  it("recalcula al cambiar duración", () => {
    const r = calculateCPM(
      [
        { id: "a", duration: 8 },
        { id: "b", duration: 3 },
      ],
      [{ predecessorId: "a", successorId: "b" }],
    );
    expect(r.duration).toBe(11);
    expect(
      planning({ ...p, activities: [{ ...a, duration: 12 }] }).overflowDays,
    ).toBeGreaterThan(0);
  });
  it("calendario omite sábados y domingos", () => {
    expect(addWorkingDays("2026-10-23", 1, 5)).toBe("2026-10-26");
    expect(addWorkingDays("2026-10-24", 0, 5)).toBe("2026-10-26");
    expect(workingDayDistance("2026-10-23", "2026-10-26", 5)).toBe(1);
  });
});
describe("presupuesto en centavos y exportaciones", () => {
  it("convierte decimales sin redondeos binarios", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("120,05")).toBe(12005);
    expect(() => parseMoney("1.999")).toThrow();
    expect(() => parseMoney("-1")).toThrow();
  });
  it("solo los aprobados cuentan como gasto oficial", () => {
    const c = controlSchema.parse({
      budget: [
        {
          id: "b",
          teamId: "e",
          name: "Pieza",
          category: "Materiales",
          quantity: 3,
          unitPriceCents: 29,
        },
      ],
      expenses: [
        {
          id: "x",
          teamId: "e",
          amountCents: 20,
          date: "2026-10-19",
          paidBy: "m",
          description: "Compra aprobada",
          status: "approved",
        },
        {
          id: "y",
          teamId: "e",
          amountCents: 40,
          date: "2026-10-19",
          paidBy: "m",
          description: "Compra pendiente",
          status: "pending",
        },
        {
          id: "z",
          teamId: "e",
          amountCents: 60,
          date: "2026-10-19",
          paidBy: "m",
          description: "Compra rechazada",
          status: "rejected",
        },
      ],
    });
    expect(budgetTotals({ ...p, control: c })).toMatchObject({
      planned: 87,
      spent: 20,
      pending: 40,
      remaining: 67,
    });
  });
  it("neutraliza fórmulas al exportar texto a CSV", () => {
    expect(csv([['=HYPERLINK("bad")', -2]])).toContain("'=HYPERLINK");
    expect(csv([["a,b"]])).toContain('"a,b"');
  });
});
describe("evidencia y evaluador independiente", () => {
  it("exige evidencia y revisor de otro equipo", () => {
    expect(() => validateCompletion(p, { ...a, status: "Hecha" })).toThrow();
    expect(() =>
      validateCompletion(p, {
        ...a,
        status: "Hecha",
        evidence: ["prueba"],
        reviewerId: "m",
      }),
    ).toThrow();
    expect(() =>
      validateCompletion(p, {
        ...a,
        status: "Hecha",
        evidence: ["prueba"],
        reviewerId: "r",
      }),
    ).not.toThrow();
  });
  it("la administración de Programación no da acceso a evaluar", () => {
    const u: PublicUser = {
      id: "programmer",
      name: "Programador",
      email: "p@example.test",
      globalRole: "superuser",
      status: "active",
      isInstructor: false,
    };
    expect(can(u, "project:edit", p)).toBe(true);
    expect(can(u, "evaluate", p)).toBe(false);
    expect(can({ ...u, isInstructor: true }, "evaluate", p)).toBe(true);
  });
  it("no acepta calificaciones mayores al máximo", () =>
    expect(
      evaluationSchema.safeParse({
        id: "e",
        projectId: "p",
        authorId: "r",
        title: "Avance 1",
        targetType: "project",
        date: "2026-10-19",
        criteria: [{ name: "Criterio", score: 3, max: 2 }],
      }).success,
    ).toBe(false));
  it("el contexto excluye correos y claves y limita el equipo", () => {
    const x = {
      ...p,
      description: "Correo test@example.test",
      activities: [
        { ...a, title: "Revisar test@example.test" },
        { ...a, id: "b", code: "ACT-2", teamId: "s" },
      ],
    };
    const output = agentContext(x, "e");
    expect(JSON.stringify(output)).not.toContain("test@example.test");
    expect(output.data.activities).toHaveLength(1);
    expect(output.markdown).toContain("## Formato de propuesta");
  });
});
describe("parser y firma de commits locales", () => {
  it("vincula códigos ACT y DIG sin repetirlos", () =>
    expect(parseCommit("ACT-12 DIG-09 ACT-12 lectura sensor").codes).toEqual([
      "ACT-12",
      "DIG-09",
    ]));
  it("propone review y done; automático solo en progreso", () => {
    expect(parseCommit("ACT-1 #done")).toMatchObject({
      suggestedStatus: "Hecha",
      automatic: false,
    });
    expect(parseCommit("DIG-2 #review")).toMatchObject({
      suggestedStatus: "En revisión",
      automatic: false,
    });
    expect(parseCommit("ACT-3 cambio")).toMatchObject({
      suggestedStatus: "En progreso",
      automatic: true,
    });
  });
  it("rechaza firmas ausentes, falsas o de cuerpo modificado", () => {
    const body = '{"commits":[]}',
      secret = "secreto-local-de-prueba",
      signature =
        "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(verifySignature(body, signature, secret)).toBe(true);
    expect(verifySignature(body + " ", signature, secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, "sha256=bad", secret)).toBe(false);
  });
});
