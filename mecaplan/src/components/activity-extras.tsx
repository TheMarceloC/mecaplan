"use client";
import { useState } from "react";
import { type Activity, type Project, type PublicUser } from "@/lib/model";
import { planning, control, budgetTotals } from "@/lib/control";
import { can } from "@/server/auth/permissions";
import { TriangleAlert, ShieldCheck, LogOut, GitBranch } from "lucide-react";
export function PasswordGate({
  user,
  busy,
  action,
}: {
  user: PublicUser;
  busy: boolean;
  action: (name: string, data?: unknown) => Promise<any>;
}) {
  const [error, setError] = useState("");
  return (
    <main className="password-gate">
      <section className="panel">
        <img src="/unitec-logo.png" className="institution-logo" alt="UNITEC" />
        <span className="eyebrow">MECAPLAN · PRIMER INGRESO</span>
        <h1>Hola, {user.name.split(" ")[0]}.</h1>
        <p>Cambia tu contraseña inicial para entrar a tu espacio de trabajo.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (f.get("password") !== f.get("confirm")) {
              setError("Las contraseñas nuevas no coinciden.");
              return;
            }
            try {
              await action("changePassword", {
                oldPassword: f.get("oldPassword"),
                password: f.get("password"),
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo cambiar.");
            }
          }}
        >
          <label>
            Contraseña inicial
            <input
              type="password"
              name="oldPassword"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            Tu nueva contraseña
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <label>
            Repite la nueva contraseña
            <input
              type="password"
              name="confirm"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            Guardar y entrar
          </button>
        </form>
        <button
          className="text-btn"
          onClick={() => action("logout").catch(() => {})}
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
export function ControlSummary({ project: p }: { project: Project }) {
  const plan = planning(p),
    c = control(p),
    cost = budgetTotals(p);
  return (
    <div className="control-summary">
      {c.integrationLeadId && (
        <p>
          <ShieldCheck size={16} />
          <strong>Líder de integración:</strong>{" "}
          {p.members.find((m) => m.id === c.integrationLeadId)?.name}
        </p>
      )}
      {plan.missingDates > 0 && (
        <p className="control-provisional">
          <TriangleAlert size={16} />
          {plan.missingDates} tareas pendientes de planificar. Las fechas CPM
          todavía son provisionales.
        </p>
      )}
      {plan.overflowDays > 0 && (
        <p className="control-danger">
          <GitBranch size={16} />
          La ruta crítica excede el proyecto por {plan.overflowDays} días
          hábiles.
        </p>
      )}
      {cost.percent >= 80 && (
        <p className="control-danger">
          Presupuesto ejecutado: {cost.percent}% · Revisa gastos y avance.
        </p>
      )}
    </div>
  );
}
export function ActivityExtras({
  draft,
  project: p,
  user,
  canEdit,
  update,
  action,
  busy,
}: {
  draft: Activity;
  project: Project;
  user: PublicUser;
  canEdit: boolean;
  update: (a: Activity) => void;
  action: (name: string, data?: unknown) => Promise<any>;
  busy: boolean;
}) {
  const [error, setError] = useState("");
  const current = p.activities.find((a) => a.id === draft.id),
    reviewer = p.members.find((m) => m.id === current?.reviewerId),
    member = p.members.find((m) => m.id === user.id),
    c = control(p);
  const mayEvidence = !!current && can(user, "activity:status", p, current);
  let impact = "";
  if (
    current &&
    (current.duration !== draft.duration ||
      JSON.stringify(current.dependencies) !==
        JSON.stringify(draft.dependencies) ||
      JSON.stringify(current.dependencyLags) !==
        JSON.stringify(draft.dependencyLags))
  ) {
    try {
      const before = planning(p),
        after = planning({
          ...p,
          activities: p.activities.map((a) => (a.id === draft.id ? draft : a)),
        });
      impact = `Fin por CPM: ${before.finish} → ${after.finish}. Duración: ${before.duration} → ${after.duration} días hábiles. Exceso: ${after.overflowDays} días.`;
    } catch (e) {
      impact = e instanceof Error ? e.message : "No se puede calcular.";
    }
  }
  return (
    <section className="activity-extras">
      <h3 className="form-section">Planificación y evidencia</h3>
      {(draft.aliases?.length ?? 0) > 0 && (
        <p className="form-note">
          Códigos anteriores: {draft.aliases?.join(", ")}. Sus referencias se
          conservan.
        </p>
      )}
      {canEdit && (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!draft.unscheduled}
              onChange={(e) =>
                update({ ...draft, unscheduled: !e.target.checked })
              }
            />
            Las fechas y la duración ya están confirmadas
          </label>
          <details>
            <summary>Dependencias y desfases</summary>
            <div className="dependency-list">
              {p.activities
                .filter(
                  (a) =>
                    a.id !== draft.id &&
                    !a.deletedAt &&
                    !p.activities.some(
                      (b) => b.parentId === a.id && !b.deletedAt,
                    ),
                )
                .map((a) => (
                  <div className="dependency-option" key={a.id}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={draft.dependencies.includes(a.id)}
                        onChange={(e) =>
                          update({
                            ...draft,
                            dependencies: e.target.checked
                              ? [...draft.dependencies, a.id]
                              : draft.dependencies.filter((id) => id !== a.id),
                          })
                        }
                      />
                      {a.code} · {a.title}
                    </label>
                    {draft.dependencies.includes(a.id) && (
                      <label>
                        Desfase (días)
                        <input
                          type="number"
                          min={-365}
                          max={365}
                          value={draft.dependencyLags?.[a.id] ?? 0}
                          onChange={(e) =>
                            update({
                              ...draft,
                              dependencyLags: {
                                ...draft.dependencyLags,
                                [a.id]: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                ))}
            </div>
          </details>
          {impact && (
            <div className="plan-preview">
              <strong>Impacto antes de guardar</strong>
              <p>{impact}</p>
            </div>
          )}
        </>
      )}
      <label>
        Evidencias · un enlace o referencia por línea
        <textarea
          rows={3}
          value={(draft.evidence ?? []).join("\n")}
          disabled={!canEdit && !mayEvidence}
          onChange={(e) =>
            update({
              ...draft,
              evidence: e.target.value.split("\n").filter(Boolean),
            })
          }
          placeholder="Enlace a prueba, documento o archivo adjunto"
        />
      </label>
      {c.files.filter((f) => f.activityId === draft.id).length > 0 && (
        <div className="evidence-files">
          {c.files
            .filter((f) => f.activityId === draft.id)
            .map((f) => (
              <button
                type="button"
                className="text-link"
                key={f.id}
                disabled={!canEdit && !mayEvidence}
                onClick={() =>
                  update({
                    ...draft,
                    evidence: [
                      ...new Set([
                        ...(draft.evidence ?? []),
                        "/api/files/" + f.id,
                      ]),
                    ],
                  })
                }
              >
                Añadir {f.name} como evidencia
              </button>
            ))}
        </div>
      )}
      {mayEvidence && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() =>
            action("submitEvidence", {
              id: draft.id,
              evidence: draft.evidence ?? [],
              revision: draft.revision,
            })
              .then((result) => {
                if (result.activity)
                  update({
                    ...draft,
                    revision: result.activity.revision,
                    evidence: result.activity.evidence,
                    reviewerId: result.activity.reviewerId,
                    status: result.activity.status,
                    actualEnd: result.activity.actualEnd,
                  });
              })
              .catch((e) => setError(e.message))
          }
        >
          Guardar evidencia
        </button>
      )}
      {current && (
        <div className="review-status">
          <p>
            {reviewer
              ? `Revisión confirmada por ${reviewer.name} (${p.teams.find((t) => t.id === reviewer.teamId)?.name ?? "Docente"}).`
              : "Pendiente de revisión de otro equipo."}
          </p>
          {member && member.teamId !== draft.teamId && (
            <button
              type="button"
              className="secondary"
              disabled={busy || !current.evidence?.length}
              onClick={() =>
                action("reviewActivity", {
                  id: draft.id,
                  revision: draft.revision,
                })
                  .then((result) => {
                    if (result.activity)
                      update({
                        ...draft,
                        revision: result.activity.revision,
                        reviewerId: result.activity.reviewerId,
                      });
                  })
                  .catch((e) => setError(e.message))
              }
            >
              <ShieldCheck size={15} />
              Confirmar mi revisión
            </button>
          )}
        </div>
      )}
      {c.requireCrossReview && (
        <p className="form-note">
          Para marcar Hecha se exige evidencia guardada y una revisión
          confirmada desde la cuenta de una persona de otro equipo.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
