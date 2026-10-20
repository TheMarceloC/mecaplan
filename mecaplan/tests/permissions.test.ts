import { describe, it, expect } from "vitest";
import { can } from "../src/server/auth/permissions";
import {
  activitySchema,
  projectSchema,
  raciValid,
  progress,
  taskProgress,
  type PublicUser,
} from "../src/lib/model";
const user: PublicUser = {
  id: "m",
  name: "Miembro",
  email: "m@example.test",
  globalRole: "user",
  status: "active",
};
const activity = activitySchema.parse({
  id: "a",
  code: "ACT-1",
  title: "Diseñar PCB",
  teamId: "e",
  status: "Pendiente",
  priority: "Alta",
  start: "2026-10-19",
  end: "2026-10-20",
  duration: 2,
  responsible: ["m"],
  accountable: "l",
});
const project = projectSchema.parse({
  id: "p",
  name: "Proyecto",
  description: "",
  start: "2026-10-19",
  weeks: 8,
  status: "active",
  teams: [
    { id: "e", name: "Electrónica", color: "#123456" },
    { id: "s", name: "Programación", color: "#123456" },
  ],
  members: [
    { id: "m", name: "Miembro", role: "member", teamId: "e", lead: false },
    { id: "l", name: "Líder", role: "member", teamId: "e", lead: true },
    { id: "a", name: "Admin", role: "admin", teamId: "s", lead: false },
  ],
  activities: [activity],
  comments: [],
  history: [],
});
describe("permisos del servidor", () => {
  it("rechaza anónimos y cuentas pendientes o desactivadas", () => {
    for (const u of [
      null,
      { ...user, status: "pending" as const },
      { ...user, status: "disabled" as const },
    ])
      expect(can(u, "read", project)).toBe(false);
  });
  it("un miembro puede cambiar actividades donde es R, pero no editar su planificación", () => {
    expect(can(user, "activity:status", project, activity)).toBe(true);
    expect(can(user, "activity:edit", project, activity)).toBe(false);
    expect(
      can(user, "activity:status", project, {
        ...activity,
        responsible: [],
        accountable: "l",
      }),
    ).toBe(false);
  });
  it("A puede cambiar el estado", () =>
    expect(
      can({ ...user, id: "l" }, "activity:status", project, {
        ...activity,
        teamId: "s",
      }),
    ).toBe(true));
  it("un líder solo edita actividades de su equipo", () => {
    expect(can({ ...user, id: "l" }, "activity:edit", project, activity)).toBe(
      true,
    );
    expect(
      can({ ...user, id: "l" }, "activity:edit", project, {
        ...activity,
        teamId: "s",
      }),
    ).toBe(false);
  });
  it("admin del proyecto no asigna roles globales ni crea proyectos", () => {
    expect(can({ ...user, id: "a" }, "members:edit", project)).toBe(true);
    expect(can({ ...user, id: "a" }, "project:create")).toBe(false);
    expect(can({ ...user, id: "a" }, "global:edit")).toBe(false);
  });
  it("un usuario no lee proyectos ajenos", () =>
    expect(can({ ...user, id: "unknown" }, "read", project)).toBe(false));
  it("el superusuario administra proyectos sin membresía", () =>
    expect(
      can({ ...user, globalRole: "superuser" }, "project:edit", project),
    ).toBe(true));
});
describe("validación de actividades y WBS", () => {
  it("exige motivo para un bloqueo", () => {
    expect(
      activitySchema.safeParse({ ...activity, status: "Bloqueada" }).success,
    ).toBe(false);
    expect(
      activitySchema.safeParse({
        ...activity,
        status: "Bloqueada",
        blockedReason: "Falta material",
      }).success,
    ).toBe(true);
  });
  it("rechaza fechas invertidas y duración fraccionaria", () => {
    expect(
      activitySchema.safeParse({ ...activity, end: "2026-10-18" }).success,
    ).toBe(false);
    expect(
      activitySchema.safeParse({ ...activity, duration: 1.5 }).success,
    ).toBe(false);
  });
  it("advierte cuando no hay A o R", () => {
    expect(raciValid(activity)).toBe(true);
    expect(raciValid({ ...activity, accountable: "" })).toBe(false);
    expect(raciValid({ ...activity, responsible: [] })).toBe(false);
  });
  it("calcula el avance del padre desde sus hijas sin duplicar el peso global", () => {
    const p = {
      ...project,
      activities: [
        activity,
        { ...activity, id: "b", parentId: "a", status: "Hecha" as const },
        { ...activity, id: "c", parentId: "a" },
      ],
    };
    expect(taskProgress(activity, p)).toBe(50);
    expect(progress(p)).toBe(50);
  });
  it("excluye la papelera del avance", () =>
    expect(
      progress({
        ...project,
        activities: [{ ...activity, status: "Hecha", deletedAt: "2026-10-19" }],
      }),
    ).toBe(0));
});
