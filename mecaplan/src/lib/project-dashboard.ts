import { leafActivities, states, type Project } from "./model";
import { control } from "./control";

export const projectStatusLabels = {
  planning: "En planificación",
  active: "En marcha",
  closed: "Cerrado",
  archived: "Archivado",
};

/** Count leaves, not parent groups; unscheduled dates are provisional, never overdue. */
export function projectDashboard(p: Project, date: string) {
  const rows = leafActivities(p),
    c = control(p);
  const completed = rows.filter((a) => a.status === "Hecha").length;
  return {
    total: rows.length,
    completed,
    progress: rows.length ? Math.round((completed / rows.length) * 100) : 0,
    overdue: rows.filter(
      (a) => !a.unscheduled && a.status !== "Hecha" && a.end < date,
    ).length,
    blocked: rows.filter((a) => a.status === "Bloqueada").length,
    unscheduled: rows.filter((a) => a.unscheduled && a.status !== "Hecha")
      .length,
    states: states
      .filter((s) => s !== "Cancelada")
      .map((status) => ({
        status,
        count: rows.filter((a) => a.status === status).length,
      })),
    openRisks: c.risks.filter((r) => r.status === "open").length,
    highRisks: c.risks.filter(
      (r) => r.status === "open" && r.probability * r.impact >= 15,
    ).length,
    plannedCents: c.budget.reduce(
      (sum, b) => sum + b.quantity * b.unitPriceCents,
      0,
    ),
    approvedCents: c.expenses
      .filter((e) => e.status === "approved")
      .reduce((sum, e) => sum + e.amountCents, 0),
    currency: c.currency,
    documents: c.files.length,
  };
}

export function portfolioDashboard(projects: Project[], date: string) {
  const summaries = projects.map((p) => projectDashboard(p, date));
  const total = summaries.reduce((n, s) => n + s.total, 0);
  const completed = summaries.reduce((n, s) => n + s.completed, 0);
  return {
    total,
    completed,
    progress: total ? Math.round((completed / total) * 100) : 0,
    active: projects.filter((p) => p.status === "active").length,
    overdue: summaries.reduce((n, s) => n + s.overdue, 0),
    blocked: summaries.reduce((n, s) => n + s.blocked, 0),
    openRisks: summaries.reduce((n, s) => n + s.openRisks, 0),
    people: new Set(projects.flatMap((p) => p.members.map((m) => m.id))).size,
  };
}
