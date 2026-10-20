import { leafActivities, type Activity, type Project } from "./model";
import { controlSchema } from "./phase-schema";
import {
  calculateCPM,
  addWorkingDays,
  workingDayDistance,
  workingDaysInclusive,
} from "./cpm";
export function validateProjectStructure(p: Project) {
  for (const list of [p.activities, p.members, p.teams])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw Error("El proyecto contiene identificadores duplicados.");
  const active = p.activities.filter((a) => !a.deletedAt),
    leaves = new Set(
      active
        .filter((a) => !active.some((b) => b.parentId === a.id))
        .map((a) => a.id),
    );
  for (const member of p.members)
    if (!p.teams.some((t) => t.id === member.teamId))
      throw Error("Un integrante tiene un equipo inexistente.");
  for (const a of active) {
    if (!p.teams.some((t) => t.id === a.teamId))
      throw Error("Una actividad tiene un equipo inexistente.");
    if (
      [...a.responsible, ...a.consulted, ...a.informed, a.accountable]
        .filter(Boolean)
        .some((id) => !p.members.some((m) => m.id === id))
    )
      throw Error("Las asignaciones deben pertenecer al proyecto.");
    const seen = new Set([a.id]);
    let parent = a.parentId;
    while (parent) {
      if (seen.has(parent))
        throw Error("La jerarquía no puede contener ciclos.");
      seen.add(parent);
      const next = active.find((b) => b.id === parent);
      if (!next) throw Error("La jerarquía contiene un padre inexistente.");
      parent = next.parentId;
    }
    if (a.dependencies.some((id) => !leaves.has(id)))
      throw Error(
        "Las dependencias deben apuntar a actividades hoja existentes. Retira primero las dependencias de una actividad que vas a eliminar o convertir en padre.",
      );
  }
  validateFinancialRelations(p);
  planning(p);
}
export function control(p: Project) {
  return p.control ?? controlSchema.parse({});
}
export function planning(p: Project) {
  const rows = p.activities.filter(
    (a) =>
      !a.deletedAt &&
      a.status !== "Cancelada" &&
      !p.activities.some((b) => !b.deletedAt && b.parentId === a.id),
  );
  const ids = new Set(rows.map((a) => a.id));
  const result = calculateCPM(
    rows.map((a) => ({ id: a.id, duration: a.duration })),
    rows.flatMap((a) =>
      a.dependencies
        .filter((id) => ids.has(id))
        .map((id) => ({
          predecessorId: id,
          successorId: a.id,
          lagDays: a.dependencyLags?.[id] ?? 0,
        })),
    ),
  );
  const c = control(p);
  const finishOffset = Math.max(
    0,
    ...result.items.map((row) =>
      Math.max(
        row.earlyStart,
        row.earlyFinish - (rows.find((a) => a.id === row.id)!.duration ? 1 : 0),
      ),
    ),
  );
  const finish = addWorkingDays(p.start, finishOffset, c.workingDays);
  const projectDeadline = new Date(Date.parse(p.start) + p.weeks * 604800000)
    .toISOString()
    .slice(0, 10);
  const deadline =
    c.deliveryDate && c.deliveryDate < projectDeadline
      ? c.deliveryDate
      : projectDeadline;
  return {
    ...result,
    finish,
    deadline,
    projectDeadline,
    overflowDays: Math.max(
      0,
      workingDayDistance(deadline, finish, c.workingDays),
    ),
    missingDates: p.activities.filter((a) => a.unscheduled && !a.deletedAt)
      .length,
  };
}
export function reschedule(p: Project) {
  const plan = planning(p),
    days = control(p).workingDays;
  for (const row of plan.items) {
    const a = p.activities.find((a) => a.id === row.id)!;
    a.start = addWorkingDays(p.start, row.earlyStart, days);
    a.end = addWorkingDays(
      p.start,
      Math.max(row.earlyStart, row.earlyFinish - (a.duration ? 1 : 0)),
      days,
    );
    a.unscheduled = false;
  }
  return plan;
}
export function budgetTotals(p: Project, teamId = "") {
  const c = control(p),
    items = c.budget.filter((b) => !teamId || b.teamId === teamId),
    expenses = c.expenses.filter((e) => !teamId || e.teamId === teamId);
  const planned = items.reduce((s, b) => s + b.quantity * b.unitPriceCents, 0);
  const spent = expenses
    .filter((e) => e.status === "approved")
    .reduce((s, e) => s + e.amountCents, 0);
  const pending = expenses
    .filter((e) => e.status === "pending")
    .reduce((s, e) => s + e.amountCents, 0);
  return {
    planned,
    spent,
    pending,
    remaining: planned - spent,
    percent: planned ? Math.round((spent / planned) * 100) : 0,
  };
}
export function validateCompletion(p: Project, a: Activity) {
  if (!control(p).requireCrossReview || a.status !== "Hecha") return;
  const reviewer = p.members.find((m) => m.id === a.reviewerId);
  if (!a.evidence?.length || !reviewer || reviewer.teamId === a.teamId)
    throw Error(
      "Para marcar Hecha, añade evidencia y una revisión realizada por otro equipo.",
    );
}
export function csv(rows: (string | number)[][]) {
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((v) => {
            let s = String(v);
            if (typeof v === "string" && /^[=+@\-\t\r]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function parseMoney(value: string) {
  const clean = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean))
    throw Error("Escribe un importe positivo con hasta dos decimales.");
  const [whole, decimal = ""] = clean.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents))
    throw Error("Importe fuera del rango permitido.");
  return cents;
}
export function weeklyLoads(p: Project) {
  const days = control(p).workingDays;
  return p.members.map((m) => ({
    personId: m.id,
    name: m.name,
    teamId: m.teamId,
    weeks: Array.from({ length: p.weeks }, (_, w) => {
      const start = new Date(Date.parse(p.start) + w * 604800000)
          .toISOString()
          .slice(0, 10),
        end = new Date(Date.parse(start) + 7 * 86400000)
          .toISOString()
          .slice(0, 10);
      const tasks = p.activities.filter(
        (a) =>
          !a.deletedAt &&
          !a.unscheduled &&
          a.status !== "Cancelada" &&
          a.responsible.includes(m.id) &&
          a.end >= start &&
          a.start < end &&
          !p.activities.some((b) => b.parentId === a.id && !b.deletedAt),
      );
      const load = tasks.reduce((sum, a) => {
        const span = Math.max(1, workingDaysInclusive(a.start, a.end, days)),
          left = a.start > start ? a.start : start,
          right =
            a.end < end
              ? a.end
              : new Date(Date.parse(end) - 86400000).toISOString().slice(0, 10);
        const overlap = workingDaysInclusive(left, right, days);
        return (
          sum +
          ((a.effortDays ?? a.duration) * overlap) /
            span /
            Math.max(1, a.responsible.length)
        );
      }, 0);
      return {
        week: w + 1,
        days: load,
        overloaded: load > (m.capacityDays ?? days),
        tasks: tasks.map((a) => a.code),
      };
    }),
  }));
}

export function validateFinancialRelations(p: Project) {
  const c = control(p),
    team = (id: string) => p.teams.some((t) => t.id === id),
    activity = (id: string) => !id || p.activities.some((a) => a.id === id);
  for (const list of [c.budget, c.expenses, c.files, c.risks, c.records])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw Error("Hay identificadores de control duplicados.");
  for (const b of c.budget) {
    if (!team(b.teamId) || !activity(b.activityId))
      throw Error("La partida contiene un equipo o actividad inexistente.");
  }
  for (const e of c.expenses) {
    if (!team(e.teamId) || !activity(e.activityId))
      throw Error("El gasto contiene un equipo o actividad inexistente.");
    if (
      e.budgetItemId &&
      !c.budget.some((b) => b.id === e.budgetItemId && b.teamId === e.teamId)
    )
      throw Error("La partida debe pertenecer al equipo del gasto.");
    if (e.receiptId && !c.files.some((f) => f.id === e.receiptId))
      throw Error("El comprobante del gasto no existe.");
    if (!p.members.some((m) => m.id === e.paidBy))
      throw Error("El responsable del gasto debe pertenecer al proyecto.");
  }
  for (const list of [p.activities, c.budget, c.expenses, c.risks, c.records]) {
    const keys = list
      .map((x) =>
        "importKey" in x && x.importKey
          ? ("kind" in x ? String(x.kind) + "|" : "") + x.importKey
          : "",
      )
      .filter(Boolean)
      .map((k) =>
        String(k)
          .trim()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase(),
      );
    if (new Set(keys).size !== keys.length)
      throw Error(
        "Hay referencias externas duplicadas; corrígelas antes de importar.",
      );
  }
}
