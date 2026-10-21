"use client";
import { useState } from "react";
import { Plus, TriangleAlert } from "lucide-react";
import { type Project, type PublicUser, today } from "@/lib/model";
import { control } from "@/lib/control";
import { impactLabels, probabilityLabels } from "@/lib/risk-scale";
import { can } from "@/server/auth/permissions";
type Risk = ReturnType<typeof control>["risks"][number];
const shortDate = (v: string) =>
  new Date(v + "T12:00:00").toLocaleDateString("es-GT", {
    day: "numeric",
    month: "short",
  });
export function RiskPanel({
  project: p,
  user,
  onCreate,
  onEdit,
}: {
  project: Project;
  user: PublicUser;
  onCreate: () => void;
  onEdit: (r: Risk) => void;
}) {
  const [selection, setSelection] = useState<{
      probability: number;
      impact: number;
    } | null>(null),
    [status, setStatus] = useState("all"),
    risks = control(p).risks,
    selected = risks.filter((r) =>
      selection
        ? r.status === "open" &&
          r.probability === selection.probability &&
          r.impact === selection.impact
        : status === "all" || r.status === status,
    ),
    names = { open: "Abierto", mitigated: "Mitigado", closed: "Cerrado" };
  return (
    <>
      <div className="phase-toolbar">
        <p>
          Selecciona una casilla para ver sus riesgos. Usa Editar en la ficha
          para actualizar los que tienes asignados; los administradores pueden
          editar todos.
        </p>
        <button className="primary" onClick={onCreate}>
          <Plus size={16} />
          Registrar riesgo
        </button>
      </div>
      <div className="risk-layout">
        <section className="panel risk-matrix">
          <h2>Matriz de riesgos abiertos</h2>
          <div className="risk-axis">Impacto → · Probabilidad de 5 a 1 ↓</div>
          <div className="risk-grid">
            {[5, 4, 3, 2, 1].flatMap((probability) =>
              [1, 2, 3, 4, 5].map((impact) => {
                const group = risks.filter(
                    (r) =>
                      r.status === "open" &&
                      r.probability === probability &&
                      r.impact === impact,
                  ),
                  level = probability * impact;
                return (
                  <button
                    type="button"
                    className={
                      "risk-cell risk-" +
                      (level >= 15 ? "high" : level >= 6 ? "medium" : "low") +
                      (selection?.probability === probability &&
                      selection.impact === impact
                        ? " selected"
                        : "")
                    }
                    key={probability + "-" + impact}
                    aria-pressed={
                      selection?.probability === probability &&
                      selection.impact === impact
                    }
                    aria-label={`Probabilidad ${probability} (${probabilityLabels[probability]}), impacto ${impact} (${impactLabels[impact]}): ${group.length} ${group.length === 1 ? "riesgo abierto" : "riesgos abiertos"}`}
                    title={
                      group
                        .map((r) => r.code + " · " + r.description)
                        .join("\n") || "Sin riesgos abiertos"
                    }
                    onClick={() => setSelection({ probability, impact })}
                  >
                    <small>
                      P{probability} × I{impact}
                    </small>
                    <strong>{group.length}</strong>
                    <b>{group.length === 1 ? "riesgo" : "riesgos"}</b>
                    <span>Nivel {level}</span>
                  </button>
                );
              }),
            )}
          </div>
          <p className="form-note">
            El número grande cuenta riesgos. El nivel es probabilidad × impacto,
            sobre 25. Colores y umbrales orientan la gestión; no son notas del
            curso.
          </p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>
                {selection
                  ? `P${selection.probability} × I${selection.impact}`
                  : "Riesgos registrados"}{" "}
                <span className="subtle">({selected.length})</span>
              </h2>
              {selection && (
                <button className="text-btn" onClick={() => setSelection(null)}>
                  Ver todos los riesgos
                </button>
              )}
            </div>
            {!selection && (
              <select
                aria-label="Estado de riesgos"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">Todos los estados</option>
                <option value="open">Abiertos</option>
                <option value="mitigated">Mitigados</option>
                <option value="closed">Cerrados</option>
              </select>
            )}
          </div>
          {!selected.length ? (
            <div className="phase-empty">
              <TriangleAlert size={26} />
              <p>
                {selection
                  ? "No hay riesgos abiertos en esta casilla."
                  : "No hay riesgos registrados con este estado."}
              </p>
            </div>
          ) : (
            selected
              .sort(
                (a, b) => b.probability * b.impact - a.probability * a.impact,
              )
              .map((r) => (
                <article className="phase-entry" key={r.id}>
                  <div>
                    <span className={"phase-status " + r.status}>
                      {names[r.status]}
                    </span>
                    <h3>
                      <span className="risk-code">{r.code}</span>
                      {r.description}
                    </h3>
                    <p>
                      <strong>Mitigación:</strong>{" "}
                      {r.mitigation || "Por definir"}
                    </p>
                    {(r.nextAction || r.dueDate) && (
                      <p
                        className={
                          r.status === "open" &&
                          r.dueDate &&
                          r.dueDate < today()
                            ? "risk-next overdue"
                            : "risk-next"
                        }
                      >
                        <strong>Próxima acción:</strong>{" "}
                        {r.nextAction || "Por definir"}
                        {r.dueDate && ` · ${shortDate(r.dueDate)}`}
                        {r.status === "open" &&
                          r.dueDate &&
                          r.dueDate < today() &&
                          " · vencida"}
                      </p>
                    )}
                    <small>
                      {p.members.find((m) => m.id === r.ownerId)?.name ??
                        "Sin responsable"}{" "}
                      · Probabilidad {probabilityLabels[r.probability]} ×
                      impacto {impactLabels[r.impact]} ={" "}
                      {r.probability * r.impact}/25
                    </small>
                  </div>
                  {(can(user, "project:edit", p) || r.ownerId === user.id) && (
                    <button
                      className="secondary"
                      aria-label={
                        "Editar riesgo " +
                        (r.code ?? "") +
                        " · " +
                        r.description
                      }
                      onClick={() => onEdit(r)}
                    >
                      Editar
                    </button>
                  )}
                </article>
              ))
          )}
        </section>
      </div>
    </>
  );
}
