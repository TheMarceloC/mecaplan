import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hash, compare } from "bcryptjs";
import {
  projectSchema,
  activitySchema,
  type PublicUser,
} from "../src/lib/model";
import { controlSchema } from "../src/lib/phase-schema";
import {
  projectDashboard,
  portfolioDashboard,
} from "../src/lib/project-dashboard";
import {
  changeOwnPassword,
  updateOwnProfile,
} from "../src/server/account-service";
import {
  allProjects,
  saveProject,
  saveUser,
  userById,
} from "../src/server/repositories";
import { sql } from "../src/server/repositories/database";
import { mutateControl, prepareProject } from "../src/server/control-service";

const userId = "account-regression-user",
  otherId = "account-regression-other";
const password = "synthetic-test-password-2026";
const user: PublicUser = {
  id: userId,
  name: "Usuario sintético",
  email: "account@example.invalid",
  username: "account.fixture",
  globalRole: "user",
  status: "active",
};
function project() {
  return projectSchema.parse({
    id: "account-regression-project",
    name: "Proyecto de prueba",
    description: "",
    start: "2026-10-19",
    weeks: 6,
    status: "active",
    teams: [{ id: "e", name: "Electrónica", color: "#123456" }],
    members: [
      { id: userId, name: user.name, teamId: "e", role: "member", lead: false },
      {
        id: otherId,
        name: "Otra persona",
        teamId: "e",
        role: "member",
        lead: false,
      },
    ],
    activities: [],
    history: [],
    comments: [],
    control: controlSchema.parse({}),
  });
}
function activity(id: string, extra: Record<string, unknown> = {}) {
  return activitySchema.parse({
    id,
    code: "ELE-" + id,
    title: "Actividad " + id,
    teamId: "e",
    status: "Pendiente",
    priority: "Media",
    start: "2026-10-19",
    end: "2026-10-19",
    duration: 1,
    responsible: [userId],
    accountable: userId,
    ...extra,
  });
}

describe("indicadores de proyectos", () => {
  it("evita contar agrupaciones, canceladas, eliminadas y fechas provisionales como vencidas", () => {
    const p = project();
    p.activities = [
      activity("parent"),
      activity("child", { parentId: "parent", status: "Hecha" }),
      activity("late"),
      activity("unscheduled", { unscheduled: true }),
      activity("cancelled", { status: "Cancelada" }),
      activity("deleted", { deletedAt: "2026-10-20" }),
    ];
    expect(projectDashboard(p, "2026-10-21")).toMatchObject({
      total: 3,
      completed: 1,
      progress: 33,
      overdue: 1,
      unscheduled: 1,
    });
  });
  it("calcula avance global por actividades y personas únicas, no promedios de porcentajes", () => {
    const a = project(),
      b = project();
    a.activities = [activity("done", { status: "Hecha" })];
    b.activities = [activity("a"), activity("b"), activity("c")];
    expect(portfolioDashboard([a, b], "2026-10-19")).toMatchObject({
      total: 4,
      completed: 1,
      progress: 25,
      people: 2,
    });
    expect(portfolioDashboard([], "2026-10-19").progress).toBe(0);
  });
  it("separa los gastos aprobados y solo marca riesgos abiertos prioritarios", () => {
    const p = project(),
      c = p.control!;
    c.risks = ["open", "closed", "mitigated"].map((status, i) => ({
      id: String(i),
      description: "Riesgo",
      probability: 5,
      impact: 5,
      mitigation: "",
      ownerId: userId,
      status: status as "open" | "closed" | "mitigated",
    }));
    c.expenses = ["approved", "pending", "rejected"].map((status, i) => ({
      id: String(i),
      amountCents: 100,
      status: status as "approved" | "pending" | "rejected",
      description: "Compra",
      teamId: "e",
      date: "2026-10-19",
      paidBy: userId,
      budgetItemId: "",
      activityId: "",
      receiptId: "",
      decidedBy: "",
    }));
    expect(projectDashboard(p, "2026-10-21")).toMatchObject({
      approvedCents: 100,
      openRisks: 1,
      highRisks: 1,
      currency: "HNL",
    });
  });
});

describe("edición de riesgos", () => {
  it("el responsable edita el mismo riesgo conservando su código y referencia de Excel", async () => {
    const p = project();
    prepareProject(p).risks.push({
      id: "r",
      code: "RIE-003",
      importKey: "riesgo-excel",
      description: "Riesgo anterior",
      probability: 2,
      impact: 3,
      mitigation: "",
      ownerId: userId,
      status: "open",
    });
    await mutateControl(
      "saveRisk",
      {
        ...p.control!.risks[0],
        code: "RIE-999",
        importKey: "cambio",
        description: "Riesgo actualizado",
        probability: 4,
        impact: 5,
        status: "mitigated",
        nextAction: "Verificar el proveedor",
        dueDate: "2026-10-28",
      },
      p,
      user,
    );
    expect(p.control!.risks).toHaveLength(1);
    expect(p.control!.risks[0]).toMatchObject({
      id: "r",
      code: "RIE-003",
      importKey: "riesgo-excel",
      description: "Riesgo actualizado",
      probability: 4,
      status: "mitigated",
      dueDate: "2026-10-28",
    });
  });
  it("otro integrante no puede modificarlo; el administrador sí", async () => {
    const p = project();
    const risk = {
      id: "r",
      description: "Riesgo reservado",
      probability: 3,
      impact: 3,
      mitigation: "",
      ownerId: otherId,
      status: "open" as const,
    };
    p.control!.risks.push(risk);
    await expect(
      mutateControl(
        "saveRisk",
        { ...risk, description: "Modificado" },
        p,
        user,
      ),
    ).rejects.toThrow(/responsable/);
    expect(p.control!.risks[0].description).toBe("Riesgo reservado");
    await mutateControl(
      "saveRisk",
      { ...risk, description: "Modificado por admin" },
      p,
      { ...user, globalRole: "superuser" },
    );
    expect(p.control!.risks[0].description).toBe("Modificado por admin");
  });
});

describe("ajustes de cuenta", () => {
  async function clean() {
    for (const id of [userId, otherId]) {
      await sql.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      await sql.prepare("DELETE FROM password_resets WHERE user_id=?").run(id);
      await sql.prepare("DELETE FROM global_audit WHERE actor_id=?").run(id);
      await sql.prepare("DELETE FROM users WHERE id=?").run(id);
    }
    await sql.prepare("DELETE FROM projects WHERE id=?").run(project().id);
  }
  beforeEach(async () => {
    await clean();
    await saveUser({ ...user, passwordHash: await hash(password, 4) });
    await saveUser({
      ...user,
      id: otherId,
      email: "taken@example.invalid",
      username: "taken.fixture",
      passwordHash: "unusable-fixture",
    });
    await saveProject(project());
    await sql
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run("account-fixture-session", userId, "2099-01-01");
    await sql
      .prepare("INSERT INTO password_resets VALUES(?,?,?)")
      .run("account-fixture-reset", userId, 9999999999999);
  });
  afterAll(clean);
  const input = () => ({
    name: "Nombre actualizado",
    email: user.email,
    username: user.username,
    currentPassword: password,
  });
  it("actualiza el nombre en todas sus membresías sin alterar permisos ni asignaciones", async () => {
    expect(await updateOwnProfile(userId, input())).toEqual({
      identityChanged: false,
    });
    expect(await userById(userId)).toMatchObject({
      name: "Nombre actualizado",
      globalRole: "user",
      status: "active",
    });
    const p = (await allProjects()).find((p) => p.id === project().id)!;
    expect(p.members[0]).toMatchObject({
      id: userId,
      name: "Nombre actualizado",
      role: "member",
    });
    expect(
      await sql.prepare("SELECT id FROM sessions WHERE user_id=?").all(userId),
    ).toHaveLength(1);
  });
  it("normaliza el acceso y revoca sesiones y recuperaciones al cambiar correo o usuario", async () => {
    expect(
      await updateOwnProfile(userId, {
        ...input(),
        email: " NEW@Example.Invalid ",
        username: " NUEVO.USUARIO ",
      }),
    ).toEqual({ identityChanged: true });
    expect(await userById(userId)).toMatchObject({
      email: "new@example.invalid",
      username: "nuevo.usuario",
    });
    expect(
      await sql.prepare("SELECT id FROM sessions WHERE user_id=?").all(userId),
    ).toHaveLength(0);
    expect(
      await sql
        .prepare("SELECT token_hash FROM password_resets WHERE user_id=?")
        .all(userId),
    ).toHaveLength(0);
  });
  it("rechaza una contraseña incorrecta y cambios de privilegios", async () => {
    await expect(
      updateOwnProfile(userId, { ...input(), currentPassword: "incorrecta" }),
    ).rejects.toThrow(/actual/);
    await expect(
      updateOwnProfile(userId, { ...input(), globalRole: "superuser" }),
    ).rejects.toThrow();
    expect(await userById(userId)).toMatchObject({
      name: user.name,
      globalRole: "user",
    });
  });
  it("rechaza colisiones entre correo y usuario sin cambios parciales", async () => {
    await expect(
      updateOwnProfile(userId, { ...input(), email: "taken@example.invalid" }),
    ).rejects.toThrow(/en uso/);
    await expect(
      updateOwnProfile(userId, { ...input(), username: "TAKEN.FIXTURE" }),
    ).rejects.toThrow(/en uso/);
    // A legacy username may look like an email: login still must resolve uniquely.
    const other = await userById(otherId);
    await saveUser({ ...other!, username: "new@example.invalid" });
    await expect(
      updateOwnProfile(userId, { ...input(), email: "new@example.invalid" }),
    ).rejects.toThrow(/en uso/);
    expect(
      (await allProjects()).find((p) => p.id === project().id)!.members[0].name,
    ).toBe(user.name);
  });
  it("cambia el hash, invalida recuperaciones y obliga a reautenticar otras sesiones", async () => {
    await expect(
      changeOwnPassword(userId, { oldPassword: password, password }),
    ).rejects.toThrow(/diferente/);
    await expect(
      changeOwnPassword(userId, { oldPassword: password, password: "corta" }),
    ).rejects.toThrow();
    const next = "synthetic-next-password-2026";
    await changeOwnPassword(userId, { oldPassword: password, password: next });
    const saved = (await userById(userId))!;
    expect(await compare(next, saved.passwordHash)).toBe(true);
    expect(await compare(password, saved.passwordHash)).toBe(false);
    expect(saved.mustChangePassword).toBe(false);
    expect(
      await sql.prepare("SELECT id FROM sessions WHERE user_id=?").all(userId),
    ).toHaveLength(0);
    expect(
      await sql
        .prepare("SELECT token_hash FROM password_resets WHERE user_id=?")
        .all(userId),
    ).toHaveLength(0);
    const audits = JSON.stringify(
      await sql
        .prepare("SELECT payload FROM global_audit WHERE actor_id=?")
        .all(userId),
    );
    expect(audits).not.toContain(password);
    expect(audits).not.toContain(next);
  });
});
