"use client";
import { Dialog } from "./dialog";
import { EvaluationVersions } from "./evaluation-versions";
import { WorkflowPanel } from "./workflow-panel";
import { changeTarget } from "@/lib/change-target";
import { leafActivities } from "@/lib/model";
import { useState, useEffect, type ReactNode, type FormEvent } from "react";
import {
  Plus,
  Download,
  Check,
  X,
  TriangleAlert,
  CalendarDays,
  GitBranch,
  Users,
  ChartNoAxesCombined,
  FileText,
  Upload,
  ArrowRight,
  ShieldCheck,
  Link2,
  Copy,
  Settings2,
} from "lucide-react";
import {
  type Project,
  type PublicUser,
  type Activity,
  today,
  states,
  progress,
} from "@/lib/model";
import { type Control, type Evaluation } from "@/lib/phase-schema";
import {
  control,
  planning,
  budgetTotals,
  parseMoney,
  weeklyLoads,
  scheduledCriticalIds,
} from "@/lib/control";
import { byCode } from "@/lib/codes";
import { uploadAccept, uploadTypesLabel } from "@/lib/upload-types";
import { workingDayDistance } from "@/lib/cpm";
import { can } from "@/server/auth/permissions";
import { RiskPanel } from "./risk-panel";
import { ImportPanel } from "./import-panel";
import { StoragePanel } from "./storage-panel";
import { PlanningGantt } from "./planning-gantt";
import { ProgressCurve } from "./progress-curve";
export type PhaseView =
  | "setup"
  | "interfaces"
  | "weekly"
  | "imports"
  | "storage"
  | "planning"
  | "budget"
  | "changes"
  | "risks"
  | "records"
  | "files"
  | "matrix"
  | "evaluation"
  | "context";
export const phaseTitles: Record<PhaseView, string> = {
  setup: "Preparar el proyecto",
  interfaces: "Entregas entre equipos",
  weekly: "Reunión semanal",
  imports: "Importar Excel",
  storage: "OneDrive y archivos",
  planning: "Cronograma y planificación",
  budget: "Presupuesto y gastos",
  changes: "Solicitudes de cambio",
  risks: "Riesgos del proyecto",
  records: "Bitácora y revisiones",
  files: "Archivos y evidencias",
  matrix: "Matriz de gestión",
  evaluation: "Evaluación del ingeniero",
  context: "Agentes, plantillas y respaldo",
};
export const phaseDescriptions: Record<PhaseView, string> = {
  setup:
    "Confirma responsables, fechas y el plan antes de guardar la línea base.",
  interfaces: "Coordina entregas, evidencia y recepción entre equipos.",
  weekly: "Compromisos, bloqueos y decisiones de los próximos siete días.",
  imports: "Lleva tus hojas de Excel a las tablas del proyecto.",
  storage: "Documentos y evidencias en tu OneDrive institucional.",
  planning: "Fechas, dependencias y carga para coordinar el siguiente avance.",
  budget: "Planifica los costos y revisa cada gasto del equipo.",
  changes: "Acuerdos claros antes de ajustar el proyecto.",
  risks: "Anticipa los obstáculos y registra cómo resolverlos.",
  records: "Acuerdos, revisiones y pruebas con evidencia.",
  files: "Los documentos y evidencias de tu proyecto, en un lugar.",
  matrix: "Tu matriz de Digit 360, conectada con el trabajo del equipo.",
  evaluation: "Criterios y observaciones reservados al ingeniero.",
  context: "Comparte contexto, reutiliza planes y conserva tus respaldos.",
};
type Props = {
  view: PhaseView;
  project: Project;
  user: PublicUser;
  busy: boolean;
  action: (name: string, data?: unknown) => Promise<any>;
  refresh: () => Promise<void>;
  rows: Activity[];
  filters: Record<string, string>;
  changeFilter: (key: string, value: string) => void;
  openFilters: () => void;
  clearFilters: () => void;
};
const shortDate = (v: string) =>
  v
    ? new Date(v + "T12:00:00").toLocaleDateString("es-GT", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Sin fecha";
const labels: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  open: "Abierto",
  mitigated: "Mitigado",
  closed: "Cerrado",
  meeting: "Actas de reunión",
  weekly: "Bitácora semanal",
  reception: "Recepción de línea base",
  acceptance: "Pruebas de aceptación",
  checklist: "Listas de revisión",
  pass: "Cumple",
  fail: "No cumple",
};
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="phase-empty">
      <FileText size={29} />
      <p>{children}</p>
    </div>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={"phase-status " + value}>{labels[value] ?? value}</span>
  );
}
export function PhasePanel(props: Props) {
  const {
    view,
    project: p,
    user,
    busy,
    action,
    refresh,
    rows,
    filters,
    changeFilter,
    openFilters,
    clearFilters,
  } = props;
  const c = control(p),
    plan = planning(p),
    critical = scheduledCriticalIds(p),
    admin = can(user, "project:edit", p),
    person = (id: string) =>
      p.members.find((m) => m.id === id)?.name ?? "Sin asignar",
    team = (id: string) => p.teams.find((t) => t.id === id)?.name ?? id,
    money = (cents: number) =>
      new Intl.NumberFormat("es-HN", {
        style: "currency",
        currency: c.currency,
      }).format(cents / 100);
  const [changeType, setChangeType] = useState("duration"),
    [changeScope, setChangeScope] = useState("project"),
    [changeEntity, setChangeEntity] = useState(""),
    [changeValue, setChangeValue] = useState(""),
    [expenseTeam, setExpenseTeam] = useState(""),
    [privateHistory, setPrivateHistory] = useState<any[]>([]),
    [archivedGrades, setArchivedGrades] = useState<any[]>([]);
  const [tab, setTab] = useState("gantt"),
    [budgetTab, setBudgetTab] = useState("items"),
    [kind, setKind] = useState("weekly"),
    [sheet, setSheet] = useState(c.matrixSheets[0]?.name ?? ""),
    [dialog, setDialog] = useState<{ kind: string; value?: any } | null>(null),
    [error, setError] = useState(""),
    [draftPlan, setDraftPlan] = useState<{
      revision?: number;
      id: string;
      duration: number;
      dependencies: string[];
      dependencyLags: Record<string, number>;
    } | null>(null),
    [preview, setPreview] = useState<any>(null),
    [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  useEffect(() => {
    setError("");
    setDialog(null);
    setPrivateHistory([]);
    setArchivedGrades([]);
    setDraftPlan(null);
    setPreview(null);
  }, [view, p.id]);
  useEffect(() => {
    if (view === "evaluation" && user.isInstructor)
      fetch("/api/evaluations?projectId=" + encodeURIComponent(p.id), {
        cache: "no-store",
      })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw Error(data.error);
          setEvaluations(data.evaluations);
        })
        .catch((e) => setError(e.message));
  }, [view, p.id, p.history.length]);
  async function run(name: string, data?: unknown) {
    setError("");
    try {
      return await action(name, data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      throw e;
    }
  }
  const url = (format: string, scope = "") =>
    `/api/export?projectId=${encodeURIComponent(p.id)}&format=${format}${scope ? "&team=" + encodeURIComponent(scope) : ""}`;
  const field = (
    name: string,
    label: string,
    defaultValue: any = "",
    type = "text",
    required = true,
  ) => (
    <label>
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        type={type}
        required={required}
        step={type === "number" ? "1" : undefined}
      />
    </label>
  );
  const select = (
    name: string,
    label: string,
    options: { value: string; label: string }[],
    value = "",
    required = true,
  ) => (
    <label>
      {label}
      <select name={name} defaultValue={value} required={required}>
        {!required && <option value="">Sin asociar</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const teams = p.teams.map((t) => ({ value: t.id, label: t.name })),
    people = p.members.map((m) => ({ value: m.id, label: m.name })),
    tasks = p.activities
      .filter((a) => !a.deletedAt)
      .sort(byCode)
      .map((a) => ({ value: a.id, label: a.code + " · " + a.title }));
  const startDialog = (kind: string, value?: any) => {
    setError("");
    if (kind === "change") {
      setChangeType("duration");
      setChangeScope("project");
      setChangeEntity("");
      setChangeValue("");
    }
    if (kind === "expense")
      setExpenseTeam(
        value?.teamId ??
          p.members.find((m) => m.id === user.id)?.teamId ??
          p.teams[0]?.id ??
          "",
      );
    setDialog({ kind, value });
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      get = (key: string) => String(f.get(key) ?? ""),
      num = (key: string) => Number(f.get(key)),
      old = dialog?.value ?? {},
      id = old.id ?? crypto.randomUUID();
    try {
      if (dialog?.kind === "budget")
        await run("saveBudgetItem", {
          id,
          teamId: get("teamId"),
          activityId: get("activityId"),
          category: get("category"),
          name: get("name"),
          quantity: num("quantity"),
          unitPriceCents: parseMoney(get("price")),
          supplier: get("supplier"),
          url: get("url"),
          notes: get("notes"),
          isBom: f.get("isBom") === "on",
        });
      if (dialog?.kind === "expense") {
        let receiptId = get("receiptId");
        if (get("receiptUrl")) {
          const response = await fetch("/api/files", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectId: p.id,
                name: "Comprobante · " + get("description"),
                url: get("receiptUrl"),
                activityId: get("activityId"),
              }),
            }),
            result = await response.json();
          if (!response.ok) throw Error(result.error);
          receiptId = result.file.id;
        }
        await run(old.id ? "editExpense" : "addExpense", {
          id,
          teamId: get("teamId"),
          budgetItemId: get("budgetItemId"),
          activityId: get("activityId"),
          amountCents: parseMoney(get("amount")),
          date: get("date"),
          paidBy: user.id,
          description: get("description"),
          receiptId,
          status: "pending",
          decidedBy: "",
        });
      }
      if (dialog?.kind === "risk")
        await run("saveRisk", {
          id,
          description: get("description"),
          probability: num("probability"),
          impact: num("impact"),
          mitigation: get("mitigation"),
          nextAction: get("nextAction"),
          dueDate: get("dueDate"),
          ownerId: get("ownerId"),
          status: get("status"),
        });
      if (dialog?.kind === "record") {
        const items = get("items")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((title, i) => ({
            id: old.items?.[i]?.id ?? crypto.randomUUID(),
            title,
            done: old.items?.[i]?.done ?? false,
          }));
        await run("saveRecord", {
          id,
          kind,
          teamId: get("teamId"),
          title: get("title"),
          date: get("date"),
          body: get("body"),
          ownerId: old.ownerId ?? user.id,
          completed: f.get("completed") === "on",
          items,
          target: get("target"),
          measurement: get("measurement"),
          result: get("result") || "pending",
          evidence: get("evidence"),
          attendees: f.getAll("attendee").map(String),
        });
      }
      if (dialog?.kind === "change") {
        const type = get("type"),
          value =
            type === "duration"
              ? num("value")
              : type === "budget"
                ? parseMoney(get("value"))
                : get("value");
        await run("requestChange", {
          id,
          type,
          targetType: get("targetType"),
          activityId: get("activityId"),
          description: get("description"),
          reason: get("reason"),
          impact: get("impact"),
          value,
          status: "pending",
          requestedBy: user.id,
          date: new Date().toISOString(),
        });
      }
      if (dialog?.kind === "milestone")
        await run("saveMilestone", {
          id,
          title: get("title"),
          date: get("date"),
          points: get("points") === "" ? null : num("points"),
          criteria: get("criteria"),
          approved: f.get("approved") === "on",
        });
      if (dialog?.kind === "settings")
        await run("saveControlSettings", {
          currency: get("currency").toUpperCase(),
          workingDays: num("workingDays"),
          integrationLeadId: get("integrationLeadId"),
          requireCrossReview: f.get("cross") === "on",
          deliveryDate: get("deliveryDate"),
        });
      if (dialog?.kind === "evaluation") {
        const names = f.getAll("criterion").map(String),
          scores = f.getAll("score").map(Number),
          maxes = f.getAll("max").map(Number),
          comments = f.getAll("criterionComment").map(String);
        await run("saveEvaluation", {
          id,
          projectId: p.id,
          authorId: user.id,
          title: get("title"),
          targetType: get("targetType"),
          targetId: get("targetId"),
          date: get("date"),
          criteria: names.map((name, i) => ({
            name,
            score: scores[i],
            max: maxes[i],
            comment: comments[i],
          })),
          notes: get("notes"),
          published: f.get("published") === "on",
        });
        const r = await fetch("/api/evaluations?projectId=" + p.id);
        setEvaluations((await r.json()).evaluations);
      }
      if (dialog?.kind === "clone")
        await run("cloneProject", {
          id: p.id,
          name: get("name"),
          weeks: num("weeks"),
          scale: f.get("scale") === "on",
        });
      if (dialog?.kind === "template")
        await run("createTemplate", { name: get("name"), weeks: num("weeks") });
      if (dialog?.kind === "repository")
        await run("saveRepository", {
          id,
          teamId: get("teamId"),
          fullName: get("fullName"),
        });
      setDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }
  const statusButtons = (name: string, id: string) =>
    admin && (
      <div className="phase-row-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => run(name, { id, status: "approved" }).catch(() => {})}
        >
          <Check size={14} />
          Aprobar
        </button>
        <button
          className="secondary danger"
          disabled={busy}
          onClick={() => run(name, { id, status: "rejected" }).catch(() => {})}
        >
          <X size={14} />
          Rechazar
        </button>
      </div>
    );
  const filterBar = (
    <div className="phase-filter">
      <input
        aria-label="Buscar en cronograma"
        placeholder="Buscar actividad…"
        value={filters.q}
        onChange={(e) => changeFilter("q", e.target.value)}
      />
      <select
        aria-label="Equipo del cronograma"
        value={filters.team}
        onChange={(e) => changeFilter("team", e.target.value)}
      >
        <option value="">Todos los equipos</option>
        {teams.map((t) => (
          <option value={t.value} key={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Estado del cronograma"
        value={filters.status}
        onChange={(e) => changeFilter("status", e.target.value)}
      >
        <option value="">Todos los estados</option>
        <option value="completed">Completadas</option>
        <option value="open">No completadas</option>
        {states.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <button className="secondary" onClick={openFilters}>
        Más filtros
      </button>
      <button className="text-btn" onClick={clearFilters}>
        Limpiar
      </button>
    </div>
  );
  return (
    <div className="phase-area">
      {["setup", "interfaces", "weekly"].includes(view) && (
        <WorkflowPanel
          kind={view as "setup" | "interfaces" | "weekly"}
          project={p}
          user={user}
          action={action}
          busy={busy}
        />
      )}{" "}
      {view === "imports" && <ImportPanel project={p} refresh={refresh} />}{" "}
      {view === "storage" && (
        <StoragePanel project={p} user={user} refresh={refresh} action={run} />
      )}{" "}
      {error && !dialog && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {view === "planning" && (
        <>
          <div className="phase-toolbar">
            <div className="phase-tabs">
              {[
                ["gantt", "Gantt", CalendarDays],
                ["network", "Ruta crítica", GitBranch],
                ["curve", "Curva S", ChartNoAxesCombined],
                ["load", "Carga de trabajo", Users],
                ["milestones", "Hitos", Check],
              ].map(([key, label, Icon]) => {
                const I = Icon as typeof CalendarDays;
                return (
                  <button
                    key={String(key)}
                    className={tab === key ? "active" : ""}
                    onClick={() => setTab(String(key))}
                  >
                    <I size={16} />
                    {String(label)}
                  </button>
                );
              })}
            </div>
            <div className="phase-actions">
              {admin && (
                <>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "¿Guardar las fechas y duraciones actuales como nueva línea base?",
                        )
                      )
                        run("saveBaseline").catch(() => {});
                    }}
                  >
                    Guardar línea base
                  </button>
                  <button
                    className="secondary"
                    onClick={() => startDialog("settings")}
                  >
                    <Settings2 size={15} />
                    Calendario
                  </button>
                </>
              )}
              <a className="secondary" href={url("tasks")}>
                <Download size={15} />
                CSV
              </a>
            </div>
          </div>
          {plan.missingDates > 0 && (
            <div className="phase-warning">
              <TriangleAlert size={18} />
              <span>
                <strong>{plan.missingDates} actividades sin planificar.</strong>{" "}
                Las fechas y duraciones CPM son provisionales. Confírmalas antes
                de usarlas como compromiso.
              </span>
            </div>
          )}
          {plan.overflowDays > 0 && (
            <div className="phase-warning danger">
              <TriangleAlert size={18} />
              <span>
                La ruta crítica excede el proyecto por{" "}
                <strong>{plan.overflowDays} días hábiles</strong>. Puedes
                ajustar el plan sin bloquear el trabajo.
              </span>
            </div>
          )}
          <div className="phase-stats">
            <article>
              <small>Duración por ruta crítica</small>
              <strong>{plan.duration} días hábiles</strong>
            </article>
            <article>
              <small>
                Fin calculado {plan.missingDates ? "· provisional" : ""}
              </small>
              <strong>{shortDate(plan.finish)}</strong>
            </article>
            <article>
              <small>Fecha límite</small>
              <strong>{shortDate(plan.deadline)}</strong>
            </article>
            <article>
              <small>Última línea base</small>
              <strong>
                {c.baselines.length
                  ? shortDate(c.baselines.at(-1)!.date.slice(0, 10))
                  : "Sin guardar"}
              </strong>
            </article>
          </div>
          {(tab === "gantt" || tab === "network") && filterBar}
          {tab === "gantt" && (
            <PlanningGantt
              project={p}
              rows={rows}
              onEdit={(a) => {
                if (can(user, "activity:edit", p, a)) {
                  setDraftPlan({
                    id: a.id,
                    revision: a.revision,
                    duration: a.duration,
                    dependencies: [...a.dependencies],
                    dependencyLags: { ...a.dependencyLags },
                  });
                  setPreview(null);
                }
              }}
            />
          )}
          {tab === "network" && (
            <section className="panel">
              <div className="phase-table-wrap">
                <table className="phase-table">
                  <thead>
                    <tr>
                      <th>Actividad</th>
                      <th>Predecesoras / interfaces</th>
                      <th>Temprano</th>
                      <th>Tardío</th>
                      <th>Holgura</th>
                      <th>Plan / real</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => {
                      const r = plan.items.find((r) => r.id === a.id),
                        b = c.baselines
                          .at(-1)
                          ?.items.find((b) => b.id === a.id);
                      return (
                        <tr
                          key={a.id}
                          className={critical.has(a.id) ? "critical-row" : ""}
                        >
                          <td>
                            <strong>{a.code}</strong>
                            <p>{a.title}</p>
                          </td>
                          <td>
                            {a.dependencies.map((id) => {
                              const pred = p.activities.find(
                                (x) => x.id === id,
                              );
                              return (
                                <div key={id}>
                                  {pred?.teamId !== a.teamId && (
                                    <Link2 size={12} />
                                  )}{" "}
                                  {pred?.code ?? id} · desfase{" "}
                                  {a.dependencyLags?.[id] ?? 0} d{" "}
                                  {pred?.status !== "Hecha"
                                    ? "· pendiente"
                                    : ""}
                                </div>
                              );
                            })}
                          </td>
                          <td>
                            {r?.earlyStart ?? "—"} / {r?.earlyFinish ?? "—"}
                          </td>
                          <td>
                            {r?.lateStart ?? "—"} / {r?.lateFinish ?? "—"}
                          </td>
                          <td>
                            {critical.has(a.id) ? (
                              <span className="phase-status rejected">
                                Crítica · 0 d
                              </span>
                            ) : a.unscheduled ? (
                              "Provisional"
                            ) : (
                              (r?.slack ?? "—") + " d"
                            )}
                          </td>
                          <td>
                            {b
                              ? workingDayDistance(
                                  b.end,
                                  a.actualEnd ?? a.end,
                                  c.workingDays,
                                ) + " d de desvío"
                              : "Sin línea base"}
                          </td>
                          <td>
                            {can(user, "activity:edit", p, a) && (
                              <button
                                className="text-btn"
                                onClick={() => {
                                  setDraftPlan({
                                    id: a.id,
                                    revision: a.revision,
                                    duration: a.duration,
                                    dependencies: [...a.dependencies],
                                    dependencyLags: { ...a.dependencyLags },
                                  });
                                  setPreview(null);
                                }}
                              >
                                Planificar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {tab === "curve" && <ProgressCurve project={p} />}
          {tab === "load" && (
            <section className="panel">
              <h2>Carga por persona y semana</h2>
              <p className="form-note">
                Días estimados repartidos entre las personas R. Capacidad de
                referencia: {c.workingDays} días por semana. Las tareas sin
                planificar se excluyen. Las cifras semanales son aproximadas; el
                total conserva el esfuerzo calculado.
              </p>
              <div className="phase-table-wrap">
                <table className="phase-table load-table">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th>Total estimado</th>
                      {Array.from({ length: p.weeks }, (_, i) => (
                        <th key={i}>S{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyLoads(p).map((m) => (
                      <tr key={m.personId}>
                        <td>{m.name}</td>
                        <td>
                          {m.weeks
                            .reduce((sum, w) => sum + w.days, 0)
                            .toLocaleString("es-HN", {
                              maximumFractionDigits: 2,
                            })}{" "}
                          d
                        </td>
                        {m.weeks.map((w) => (
                          <td
                            key={w.week}
                            title={w.tasks.join(", ")}
                            className={
                              w.overloaded
                                ? "load-over"
                                : w.days === 0
                                  ? "load-zero"
                                  : ""
                            }
                          >
                            {w.days ? "≈ " : ""}
                            {w.days.toLocaleString("es-HN", {
                              maximumFractionDigits: 2,
                            })}{" "}
                            d
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className="form-section">Trabajo en curso</h3>
              {p.members.map((m) => {
                const n = p.activities.filter(
                  (a) =>
                    a.status === "En progreso" &&
                    a.responsible.includes(m.id) &&
                    !a.deletedAt,
                ).length;
                return (
                  <p className={n > 3 ? "form-error" : "form-note"} key={m.id}>
                    {m.name}: {n} en progreso
                    {n > 3 ? " · supera el máximo de referencia de 3" : ""}
                  </p>
                );
              })}
            </section>
          )}
          {tab === "milestones" && (
            <section className="panel">
              <div className="section-heading">
                <h2>Hitos y entregables</h2>
                {admin && (
                  <button
                    className="primary"
                    onClick={() => startDialog("milestone")}
                  >
                    <Plus size={16} />
                    Nuevo hito
                  </button>
                )}
              </div>
              {!c.milestones.length ? (
                <Empty>Registra entregas, revisiones y demostraciones.</Empty>
              ) : (
                c.milestones.map((m) => (
                  <article className="phase-entry" key={m.id}>
                    <CalendarDays size={21} />
                    <div>
                      <h3>{m.title}</h3>
                      <p>{m.criteria}</p>
                      <small>
                        {shortDate(m.date)} ·{" "}
                        {m.points === null
                          ? "Control interno"
                          : m.points + " puntos"}{" "}
                        ·{" "}
                        {m.approved
                          ? "Aprobado por el ingeniero"
                          : "Pendiente de aprobación"}
                      </small>
                    </div>
                    {admin && (
                      <button
                        className="secondary"
                        onClick={() => startDialog("milestone", m)}
                      >
                        Editar
                      </button>
                    )}
                  </article>
                ))
              )}
            </section>
          )}
        </>
      )}
      {view === "budget" && (
        <>
          <div className="phase-toolbar">
            <div className="phase-tabs">
              {[
                ["items", "Presupuesto"],
                ["expenses", "Gastos y aprobaciones"],
                ["bom", "BOM"],
              ].map(([key, title]) => (
                <button
                  key={key}
                  className={budgetTab === key ? "active" : ""}
                  onClick={() => setBudgetTab(key)}
                >
                  {title}
                </button>
              ))}
            </div>
            <div className="phase-actions">
              {can(user, "budget:edit", p) && (
                <button
                  className="secondary"
                  onClick={() => startDialog("budget")}
                >
                  <Plus size={15} />
                  Nueva partida
                </button>
              )}
              <button
                className="primary"
                onClick={() => startDialog("expense")}
              >
                <Plus size={15} />
                Registrar gasto
              </button>
              <a
                className="secondary"
                href={url(budgetTab === "bom" ? "bom" : "budget")}
              >
                <Download size={15} />
                CSV
              </a>
            </div>
          </div>
          <div className="phase-stats">
            {Object.entries({
              planned: "Presupuestado",
              spent: "Gastado aprobado",
              pending: "Pendiente de aprobar",
              remaining: "Restante",
            }).map(([key, label]) => (
              <article key={key}>
                <small>{label}</small>
                <strong>{money(budgetTotals(p)[key as "planned"])}</strong>
              </article>
            ))}
          </div>
          {(budgetTotals(p).percent >= 80 || budgetTotals(p).remaining < 0) && (
            <div className="phase-warning">
              <TriangleAlert size={19} />
              <p>
                Presupuesto ejecutado:{" "}
                <strong>{budgetTotals(p).percent}%</strong>.{" "}
                {budgetTotals(p).remaining < 0
                  ? "El gasto aprobado supera el presupuesto."
                  : "Se alcanzó el umbral del 80%."}
              </p>
            </div>
          )}
          <section className="panel">
            <div className="section-heading">
              <h2>
                {budgetTab === "bom"
                  ? "Lista de materiales"
                  : budgetTab === "expenses"
                    ? "Gastos reales"
                    : "Partidas del presupuesto"}
              </h2>
              <span className="mini-label">
                {c.currency} · PRECISIÓN EN CENTAVOS
              </span>
            </div>
            {budgetTab !== "expenses" ? (
              <>
                <div className="phase-table-wrap">
                  <table className="phase-table">
                    <thead>
                      <tr>
                        <th>Partida</th>
                        <th>Equipo</th>
                        <th>Categoría</th>
                        <th>Cantidad</th>
                        <th>Precio unitario</th>
                        <th>Total</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {c.budget
                        .filter((b) => budgetTab !== "bom" || b.isBom)
                        .map((b) => (
                          <tr key={b.id}>
                            <td>
                              <strong>{b.name}</strong>
                              <p>
                                {b.supplier}
                                {b.url && (
                                  <>
                                    {" "}
                                    ·{" "}
                                    <a
                                      href={b.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Proveedor ↗
                                    </a>
                                  </>
                                )}
                              </p>
                            </td>
                            <td>{team(b.teamId)}</td>
                            <td>{b.category}</td>
                            <td>{b.quantity}</td>
                            <td>{money(b.unitPriceCents)}</td>
                            <td>{money(b.quantity * b.unitPriceCents)}</td>
                            <td>
                              {can(user, "budget:edit", p) && (
                                <button
                                  className="text-btn"
                                  onClick={() => startDialog("budget", b)}
                                >
                                  Editar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!c.budget.length && (
                  <Empty>
                    Todavía no hay partidas. Agrega la primera con «Nueva
                    partida» o impórtalas desde Excel; las partidas sin precio
                    quedan en {money(0)} hasta que lo completes.
                  </Empty>
                )}
              </>
            ) : (
              <>
                {!c.expenses.length && (
                  <Empty>No se han registrado gastos.</Empty>
                )}
                {c.expenses.map((e) => (
                  <article className="phase-entry" key={e.id}>
                    <div>
                      <Status value={e.status} />
                      <h3>{e.description}</h3>
                      <p>
                        {team(e.teamId)} · {person(e.paidBy)} ·{" "}
                        {shortDate(e.date)}
                      </p>
                      {e.receiptId && (
                        <a href={"/api/files/" + e.receiptId}>
                          Descargar comprobante
                        </a>
                      )}
                    </div>
                    <strong>{money(e.amountCents)}</strong>
                    {e.status === "pending" &&
                      (e.paidBy === user.id || can(user, "approve", p)) && (
                        <button
                          className="secondary"
                          onClick={() => startDialog("expense", e)}
                        >
                          Corregir gasto
                        </button>
                      )}
                    {e.status === "pending" &&
                      statusButtons("decideExpense", e.id)}
                  </article>
                ))}
              </>
            )}
          </section>
          <section className="panel">
            <h2>Costo y avance por equipo</h2>
            <div className="phase-team-costs">
              {p.teams.map((t) => {
                const totals = budgetTotals(p, t.id),
                  activities = leafActivities(p).filter(
                    (a) => a.teamId === t.id,
                  ),
                  done = activities.filter((a) => a.status === "Hecha").length,
                  advance = activities.length
                    ? Math.round((done / activities.length) * 100)
                    : 0;
                return (
                  <article key={t.id}>
                    <h3>{t.name}</h3>
                    <p>
                      {money(totals.spent)} de {money(totals.planned)}
                    </p>
                    <small>
                      {totals.percent}% del costo · {advance}% de avance
                    </small>
                    {totals.percent > advance && totals.planned > 0 && (
                      <p className="cost-attention">
                        El gasto va por delante del avance.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
          <section className="panel">
            <h2>Costos por categoría</h2>
            <div className="phase-table-wrap">
              <table className="phase-table">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Presupuestado</th>
                    <th>Gastado aprobado</th>
                    <th>Pendiente</th>
                    <th>Restante</th>
                    <th>Ejecutado</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...new Set([
                      ...c.budget.map((b) => b.category),
                      "Sin partida",
                    ]),
                  ].map((category) => {
                    const items = c.budget.filter(
                        (b) => b.category === category,
                      ),
                      ids = new Set(items.map((b) => b.id)),
                      expenses = c.expenses.filter((e) =>
                        category === "Sin partida"
                          ? !e.budgetItemId
                          : ids.has(e.budgetItemId),
                      ),
                      planned = items.reduce(
                        (s, b) => s + b.quantity * b.unitPriceCents,
                        0,
                      ),
                      spent = expenses
                        .filter((e) => e.status === "approved")
                        .reduce((s, e) => s + e.amountCents, 0),
                      pending = expenses
                        .filter((e) => e.status === "pending")
                        .reduce((s, e) => s + e.amountCents, 0),
                      percent = planned
                        ? Math.round((spent / planned) * 100)
                        : 0;
                    return (
                      <tr key={category}>
                        <td>{category}</td>
                        <td>{money(planned)}</td>
                        <td>{money(spent)}</td>
                        <td>{money(pending)}</td>
                        <td>{money(planned - spent)}</td>
                        <td
                          className={
                            spent > planned || percent >= 80
                              ? "cost-attention"
                              : ""
                          }
                        >
                          {percent}%
                          {spent > planned
                            ? " · excedido"
                            : percent >= 80
                              ? " · atención"
                              : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {view === "changes" && (
        <section className="panel">
          <div className="section-heading">
            <h2>Solicitudes de cambio</h2>
            <button className="primary" onClick={() => startDialog("change")}>
              <Plus size={16} />
              Solicitar cambio
            </button>
          </div>
          <p className="form-note">
            Al aprobar, el cambio se aplica y queda registrado. Alcance, fechas,
            duración, presupuesto o estado.
          </p>
          {!c.changes.length ? (
            <Empty>No hay cambios pendientes.</Empty>
          ) : (
            c.changes.map((x) => (
              <article className="phase-entry" key={x.id}>
                <div>
                  <Status value={x.status} />
                  <h3>{x.description}</h3>
                  <ChangeDetail project={p} change={x} />
                  <p>Motivo: {x.reason}</p>
                  <p>Impacto: {x.impact || "Sin indicar"}</p>
                  <small>
                    {person(x.requestedBy)} · {shortDate(x.date.slice(0, 10))}
                  </small>
                </div>
                {x.status === "pending" && statusButtons("decideChange", x.id)}
              </article>
            ))
          )}
        </section>
      )}
      {view === "risks" && (
        <RiskPanel
          key={p.id}
          project={p}
          user={user}
          onCreate={() => startDialog("risk")}
          onEdit={(r) => startDialog("risk", r)}
        />
      )}
      {view === "records" && (
        <>
          <div className="phase-toolbar">
            <div className="phase-tabs">
              {[
                "weekly",
                "meeting",
                "reception",
                "acceptance",
                "checklist",
              ].map((k) => (
                <button
                  className={kind === k ? "active" : ""}
                  key={k}
                  onClick={() => setKind(k)}
                >
                  {labels[k]}
                </button>
              ))}
            </div>
            <button className="primary" onClick={() => startDialog("record")}>
              <Plus size={16} />
              Nuevo registro
            </button>
          </div>
          <section className="panel">
            {!c.records.filter((r) => r.kind === kind).length ? (
              <Empty>
                {kind === "checklist"
                  ? "Crea una revisión: esquemático, STEP, firmware o entregable."
                  : "Registra los acuerdos, resultados y evidencias de tu equipo."}
              </Empty>
            ) : (
              c.records
                .filter((r) => r.kind === kind)
                .map((r) => (
                  <article className="phase-record" key={r.id}>
                    <div className="section-heading">
                      <div>
                        <h3>{r.title}</h3>
                        <small>
                          {shortDate(r.date)} · {person(r.ownerId)} ·{" "}
                          {team(r.teamId)}
                        </small>
                      </div>
                      {(admin || r.ownerId === user.id) && (
                        <div className="phase-actions">
                          <button
                            className="secondary"
                            onClick={() => startDialog("record", r)}
                          >
                            Editar
                          </button>
                          <button
                            className="secondary danger"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `¿Eliminar «${r.title}»? Sus documentos en OneDrive se conservan.`,
                                )
                              )
                                run("deleteRecord", { id: r.id }).catch(
                                  () => {},
                                );
                            }}
                          >
                            Eliminar registro
                          </button>
                        </div>
                      )}
                    </div>
                    <p>{r.body}</p>
                    {r.kind === "acceptance" && (
                      <div className="acceptance-results">
                        <p>
                          <strong>Objetivo:</strong> {r.target || "Por definir"}
                        </p>
                        <p>
                          <strong>Medición:</strong>{" "}
                          {r.measurement || "Sin registrar"}
                        </p>
                        <Status value={r.result} />
                        <p>{r.evidence}</p>
                      </div>
                    )}
                    {r.items.map((item, i) => (
                      <label className="checkbox-label" key={item.id}>
                        <input
                          type="checkbox"
                          checked={item.done}
                          disabled={busy || (!admin && r.ownerId !== user.id)}
                          onChange={(e) =>
                            run("saveRecord", {
                              ...r,
                              items: r.items.map((v, j) =>
                                i === j ? { ...v, done: e.target.checked } : v,
                              ),
                            }).catch(() => {})
                          }
                        />
                        {item.title}
                      </label>
                    ))}
                    {r.kind === "meeting" && admin && (
                      <button
                        className="text-link"
                        onClick={() => startDialog("toTask", r)}
                      >
                        Convertir un acuerdo en actividad
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </article>
                ))
            )}
          </section>
        </>
      )}
      {view === "files" && (
        <section className="panel">
          <div className="section-heading">
            <h2>Archivos del proyecto</h2>
            <button className="primary" onClick={() => startDialog("upload")}>
              <Upload size={16} />
              Adjuntar archivo
            </button>
          </div>
          <p className="form-note">
            Los archivos nuevos se guardan en OneDrive. Para asociar enlaces y
            migrar los anteriores, abre OneDrive y archivos. Formatos:{" "}
            {uploadTypesLabel}. Consulta el límite actual en OneDrive y
            archivos; también puedes asociar enlaces de documentos mayores.
          </p>
          {!c.files.length ? (
            <Empty>Añade comprobantes, evidencias y documentos.</Empty>
          ) : (
            c.files.map((f) => (
              <article className="phase-entry" key={f.id}>
                <FileText size={24} />
                <div>
                  <h3>{f.name}</h3>
                  <small>
                    {(f.size / 1024).toFixed(1)} KB · {person(f.uploadedBy)} ·{" "}
                    {shortDate(f.date.slice(0, 10))}
                    {f.activityId
                      ? " · " +
                        p.activities.find((a) => a.id === f.activityId)?.code
                      : ""}
                  </small>
                </div>
                <a className="secondary" href={"/api/files/" + f.id}>
                  <Download size={15} />
                  Descargar
                </a>
              </article>
            ))
          )}
        </section>
      )}
      {view === "matrix" && (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>Matriz Digit 360 integrada</h2>
              {c.sourceFileId && (
                <a className="secondary" href={"/api/files/" + c.sourceFileId}>
                  <Download size={15} />
                  Excel original
                </a>
              )}
            </div>
            <p className="form-note">
              Las actividades de la aplicación son editables y se usan para el
              seguimiento actual. Las hojas originales se conservan como
              referencia de importación.
            </p>
            <div className="matrix-summary">
              <span>
                <strong>
                  {p.activities.filter((a) => !a.deletedAt).length}
                </strong>{" "}
                actividades
              </span>
              <span>
                <strong>{p.members.length}</strong> integrantes
              </span>
              <span>
                <strong>{c.matrixSheets.length}</strong> hojas de referencia
              </span>
            </div>
            {c.importNotes.length > 0 && (
              <details className="import-details">
                <summary>
                  Ver datos pendientes y criterios de importación
                </summary>
                {c.importNotes.map((n, i) => (
                  <p className="import-note" key={i}>
                    {n}
                  </p>
                ))}
              </details>
            )}
          </section>
          <section className="panel">
            <h2>RACI importada por equipo o rol</h2>
            <div className="phase-table-wrap">
              <table className="phase-table">
                <thead>
                  <tr>
                    <th>Actividad</th>
                    {p.teams.map((t) => (
                      <th key={t.id}>{t.name}</th>
                    ))}
                    <th>Responsables personales</th>
                  </tr>
                </thead>
                <tbody>
                  {p.activities
                    .filter((a) => !a.deletedAt)
                    .map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.code}</strong>
                          <p>{a.title}</p>
                        </td>
                        {p.teams.map((t) => (
                          <td key={t.id}>{a.teamRaci?.[t.id] || "—"}</td>
                        ))}
                        <td>
                          {a.responsible.map(person).join(", ") ||
                            "Por asignar"}
                          <p>A: {person(a.accountable)}</p>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          {c.matrixSheets.length > 0 && (
            <section className="panel">
              <div className="section-heading">
                <h2>Hojas del archivo de origen</h2>
                <select
                  aria-label="Hoja del Excel original"
                  value={sheet || c.matrixSheets[0].name}
                  onChange={(e) => setSheet(e.target.value)}
                >
                  {c.matrixSheets.map((s) => (
                    <option key={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="phase-table-wrap raw-matrix">
                <table className="phase-table">
                  <tbody>
                    {(
                      c.matrixSheets.find((s) => s.name === sheet) ??
                      c.matrixSheets[0]
                    ).rows
                      .filter((r) =>
                        r.values.some(
                          (v) =>
                            v !== null &&
                            !(typeof v === "string" && v.startsWith("=")),
                        ),
                      )
                      .map((r) => (
                        <tr key={r.row}>
                          <th>{r.row}</th>
                          {r.values.map((v, i) => (
                            <td
                              key={i}
                              title={
                                typeof v === "string" && v.startsWith("=")
                                  ? v
                                  : undefined
                              }
                            >
                              {typeof v === "string" && v.startsWith("=") ? (
                                <span className="formula-reference">
                                  Fórmula original
                                </span>
                              ) : (
                                String(v ?? "")
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="form-note">
                Las fórmulas se conservan en el Excel original. El seguimiento y
                los totales actuales se calculan con los datos de la aplicación.
              </p>
            </section>
          )}
        </>
      )}
      {view === "evaluation" && user.isInstructor && (
        <section className="panel">
          <div className="section-heading">
            <h2>
              <ShieldCheck size={21} />
              Evaluación independiente del ingeniero
            </h2>
            <button
              className="primary"
              onClick={() => startDialog("evaluation")}
            >
              <Plus size={16} />
              Nueva evaluación
            </button>
          </div>
          <p className="form-note">
            Solo las cuentas designadas como evaluador pueden consultar o
            modificar estas notas, incluso si otros usuarios administran el
            proyecto.
          </p>
          {!evaluations.length ? (
            <Empty>
              Registra tus criterios, notas y observaciones por proyecto,
              equipo, estudiante o actividad.
            </Empty>
          ) : (
            evaluations.map((e) => (
              <article className="phase-record" key={e.id}>
                <div className="section-heading">
                  <div>
                    <h3>{e.title}</h3>
                    <small>
                      {shortDate(e.date)} ·{" "}
                      {e.targetType === "person"
                        ? person(e.targetId)
                        : e.targetType === "team"
                          ? team(e.targetId)
                          : e.targetType === "activity"
                            ? p.activities.find((a) => a.id === e.targetId)
                                ?.code
                            : "Proyecto completo"}
                    </small>
                  </div>
                  <strong>
                    {e.criteria.reduce((s, c) => s + c.score, 0)} /{" "}
                    {e.criteria.reduce((s, c) => s + c.max, 0)}
                  </strong>
                  <button
                    className="secondary"
                    onClick={() => startDialog("evaluation", e)}
                  >
                    Editar evaluación
                  </button>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        const r = await fetch(
                            "/api/evaluations?projectId=" +
                              encodeURIComponent(p.id) +
                              "&history=" +
                              encodeURIComponent(e.id),
                            { cache: "no-store" },
                          ),
                          data = await r.json();
                        if (!r.ok) throw Error(data.error);
                        setPrivateHistory(data.versions);
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "No se pudo cargar el historial privado.",
                        );
                      }
                    }}
                  >
                    Historial privado
                  </button>
                </div>
                <table className="phase-table">
                  <thead>
                    <tr>
                      <th>Criterio</th>
                      <th>Nota</th>
                      <th>Máximo</th>
                      <th>Observación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.criteria.map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td>{r.score}</td>
                        <td>{r.max}</td>
                        <td>{r.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>{e.notes}</p>
                <Status value={e.published ? "Finalizada" : "Borrador"} />
              </article>
            ))
          )}
          {!archivedGrades.some(
            (e) => e.id === privateHistory[0]?.evaluation.id,
          ) && <EvaluationVersions versions={privateHistory} />}
          <button
            className="secondary"
            onClick={async () => {
              try {
                const r = await fetch("/api/evaluations?archive=1", {
                    cache: "no-store",
                  }),
                  data = await r.json();
                if (!r.ok) throw Error(data.error);
                setArchivedGrades(
                  data.evaluations.map((e: any) => ({
                    ...e,
                    projectName:
                      data.projects.find((p: any) => p.id === e.projectId)
                        ?.name ?? e.projectId,
                  })),
                );
                if (!data.evaluations.length)
                  setError("No hay evaluaciones de proyectos eliminados.");
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "No se pudo cargar el archivo.",
                );
              }
            }}
          >
            Consultar evaluaciones conservadas
          </button>
          {archivedGrades.map((e) => (
            <article className="import-note" key={e.id}>
              <strong>
                {e.projectName} · {e.title}
              </strong>
              <p>{e.notes}</p>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    const r = await fetch(
                        "/api/evaluations?archive=1&projectId=" +
                          encodeURIComponent(e.projectId) +
                          "&history=" +
                          encodeURIComponent(e.id),
                        { cache: "no-store" },
                      ),
                      data = await r.json();
                    if (!r.ok) throw Error(data.error);
                    setPrivateHistory(data.versions);
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "No se pudo cargar el historial.",
                    );
                  }
                }}
              >
                Historial privado conservado
              </button>
              {privateHistory[0]?.evaluation.id === e.id && (
                <EvaluationVersions versions={privateHistory} />
              )}

              <p>
                {e.criteria
                  .map((c: any) => c.name + ": " + c.score + "/" + c.max)
                  .join(" · ")}
              </p>
            </article>
          ))}
        </section>
      )}
      {view === "context" && (
        <section className="panel">
          <div className="section-heading">
            <h2>Contexto para tu agente</h2>
            {admin && (
              <button
                className="secondary"
                onClick={() => startDialog("repository")}
              >
                Vincular repositorio
              </button>
            )}
          </div>
          <p className="form-note">
            Descarga datos actuales de planificación, responsabilidades,
            interfaces, presupuesto y riesgos. Se omiten los campos privados y
            se depuran patrones de correos y credenciales. Revisa el texto libre
            antes de compartir; las evaluaciones privadas se mantienen
            excluidas.
          </p>
          {can(user, "context", p) ? (
            <div className="context-options">
              {[{ id: "", name: "Proyecto completo" }, ...p.teams]
                .filter(
                  (t) =>
                    admin ||
                    t.id === p.members.find((m) => m.id === user.id)?.teamId,
                )
                .map((t) => (
                  <article key={t.id}>
                    <h3>{t.name}</h3>
                    <a className="primary" href={url("context-md", t.id)}>
                      <Download size={15} />
                      Markdown
                    </a>
                    <a className="secondary" href={url("context-json", t.id)}>
                      JSON
                    </a>
                  </article>
                ))}
            </div>
          ) : (
            <Empty>
              La descarga está reservada a administradores y líderes de equipo.
            </Empty>
          )}
          <h3 className="form-section">Repositorio y commits</h3>
          {c.repositories.map((r) => (
            <p className="form-note" key={r.id}>
              {r.fullName} · {team(r.teamId)}
            </p>
          ))}
          <p className="form-note">
            Convención local: ACT-12 o DIG-12; #review y #done crean
            sugerencias. El webhook requiere firma HMAC y un secreto
            configurado. La conexión real y la sincronización con GitHub
            corresponden a la Fase 3.
          </p>
          {c.commits
            .slice(-12)
            .reverse()
            .map((k) => (
              <article className="phase-entry" key={k.id}>
                <div>
                  <h3>
                    {k.sha.slice(0, 7)} · {k.message}
                  </h3>
                  <small>
                    {k.author} · {k.date}
                  </small>
                </div>
                {/^https:\/\/github\.com\//.test(k.url) && (
                  <a href={k.url} target="_blank" rel="noreferrer">
                    Ver commit ↗
                  </a>
                )}
              </article>
            ))}
          {user.globalRole === "superuser" && (
            <div className="backup-actions">
              <h3>Plantillas y respaldo del proyecto</h3>
              <a className="secondary" href={url("backup")}>
                <Download size={15} />
                Exportar respaldo JSON
              </a>
              <button
                className="secondary"
                onClick={() => startDialog("restore")}
              >
                <Upload size={15} />
                Restaurar respaldo
              </button>
              <button
                className="secondary"
                onClick={() => startDialog("clone")}
              >
                <Copy size={15} />
                Clonar proyecto
              </button>
              <button
                className="secondary"
                onClick={() => startDialog("template")}
              >
                Plantilla estándar
              </button>
            </div>
          )}
        </section>
      )}
      {draftPlan && (
        <Dialog
          title="Vista previa de planificación"
          close={() => setDraftPlan(null)}
        >
          <PlanEditor
            draft={draftPlan}
            project={p}
            busy={busy}
            preview={preview}
            setDraft={setDraftPlan}
            previewPlan={async () => {
              const result = await run("previewPlan", {
                activities: [draftPlan],
                applyDates: false,
              });
              setPreview({ ...result, inputKey: JSON.stringify(draftPlan) });
            }}
            save={async () => {
              await run("savePlan", {
                activities: [draftPlan],
                applyDates: admin,
              });
              setDraftPlan(null);
            }}
          />
          <p className="form-note">
            FS: la sucesora empieza después de terminar la predecesora. Desfase
            en días hábiles; un valor negativo permite adelanto.
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </Dialog>
      )}
      {dialog && (
        <Dialog
          title={
            (
              {
                budget: "Partida del presupuesto",
                expense: "Registrar gasto real",
                risk: "Riesgo del proyecto",
                record: labels[kind],
                change: "Solicitud de cambio",
                milestone: "Hito o entregable",
                settings: "Calendario y control",
                evaluation: "Evaluación del ingeniero",
                clone: "Clonar proyecto",
                template: "Proyecto mecatrónico estándar",
                repository: "Repositorio del equipo",
                upload: "Adjuntar archivo",
                restore: "Restaurar respaldo",
                toTask: "Convertir acuerdo en actividad",
              } as Record<string, string>
            )[dialog.kind] ?? "Editar"
          }
          close={() => setDialog(null)}
        >
          {["upload", "restore", "toTask"].includes(dialog.kind) ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  if (dialog.kind === "upload") {
                    f.set("projectId", p.id);
                    const r = await fetch("/api/files", {
                      method: "POST",
                      body: f,
                    });
                    const data = await r.json();
                    if (!r.ok) throw Error(data.error);
                    await refresh();
                  } else if (dialog.kind === "restore") {
                    const file = f.get("file");
                    if (!(file instanceof File))
                      throw Error("Selecciona un respaldo JSON.");
                    if (
                      !window.confirm(
                        "¿Restaurar como proyecto nuevo? Los hitos requerirán nueva aprobación docente.",
                      )
                    )
                      return;
                    await run("restoreProject", JSON.parse(await file.text()));
                  } else
                    await run("recordToTask", {
                      id: dialog.value.id,
                      title: f.get("title"),
                      teamId: f.get("teamId"),
                      responsibleId: f.get("responsibleId"),
                    });
                  setDialog(null);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "No se pudo completar.",
                  );
                }
              }}
            >
              {dialog.kind === "toTask" ? (
                <>
                  {field("title", "Nombre de la actividad", dialog.value.title)}
                  {select(
                    "teamId",
                    "Equipo",
                    teams,
                    p.members.find((m) => m.id === user.id)?.teamId,
                  )}
                  {select("responsibleId", "Responsable", people, user.id)}
                </>
              ) : (
                <>
                  {field(
                    "file",
                    dialog.kind === "upload" ? "Archivo" : "Respaldo JSON",
                    "",
                    "file",
                  )}
                  {dialog.kind === "upload" &&
                    select(
                      "activityId",
                      "Actividad (opcional)",
                      tasks,
                      "",
                      false,
                    )}
                  <p className="form-note">
                    {dialog.kind === "restore"
                      ? "Se valida el contenido y se crea un proyecto nuevo. Las evaluaciones privadas no se importan."
                      : "El archivo se guardará en el proyecto actual con acceso controlado."}
                  </p>
                </>
              )}
              {error && <p className="form-error">{error}</p>}
              <div className="modal-actions">
                <button className="primary" disabled={busy}>
                  Continuar
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={submit}>
              {dialog.kind === "budget" && (
                <>
                  {field("name", "Nombre de la partida", dialog.value?.name)}
                  <div className="form-grid">
                    {select(
                      "teamId",
                      "Equipo",
                      teams,
                      dialog.value?.teamId ??
                        p.members.find((m) => m.id === user.id)?.teamId,
                    )}
                    {field(
                      "category",
                      "Categoría",
                      dialog.value?.category ?? "Materiales",
                    )}
                    {field(
                      "quantity",
                      "Cantidad",
                      dialog.value?.quantity ?? 1,
                      "number",
                    )}
                    {field(
                      "price",
                      "Precio unitario · " + c.currency,
                      ((dialog.value?.unitPriceCents ?? 0) / 100).toFixed(2),
                    )}
                    {select(
                      "activityId",
                      "Actividad (opcional)",
                      tasks,
                      dialog.value?.activityId,
                      false,
                    )}
                    {field(
                      "supplier",
                      "Proveedor",
                      dialog.value?.supplier,
                      "text",
                      false,
                    )}
                  </div>
                  {field(
                    "url",
                    "Enlace del proveedor",
                    dialog.value?.url,
                    "url",
                    false,
                  )}
                  <label>
                    Notas
                    <textarea name="notes" defaultValue={dialog.value?.notes} />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="isBom"
                      defaultChecked={dialog.value?.isBom}
                    />
                    Incluir en la lista de materiales (BOM)
                  </label>
                </>
              )}
              {dialog.kind === "expense" && (
                <>
                  {field(
                    "description",
                    "Descripción del gasto",
                    dialog.value?.description,
                  )}
                  <div className="form-grid">
                    {field(
                      "amount",
                      "Importe · " + c.currency,
                      dialog.value?.amountCents !== undefined
                        ? (dialog.value.amountCents / 100).toFixed(2)
                        : "",
                    )}
                    {field(
                      "date",
                      "Fecha",
                      dialog.value?.date ?? today(),
                      "date",
                    )}
                    <label>
                      Equipo
                      <select
                        name="teamId"
                        value={expenseTeam}
                        onChange={(e) => setExpenseTeam(e.target.value)}
                      >
                        {teams.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {select(
                      "budgetItemId",
                      "Partida (opcional)",
                      c.budget
                        .filter((b) => b.teamId === expenseTeam)
                        .map((b) => ({ value: b.id, label: b.name })),
                      dialog.value?.budgetItemId ?? "",
                      false,
                    )}
                    {select(
                      "activityId",
                      "Actividad (opcional)",
                      tasks,
                      dialog.value?.activityId ?? "",
                      false,
                    )}
                    {select(
                      "receiptId",
                      "Comprobante existente (opcional)",
                      c.files.map((f) => ({ value: f.id, label: f.name })),
                      dialog.value?.receiptId ?? "",
                      false,
                    )}
                  </div>
                  {field(
                    "receiptUrl",
                    "O pega el enlace de un comprobante nuevo en OneDrive",
                    "",
                    "url",
                    false,
                  )}
                  <p className="form-note">
                    El enlace se asocia al registrar el gasto. Puedes tomar la
                    foto con tu celular y compartir su enlace de OneDrive. El
                    gasto permanece pendiente hasta la aprobación.
                  </p>
                </>
              )}

              {dialog.kind === "risk" && (
                <>
                  <label>
                    Descripción
                    <textarea
                      name="description"
                      required
                      defaultValue={dialog.value?.description}
                    />
                  </label>
                  <div className="form-grid">
                    {select(
                      "probability",
                      "Probabilidad",
                      [1, 2, 3, 4, 5].map((i) => ({
                        value: String(i),
                        label: String(i),
                      })),
                      String(dialog.value?.probability ?? 3),
                    )}
                    {select(
                      "impact",
                      "Impacto",
                      [1, 2, 3, 4, 5].map((i) => ({
                        value: String(i),
                        label: String(i),
                      })),
                      String(dialog.value?.impact ?? 3),
                    )}
                    {select(
                      "ownerId",
                      "Responsable",
                      people,
                      dialog.value?.ownerId ?? user.id,
                    )}
                    {select(
                      "status",
                      "Estado",
                      ["open", "mitigated", "closed"].map((s) => ({
                        value: s,
                        label: labels[s],
                      })),
                      dialog.value?.status ?? "open",
                    )}
                  </div>
                  <label>
                    Plan de mitigación
                    <textarea
                      name="mitigation"
                      defaultValue={dialog.value?.mitigation}
                    />
                  </label>
                  {field(
                    "nextAction",
                    "Próxima acción",
                    dialog.value?.nextAction,
                    "text",
                    false,
                  )}
                  {field(
                    "dueDate",
                    "Fecha de la próxima acción",
                    dialog.value?.dueDate,
                    "date",
                    false,
                  )}
                </>
              )}
              {dialog.kind === "record" && (
                <>
                  {field(
                    "title",
                    "Título",
                    dialog.value?.title ??
                      (kind === "checklist" ? "Revisión de diseño" : ""),
                  )}
                  <div className="form-grid">
                    {field(
                      "date",
                      "Fecha",
                      dialog.value?.date ?? today(),
                      "date",
                    )}
                    {select(
                      "teamId",
                      "Equipo",
                      teams,
                      dialog.value?.teamId ??
                        p.members.find((m) => m.id === user.id)?.teamId,
                    )}
                  </div>
                  <label>
                    {kind === "reception"
                      ? "Elemento heredado, decisión y justificación"
                      : "Resumen, acuerdos y próximos pasos"}
                    <textarea
                      name="body"
                      rows={4}
                      defaultValue={dialog.value?.body}
                    />
                  </label>
                  {kind === "checklist" && (
                    <label>
                      Elementos de revisión · uno por línea
                      <textarea
                        name="items"
                        rows={5}
                        defaultValue={
                          dialog.value?.items
                            ?.map((i: any) => i.title)
                            .join("\n") ??
                          "Esquemático revisado\nSTEP exportado\nFirmware probado\nEvidencia de pruebas adjunta"
                        }
                      />
                    </label>
                  )}
                  {kind === "acceptance" && (
                    <>
                      {field("target", "Valor objetivo", dialog.value?.target)}
                      {field(
                        "measurement",
                        "Medición obtenida",
                        dialog.value?.measurement,
                        "text",
                        false,
                      )}
                      {select(
                        "result",
                        "Resultado",
                        ["pending", "pass", "fail"].map((s) => ({
                          value: s,
                          label: labels[s],
                        })),
                        dialog.value?.result ?? "pending",
                      )}
                      {field(
                        "evidence",
                        "Evidencia o enlace",
                        dialog.value?.evidence,
                        "text",
                        false,
                      )}
                    </>
                  )}
                  {kind === "meeting" && (
                    <fieldset>
                      <legend>Participantes</legend>
                      <div className="raci-people">
                        {people.map((m) => (
                          <label key={m.value} className="checkbox-label">
                            <input
                              type="checkbox"
                              name="attendee"
                              value={m.value}
                              defaultChecked={dialog.value?.attendees?.includes(
                                m.value,
                              )}
                            />
                            {m.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="completed"
                      defaultChecked={dialog.value?.completed}
                    />
                    Registro o revisión completada
                  </label>
                </>
              )}
              {dialog.kind === "change" && (
                <>
                  {field("description", "Qué cambio solicitas")}
                  <div className="form-grid">
                    <label>
                      Tipo de cambio
                      <select
                        name="type"
                        value={changeType}
                        onChange={(e) => {
                          setChangeType(e.target.value);
                          setChangeScope(
                            e.target.value === "budget"
                              ? "budgetItem"
                              : ["dates", "status"].includes(e.target.value)
                                ? "activity"
                                : "project",
                          );
                          setChangeEntity("");
                          setChangeValue("");
                        }}
                      >
                        {[
                          ["duration", "Duración"],
                          ["scope", "Alcance"],
                          ["dates", "Fecha de entrega"],
                          ["budget", "Precio unitario"],
                          ["status", "Estado"],
                        ].map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Destino
                      <select
                        name="targetType"
                        value={changeScope}
                        onChange={(e) => {
                          setChangeScope(e.target.value);
                          setChangeEntity("");
                        }}
                      >
                        {["duration", "scope"].includes(changeType) && (
                          <option value="project">Proyecto completo</option>
                        )}
                        {changeType !== "budget" && (
                          <option value="activity">Actividad</option>
                        )}
                        {changeType === "budget" && (
                          <option value="budgetItem">
                            Partida de presupuesto
                          </option>
                        )}
                      </select>
                    </label>
                  </div>
                  {changeScope === "project" ? (
                    <input type="hidden" name="activityId" value="" />
                  ) : (
                    <label>
                      {changeScope === "budgetItem" ? "Partida" : "Actividad"}
                      <select
                        name="activityId"
                        required
                        value={changeEntity}
                        onChange={(e) => setChangeEntity(e.target.value)}
                      >
                        <option value="">Selecciona un destino</option>
                        {(changeScope === "budgetItem"
                          ? c.budget.map((b) => ({
                              value: b.id,
                              label: b.name,
                            }))
                          : tasks
                        ).map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    {changeType === "duration"
                      ? "Duración propuesta · " +
                        (changeScope === "project" ? "semanas" : "días hábiles")
                      : changeType === "budget"
                        ? "Nuevo precio unitario · " + c.currency
                        : changeType === "dates"
                          ? "Nueva fecha de entrega"
                          : "Valor propuesto"}
                    {changeType === "status" ? (
                      <select
                        name="value"
                        required
                        value={changeValue}
                        onChange={(e) => setChangeValue(e.target.value)}
                      >
                        <option value="">Selecciona un estado</option>
                        {states.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        name="value"
                        required
                        type={changeType === "dates" ? "date" : "text"}
                        inputMode={
                          ["duration", "budget"].includes(changeType)
                            ? "decimal"
                            : undefined
                        }
                        value={changeValue}
                        onChange={(e) => setChangeValue(e.target.value)}
                      />
                    )}
                  </label>
                  <ChangePreview
                    project={p}
                    type={changeType}
                    targetType={changeScope}
                    targetId={changeEntity}
                    value={changeValue}
                  />
                  <label>
                    Motivo
                    <textarea name="reason" required />
                  </label>
                  <label>
                    Impacto en el proyecto
                    <textarea name="impact" />
                  </label>
                </>
              )}

              {dialog.kind === "milestone" && (
                <>
                  {field("title", "Nombre del hito", dialog.value?.title)}
                  <div className="form-grid">
                    {field(
                      "date",
                      "Fecha propuesta",
                      dialog.value?.date,
                      "date",
                      false,
                    )}
                    {field(
                      "points",
                      "Puntos (opcional)",
                      dialog.value?.points ?? "",
                      "number",
                      false,
                    )}
                  </div>
                  <label>
                    Criterio de salida
                    <textarea
                      name="criteria"
                      defaultValue={dialog.value?.criteria}
                    />
                  </label>
                  {user.isInstructor && (
                    <label className="checkbox-label">
                      <input
                        name="approved"
                        type="checkbox"
                        defaultChecked={dialog.value?.approved}
                      />
                      Aprobado por el ingeniero
                    </label>
                  )}
                </>
              )}
              {dialog.kind === "settings" && (
                <>
                  <div className="form-grid">
                    {field("currency", "Moneda (HNL, USD, GTQ…)", c.currency)}
                    {field(
                      "workingDays",
                      "Días laborables por semana",
                      c.workingDays,
                      "number",
                    )}
                    {field(
                      "deliveryDate",
                      "Fecha límite del curso",
                      c.deliveryDate,
                      "date",
                      false,
                    )}
                    {select(
                      "integrationLeadId",
                      "Líder de integración",
                      people,
                      c.integrationLeadId,
                      false,
                    )}
                  </div>
                  <label className="checkbox-label">
                    <input
                      name="cross"
                      type="checkbox"
                      defaultChecked={c.requireCrossReview}
                    />
                    Exigir evidencia y revisión de otro equipo para marcar Hecha
                  </label>
                  <p className="form-note">
                    Calendario laboral de lunes en adelante; no se han
                    configurado feriados. Un hito con duración cero no consume
                    días.
                  </p>
                </>
              )}
              {dialog.kind === "evaluation" && (
                <EvaluationFields value={dialog.value} project={p} />
              )}
              {dialog.kind === "clone" && (
                <>
                  {field(
                    "name",
                    "Nombre del nuevo proyecto",
                    p.name + " · copia",
                  )}
                  {field("weeks", "Duración en semanas", p.weeks, "number")}
                  <label className="checkbox-label">
                    <input type="checkbox" name="scale" defaultChecked />
                    Reescalar proporcionalmente las duraciones
                  </label>
                  <p className="form-note">
                    Se conservarán equipos y membresías. Estados, gastos,
                    archivos y evaluaciones no se copian.
                  </p>
                </>
              )}
              {dialog.kind === "template" && (
                <>
                  {field(
                    "name",
                    "Nombre del proyecto",
                    "Proyecto mecatrónico estándar",
                  )}
                  {field("weeks", "Duración en semanas", 8, "number")}
                  <p className="form-note">
                    Crea requisitos, concepto, diseño, fabricación/desarrollo,
                    integración, pruebas y documentación por equipo.
                  </p>
                </>
              )}
              {dialog.kind === "repository" && (
                <>
                  {select("teamId", "Equipo", teams, "software")}
                  {field(
                    "fullName",
                    "Propietario/repositorio · GitHub",
                    dialog.value?.fullName ?? "",
                  )}
                  <p className="form-note">
                    La Fase 1B deja listo el endpoint firmado y el parser de
                    commits para pruebas locales.
                  </p>
                </>
              )}
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDialog(null)}
                >
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </div>
  );
}
function PlanEditor({
  draft,
  project: p,
  busy,
  preview,
  setDraft,
  previewPlan,
  save,
}: {
  draft: {
    id: string;
    duration: number;
    dependencies: string[];
    dependencyLags: Record<string, number>;
  };
  project: Project;
  busy: boolean;
  preview: any;
  setDraft: (v: any) => void;
  previewPlan: () => Promise<void>;
  save: () => Promise<void>;
}) {
  const a = p.activities.find((a) => a.id === draft.id)!;
  return (
    <>
      <h3>
        {a.code} · {a.title}
      </h3>
      <label className="form-section">
        Duración en días hábiles (0 = hito)
        <input
          type="number"
          min={0}
          max={365}
          value={draft.duration}
          onChange={(e) =>
            setDraft({ ...draft, duration: Number(e.target.value) })
          }
        />
      </label>
      <fieldset>
        <legend>Actividades predecesoras · Finish to Start</legend>
        <div className="dependency-list">
          {p.activities
            .filter(
              (b) =>
                !b.deletedAt &&
                b.id !== a.id &&
                !p.activities.some((x) => !x.deletedAt && x.parentId === b.id),
            )
            .map((b) => (
              <div className="dependency-option" key={b.id}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={draft.dependencies.includes(b.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        dependencies: e.target.checked
                          ? [...draft.dependencies, b.id]
                          : draft.dependencies.filter((id) => id !== b.id),
                      })
                    }
                  />
                  {b.code} · {b.title}
                  {a.teamId !== b.teamId && <Link2 size={13} />}
                </label>
                {draft.dependencies.includes(b.id) && (
                  <label>
                    Desfase
                    <input
                      type="number"
                      min={-365}
                      max={365}
                      value={draft.dependencyLags[b.id] ?? 0}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          dependencyLags: {
                            ...draft.dependencyLags,
                            [b.id]: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                )}
              </div>
            ))}
        </div>
      </fieldset>
      {preview && (
        <div className="plan-preview">
          <strong>Impacto calculado</strong>
          <p>Fin anterior: {shortDate(preview.before.finish)}</p>
          <p>Nuevo fin: {shortDate(preview.after.finish)}</p>
          <p>
            Ruta crítica: {preview.after.duration} días hábiles · Exceso:{" "}
            {preview.after.overflowDays} días.
          </p>
        </div>
      )}
      <p className="form-note">
        {
          "La confirmación guarda la duración y las dependencias. Si eres administrador, también recalcula las fechas de todas las actividades hoja, incluidas las provisionales. Revisa las duraciones pendientes antes de confirmar."
        }
      </p>
      <div className="modal-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => previewPlan().catch(() => {})}
        >
          Calcular vista previa
        </button>
        <button
          className="primary"
          disabled={
            busy || !preview || preview.inputKey !== JSON.stringify(draft)
          }
          onClick={() => save().catch(() => {})}
        >
          Confirmar y aplicar plan
        </button>
      </div>
    </>
  );
}
function EvaluationFields({
  value,
  project: p,
}: {
  value?: Evaluation;
  project: Project;
}) {
  const [count, setCount] = useState(value?.criteria.length ?? 1),
    [targetType, setTargetType] = useState(value?.targetType ?? "project");
  const targets =
    targetType === "person"
      ? p.members.map((m) => ({ id: m.id, name: m.name }))
      : targetType === "team"
        ? p.teams
        : targetType === "activity"
          ? p.activities
              .filter((a) => !a.deletedAt)
              .map((a) => ({ id: a.id, name: a.code + " · " + a.title }))
          : [];
  return (
    <>
      <label>
        Título
        <input
          name="title"
          required
          defaultValue={value?.title ?? "Avance 1"}
        />
      </label>
      <div className="form-grid">
        <label>
          Fecha
          <input
            name="date"
            type="date"
            required
            defaultValue={value?.date ?? today()}
          />
        </label>
        <label>
          Se evalúa
          <select
            name="targetType"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as typeof targetType)}
          >
            <option value="project">Proyecto</option>
            <option value="team">Equipo</option>
            <option value="person">Estudiante</option>
            <option value="activity">Actividad</option>
          </select>
        </label>
      </div>
      {targets.length > 0 && (
        <label>
          Selecciona el destinatario
          <select name="targetId" defaultValue={value?.targetId} required>
            {targets.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <h3 className="form-section">Criterios editables</h3>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="evaluation-criterion">
          <label>
            Criterio {i + 1}
            <input
              name="criterion"
              required
              defaultValue={
                value?.criteria[i]?.name ??
                (i === 0 ? "Cumplimiento del entregable" : "")
              }
            />
          </label>
          <div className="form-grid">
            <label>
              Nota
              <input
                name="score"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={value?.criteria[i]?.score ?? 0}
              />
            </label>
            <label>
              Máximo
              <input
                name="max"
                type="number"
                min={0.01}
                step="0.01"
                required
                defaultValue={value?.criteria[i]?.max ?? 2}
              />
            </label>
          </div>
          <label>
            Observación del criterio
            <textarea
              name="criterionComment"
              defaultValue={value?.criteria[i]?.comment}
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        className="text-link"
        onClick={() => setCount(Math.min(40, count + 1))}
      >
        <Plus size={15} />
        Añadir criterio
      </button>
      <label>
        Observaciones generales
        <textarea name="notes" rows={4} defaultValue={value?.notes} />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          name="published"
          defaultChecked={value?.published}
        />
        Evaluación finalizada (sigue siendo privada del ingeniero)
      </label>
    </>
  );
}

function ChangePreview({
  project,
  type,
  targetType,
  targetId,
  value,
}: {
  project: Project;
  type: string;
  targetType: string;
  targetId: string;
  value: string;
}) {
  if (!value || (targetType !== "project" && !targetId))
    return (
      <p className="form-note">
        Selecciona un destino y un valor para revisar el cambio.
      </p>
    );
  try {
    const parsed =
      type === "duration"
        ? Number(value)
        : type === "budget"
          ? parseMoney(value)
          : value;
    const target = changeTarget(project, {
      type: type as any,
      targetType: targetType as any,
      activityId: targetType === "project" ? "" : targetId,
      value: parsed,
    });
    return (
      <div className="plan-preview">
        <strong>{target.label}</strong>
        <p>
          {String(target.before) || "(vacío)"} → {String(target.value)} ·{" "}
          {target.unit}
        </p>
      </div>
    );
  } catch (e) {
    return (
      <p className="form-error" role="status">
        {e instanceof Error ? e.message : "Revisa el valor propuesto."}
      </p>
    );
  }
}
function ChangeDetail({
  project,
  change,
}: {
  project: Project;
  change: Control["changes"][number];
}) {
  try {
    const target = changeTarget(project, change);
    return (
      <p className="change-detail">
        <strong>{target.label}</strong>
        <br />
        Anterior: {String(change.baseValue ?? target.before) || "(vacío)"} →
        Propuesto: {String(target.value)} · {target.unit}
      </p>
    );
  } catch {
    return (
      <p className="form-error">
        El destino ya no existe o es incompatible. Rechaza esta solicitud y crea
        una nueva.
      </p>
    );
  }
}
