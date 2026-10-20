"use client";
import { useState, type FormEvent } from "react";
import {
  type Activity,
  type Project,
  type PublicUser,
  leafActivities,
  progress,
  raciValid,
  today,
} from "@/lib/model";
import { control, planning } from "@/lib/control";
import { addWorkingDays } from "@/lib/cpm";
import { impactNeedsConfirmation, type PlanImpact } from "@/lib/plan-impact";
import { can } from "@/server/auth/permissions";
import { ImpactConfirm } from "./impact-confirm";

type Props = {
  kind: "setup" | "interfaces" | "weekly";
  project: Project;
  user: PublicUser;
  busy: boolean;
  action: (name: string, data?: unknown) => Promise<any>;
};
export function WorkflowPanel({ kind, project: p, user, busy, action }: Props) {
  const c = control(p),
    leaves = leafActivities(p),
    plan = planning(p),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    // Planificación que mueve el fin del proyecto y espera confirmación en la fila.
    [pendingPlan, setPendingPlan] = useState<{
      impact: PlanImpact;
      activity: Activity;
    } | null>(null);
  const name = (id: string) =>
      p.members.find((m) => m.id === id)?.name ?? "Sin asignar",
    team = (id: string) =>
      p.teams.find((t) => t.id === id)?.name ?? "Sin equipo";
  async function run(key: string, data?: unknown) {
    setError("");
    setNotice("");
    try {
      await action(key, data);
      setNotice("Cambios guardados en el historial.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }
  const alerts = (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </>
  );
  if (kind === "setup") {
    const planned = leaves.filter((a) => !a.unscheduled).length,
      raci = leaves.filter(raciValid).length;
    const steps = [
      {
        title: "1. Equipos y personas",
        done: p.members.length > 0 && p.teams.length > 0,
        detail: `${p.teams.length} equipos · ${p.members.length} integrantes. Gestiona integrantes y líderes desde Equipos.`,
      },
      {
        title: "2. Responsables RACI",
        done: leaves.length > 0 && raci === leaves.length,
        detail: `${raci} de ${leaves.length} actividades con R y A. Completa la asignación en cada actividad.`,
      },
      {
        title: "3. Duraciones y dependencias",
        done: leaves.length > 0 && planned === leaves.length,
        detail: `${planned} de ${leaves.length} actividades planificadas. Las duraciones provisionales no son compromisos confirmados.`,
      },
      {
        title: "4. Calendario y fecha de entrega",
        done: !!c.deliveryDate,
        detail: `${c.workingDays} días hábiles/semana. Límite: ${plan.deadline}. Fin calculado: ${plan.finish}. ${plan.overflowDays ? `Exceso de ${plan.overflowDays} días hábiles: revisa antes de confirmar.` : ""}`,
      },
      {
        title: "5. Guardar línea base",
        done: c.baselines.length > 0,
        detail: c.baselines.length
          ? `Última línea base: ${c.baselines.at(-1)!.date.slice(0, 10)}. El plan actual se puede modificar sin borrar esa versión.`
          : "Guarda el compromiso inicial después de revisar responsables, interfaces y calendario.",
      },
    ];
    return (
      <>
        <section className="panel">
          <h2>Preparación del proyecto</h2>
          <p className="form-note">
            Guarda los borradores que necesites. Confirma el plan cuando el
            equipo haya revisado los datos.
          </p>
          {steps.map((s) => (
            <article className="setup-step" key={s.title}>
              <span aria-label={s.done ? "Completado" : "Pendiente"}>
                {s.done ? "✓" : "○"}
              </span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.detail}</p>
              </div>
            </article>
          ))}
          {can(user, "project:edit", p) && (
            <button
              className="primary"
              disabled={
                busy ||
                !leaves.length ||
                planned !== leaves.length ||
                raci !== leaves.length
              }
              onClick={() => {
                if (
                  window.confirm(
                    "¿Guardar el plan actual como línea base? Las fechas y duraciones quedarán registradas como compromiso.",
                  )
                )
                  run("saveBaseline");
              }}
            >
              Guardar línea base revisada
            </button>
          )}
          {alerts}
        </section>
        <section className="panel">
          <h2>Confirmar duraciones y esfuerzo</h2>
          <p className="form-note">
            La duración se usa en la ruta crítica. El esfuerzo opcional se usa
            para repartir carga entre responsables. Configura dependencias en
            Cronograma y planificación.
          </p>
          {leaves.map((a) => (
            <article className="setup-task" key={a.id}>
              <strong>
                {a.code} · {a.title}
              </strong>
              <small>
                {a.unscheduled ? "Provisional · sin planificar" : "Planificada"}{" "}
                · {team(a.teamId)}
              </small>
              {can(user, "activity:edit", p, a) && (
                <form
                  className="form-grid"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget),
                      duration = Number(f.get("duration")),
                      start = String(f.get("start")),
                      effort = f.get("effort");
                    setPendingPlan(null);
                    try {
                      const next: Activity = {
                        ...a,
                        duration,
                        start,
                        end: addWorkingDays(
                          start,
                          Math.max(0, duration - 1),
                          c.workingDays,
                        ),
                        unscheduled: false,
                        effortDays: effort === "" ? undefined : Number(effort),
                      };
                      if (duration !== a.duration) {
                        const impact: PlanImpact = await action("previewPlan", {
                          activities: [
                            {
                              id: a.id,
                              duration,
                              dependencies: a.dependencies,
                              dependencyLags: a.dependencyLags ?? {},
                            },
                          ],
                        });
                        if (impactNeedsConfirmation(impact)) {
                          setPendingPlan({ impact, activity: next });
                          return;
                        }
                      }
                      await run("saveActivity", next);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "No se pudo revisar la duración.",
                      );
                    }
                  }}
                >
                  <label>
                    Inicio
                    <input
                      name="start"
                      type="date"
                      required
                      defaultValue={a.start}
                    />
                  </label>
                  <label>
                    Duración · días hábiles
                    <input
                      name="duration"
                      type="number"
                      min={0}
                      max={365}
                      required
                      defaultValue={a.duration}
                    />
                  </label>
                  <label>
                    Esfuerzo · días-persona
                    <input
                      name="effort"
                      type="number"
                      min={0}
                      max={3650}
                      step="0.1"
                      defaultValue={a.effortDays ?? ""}
                      placeholder="Opcional"
                    />
                  </label>
                  <button className="secondary" disabled={busy}>
                    Confirmar planificación
                  </button>
                </form>
              )}
              {pendingPlan?.activity.id === a.id && (
                <ImpactConfirm
                  impact={pendingPlan.impact}
                  busy={busy}
                  confirm={() => {
                    const next = pendingPlan.activity;
                    setPendingPlan(null);
                    run("saveActivity", next);
                  }}
                  cancel={() => setPendingPlan(null)}
                />
              )}
            </article>
          ))}
        </section>
      </>
    );
  }
  if (kind === "interfaces") {
    const pairs = p.activities
      .filter((a) => !a.deletedAt)
      .flatMap((to) =>
        to.dependencies.map((id) => ({
          from: p.activities.find((a) => a.id === id && !a.deletedAt),
          to,
        })),
      )
      .filter((x) => x.from && x.from.teamId !== x.to.teamId);
    return (
      <section className="panel">
        <h2>Entregas y recepciones entre equipos</h2>
        <p className="form-note">
          Estas interfaces provienen de las dependencias del cronograma. El
          receptor confirma el entregable y su evidencia; una revisión de
          actividad sigue siendo un control separado.
        </p>
        {alerts}
        {!pairs.length && (
          <p>
            No hay dependencias entre equipos. Agrégalas desde la planificación.
          </p>
        )}
        {pairs.map(({ from: maybe, to }) => {
          const from = maybe!,
            item = c.interfaces?.find(
              (i) => i.predecessorId === from.id && i.successorId === to.id,
            ),
            proof = JSON.stringify([
              from.status,
              from.actualEnd ?? null,
              from.evidence ?? [],
            ]),
            accepted = !!item?.acceptedBy && item.sourceProof === proof,
            member = p.members.find((m) => m.id === user.id),
            editable =
              can(user, "project:edit", p) ||
              [from.teamId, to.teamId].includes(member?.teamId ?? "");
          async function submit(e: FormEvent<HTMLFormElement>) {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await run("saveInterface", {
              predecessorId: from.id,
              successorId: to.id,
              criteria: String(f.get("criteria")),
              evidence: String(f.get("evidence")),
              dueDate: String(f.get("dueDate")),
              accept:
                (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                  "value",
                ) === "accept",
            });
          }
          return (
            <article className="interface-card" key={from.id + "-" + to.id}>
              <h3>
                {from.code} → {to.code}
              </h3>
              <p>
                <strong>{team(from.teamId)}</strong> entrega {from.title} a{" "}
                <strong>{team(to.teamId)}</strong>.
              </p>
              <p>
                Proveedor: {name(from.accountable)} · Receptor:{" "}
                {name(to.accountable)} · Estado del entregable: {from.status}
              </p>
              <p>
                {accepted
                  ? `Recepción confirmada por ${name(item!.acceptedBy)} · ${item!.acceptedAt.slice(0, 10)}`
                  : "Recepción pendiente"}
              </p>
              <form onSubmit={submit}>
                <label>
                  Criterio de recepción
                  <textarea
                    name="criteria"
                    defaultValue={item?.criteria ?? ""}
                    disabled={!editable}
                    placeholder="Ej.: STEP con dimensiones y tolerancias revisadas"
                  />
                </label>
                <label>
                  Evidencia o documento
                  <input
                    name="evidence"
                    defaultValue={item?.evidence ?? ""}
                    disabled={!editable}
                  />
                </label>
                <label>
                  Fecha comprometida
                  <input
                    name="dueDate"
                    type="date"
                    defaultValue={item?.dueDate ?? ""}
                    disabled={!editable}
                  />
                </label>
                {editable && (
                  <div className="phase-actions">
                    <button className="secondary" disabled={busy}>
                      Guardar interfaz
                    </button>
                    {member?.teamId === to.teamId && (
                      <button
                        name="decision"
                        value="accept"
                        className="primary"
                        disabled={busy || from.status !== "Hecha"}
                      >
                        Confirmar recepción
                      </button>
                    )}
                  </div>
                )}
              </form>
            </article>
          );
        })}
      </section>
    );
  }
  const now = today(),
    end = new Date(Date.parse(now) + 7 * 86400000).toISOString().slice(0, 10),
    since = new Date(Date.parse(now) - 7 * 86400000).toISOString(),
    open = leaves.filter((a) => !["Hecha", "Cancelada"].includes(a.status)),
    next = open.filter((a) => !a.unscheduled && a.end >= now && a.end <= end),
    blocked = open.filter((a) => a.status === "Bloqueada"),
    overdue = open.filter((a) => !a.unscheduled && a.end < now),
    baseline = c.baselines.at(-1);
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Reunión semanal · {now}</h2>
            <p className="form-note">
              Datos actuales del proyecto. La línea base mantiene el compromiso
              guardado.
            </p>
          </div>
          <button className="secondary" onClick={() => window.print()}>
            Imprimir resumen
          </button>
        </div>
        <p>
          Avance: <strong>{progress(p)}%</strong> · {next.length} entregas
          próximas · {overdue.length} vencidas · {blocked.length} bloqueadas
        </p>
        {alerts}
        <h3 className="form-section">Compromisos de los próximos siete días</h3>
        {next.map((a) => (
          <p className="import-note" key={a.id}>
            {a.code} · {a.title} · {name(a.accountable)} · {a.end}
          </p>
        ))}
        {!next.length && (
          <p className="form-note">
            No hay entregas planificadas en este período.
          </p>
        )}
        <h3 className="form-section">Bloqueos y vencidas</h3>
        {[
          ...new Map([...blocked, ...overdue].map((a) => [a.id, a])).values(),
        ].map((a) => (
          <p className="import-note" key={a.id}>
            {a.code} · {name(a.accountable)} ·{" "}
            {a.blockedReason || "Entrega vencida: " + a.end}
          </p>
        ))}
        <h3 className="form-section">Decisiones pendientes</h3>
        <p>
          {c.expenses.filter((e) => e.status === "pending").length} gastos y{" "}
          {c.changes.filter((e) => e.status === "pending").length} solicitudes
          de cambio por decidir.
        </p>
        <h3 className="form-section">Mitigaciones por hacer</h3>
        {c.risks
          .filter((r) => r.status === "open")
          .map((r) => (
            <p className="import-note" key={r.id}>
              {r.code ?? "Riesgo"} · {r.description} · {name(r.ownerId)} ·{" "}
              {r.nextAction || r.mitigation || "Acción por definir"}{" "}
              {r.dueDate ? "· " + r.dueDate : ""}
            </p>
          ))}
        <h3 className="form-section">Cambios de los últimos siete días</h3>
        {p.history
          .filter((h) => h.date >= since)
          .slice(0, 30)
          .map((h) => (
            <p className="import-note" key={h.id}>
              {h.actor} · {h.action} · {h.entity}
            </p>
          ))}
      </section>
      <section className="panel">
        <h2>Línea base, plan actual y ejecución</h2>
        <p className="form-note">
          {baseline
            ? "Línea base guardada el " + baseline.date.slice(0, 10)
            : "Todavía no hay una línea base."}
        </p>
        <div className="phase-table-wrap">
          <table className="phase-table">
            <thead>
              <tr>
                <th>Actividad</th>
                <th>Entrega base</th>
                <th>Plan actual</th>
                <th>Fin real</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.code} · {a.title}
                  </td>
                  <td>
                    {baseline?.items.find((b) => b.id === a.id)?.end ??
                      "Sin línea base"}
                  </td>
                  <td>{a.unscheduled ? "Provisional" : a.end}</td>
                  <td>{a.actualEnd ?? "Sin finalizar"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
