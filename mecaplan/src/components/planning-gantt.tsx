"use client";
import { TriangleAlert } from "lucide-react";
import { type Activity, type Project } from "@/lib/model";
import {
  control,
  planning,
  scheduledCriticalIds,
  dependencyConflicts,
} from "@/lib/control";
import { workingDayDistance } from "@/lib/cpm";

export function PlanningGantt({
  project: p,
  rows,
  onEdit,
}: {
  project: Project;
  rows: Activity[];
  onEdit: (a: Activity) => void;
}) {
  const c = control(p),
    plan = planning(p),
    critical = scheduledCriticalIds(p),
    conflicts = dependencyConflicts(p),
    baseline = c.baselines.at(-1),
    days = c.workingDays;
  const code = (id: string) =>
    p.activities.find((t) => t.id === id)?.code ?? id;
  const dates = rows.flatMap((a) => [a.end, a.actualEnd ?? a.end]);
  const weeks = Math.max(
    p.weeks,
    Math.ceil(
      Math.max(
        0,
        ...dates.map((d) => workingDayDistance(p.start, d, days) + 1),
      ) / days,
    ),
  );
  const x = (date: string) =>
    Math.max(
      0,
      (workingDayDistance(p.start, date, days) / (weeks * days)) * 100,
    );
  const width = (duration: number) =>
    Math.max(0.7, (duration / (weeks * days)) * 100);
  const rowHeight = 76,
    person = (id: string) =>
      p.members.find((m) => m.id === id)?.name ?? "Sin asignar";
  return (
    <section className="panel phase-gantt">
      {conflicts.length > 0 && (
        <div className="phase-warning gantt-conflicts" role="status">
          <TriangleAlert size={18} />
          <span>
            <strong>
              {conflicts.length}{" "}
              {conflicts.length === 1
                ? "dependencia no se cumple"
                : "dependencias no se cumplen"}{" "}
              con las fechas actuales.
            </strong>{" "}
            Una actividad empieza antes de que termine la actividad de la que
            depende. Revisa las filas marcadas o ajusta las fechas.
          </span>
        </div>
      )}
      <div className="gantt-inner">
        <div
          className="gantt-content"
          style={{ minWidth: 280 + Math.max(600, weeks * 65) }}
        >
          <div className="gantt-head">
            <span>Actividad / responsable</span>
            <div className="gantt-weeks">
              {Array.from({ length: weeks }, (_, i) => (
                <span
                  className={
                    Math.floor(
                      (Date.now() - Date.parse(p.start)) / 604800000,
                    ) === i
                      ? "current-week"
                      : i >= p.weeks
                        ? "beyond-project"
                        : ""
                  }
                  key={i}
                >
                  S{i + 1}
                </span>
              ))}
            </div>
          </div>
          {rows.map((a) => {
            const r = plan.items.find((r) => r.id === a.id),
              b = baseline?.items.find((b) => b.id === a.id),
              isCritical = critical.has(a.id),
              broken = conflicts.filter((k) => k.activityId === a.id);
            return (
              <div
                className={
                  "gantt-row" + (broken.length ? " gantt-row-conflict" : "")
                }
                key={a.id}
              >
                <div>
                  <strong>
                    {a.code} <span>{a.title}</span>
                  </strong>
                  <small>
                    {a.responsible.map(person).join(", ") || "Sin responsable"}
                    {a.unscheduled ? " · sin planificar" : ""}
                  </small>
                  {/* Se reemplaza la línea de dependencias para no cambiar la altura de la fila (las flechas usan rowHeight). */}
                  {broken.length ? (
                    <small
                      className="gantt-conflict-note"
                      title={
                        "Depende de " + a.dependencies.map(code).join(", ")
                      }
                    >
                      <TriangleAlert size={12} />
                      Empieza antes de que termine{" "}
                      {broken.map((k) => code(k.predecessorId)).join(", ")}
                    </small>
                  ) : (
                    <small>
                      {a.dependencies.length
                        ? "Depende de " + a.dependencies.map(code).join(", ")
                        : "Sin predecesoras"}
                    </small>
                  )}
                </div>
                <div
                  className="gantt-lane"
                  style={{ backgroundSize: `${100 / weeks}% 100%` }}
                >
                  {b && (
                    <i
                      className="baseline-bar"
                      title={`Línea base: ${b.start} — ${b.end}`}
                      style={{
                        left: x(b.start) + "%",
                        width: width(b.duration) + "%",
                      }}
                    />
                  )}
                  {a.actualEnd && (
                    <i
                      className="actual-bar"
                      title={`Fin real: ${a.actualEnd}`}
                      style={{
                        left: x(a.actualStart ?? a.start) + "%",
                        width:
                          width(
                            Math.max(
                              1,
                              workingDayDistance(
                                a.actualStart ?? a.start,
                                a.actualEnd,
                                days,
                              ) + 1,
                            ),
                          ) + "%",
                      }}
                    />
                  )}
                  <button
                    className={
                      "gantt-bar " +
                      (isCritical ? "critical" : "") +
                      (a.duration === 0 ? " milestone-bar" : "") +
                      (a.unscheduled ? " provisional" : "")
                    }
                    title={`${a.code} · ${a.title} · ${a.duration} días · Holgura ${r?.slack ?? "—"}${isCritical ? " · ruta crítica" : ""}`}
                    aria-label={`Planificar ${a.code}: ${a.title}${isCritical ? " (ruta crítica)" : ""}`}
                    style={{
                      left: x(a.start) + "%",
                      width: width(a.duration) + "%",
                      background: isCritical
                        ? undefined
                        : p.teams.find((t) => t.id === a.teamId)?.color,
                    }}
                    onClick={() => onEdit(a)}
                  >
                    {a.duration === 0 ? "◆" : a.duration + " d"}
                  </button>
                </div>
              </div>
            );
          })}
          <svg
            className="gantt-dependencies"
            viewBox={`0 0 1000 ${Math.max(1, rows.length * rowHeight)}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="dependency-arrow"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#7e8ea7" />
              </marker>
              <marker
                id="dependency-arrow-conflict"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#c2410c" />
              </marker>
            </defs>
            {rows.flatMap((a, i) =>
              a.dependencies.map((id) => {
                const j = rows.findIndex((b) => b.id === id);
                if (j < 0) return null;
                const from = rows[j],
                  start = Math.min(
                    995,
                    x(from.start) * 10 + width(from.duration) * 10,
                  ),
                  end = x(a.start) * 10,
                  y1 = j * rowHeight + 29,
                  y2 = i * rowHeight + 29,
                  bend = Math.min(998, start + 9),
                  broken = conflicts.some(
                    (k) => k.activityId === a.id && k.predecessorId === id,
                  );
                return (
                  <path
                    key={a.id + "-" + id}
                    d={`M${start},${y1} H${bend} V${y2} H${Math.max(0, end)}`}
                    fill="none"
                    stroke={broken ? "#c2410c" : "#7e8ea7"}
                    strokeWidth={broken ? 1.6 : 1}
                    strokeDasharray="3 2"
                    markerEnd={`url(#${broken ? "dependency-arrow-conflict" : "dependency-arrow"})`}
                  />
                );
              }),
            )}
            {c.milestones
              .filter((m) => m.date)
              .map((m) => (
                <g key={m.id}>
                  <line
                    x1={x(m.date) * 10}
                    x2={x(m.date) * 10}
                    y1="0"
                    y2={rows.length * rowHeight}
                    stroke="#03AED2"
                    strokeDasharray="5 5"
                  />
                  <text x={x(m.date) * 10} y="12" fill="#05065C" fontSize="12">
                    ◆
                    <title>
                      {m.title}: {m.date}
                    </title>
                  </text>
                </g>
              ))}
          </svg>
        </div>
      </div>
      <p className="form-note">
        Rojo: ruta crítica (si se atrasa, se atrasa la fecha final) · Gris:
        línea base · Verde: ejecución real · Flechas: dependencias · Flecha
        naranja: dependencia que no se cumple · ◆: hito · Punteado: provisional.
        Desplázate a los lados para ver todas las semanas y selecciona una barra
        para planificar.
      </p>
    </section>
  );
}
