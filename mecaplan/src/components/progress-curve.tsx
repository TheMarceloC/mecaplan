"use client";
import { type Project, progress, today } from "@/lib/model";
import { control } from "@/lib/control";
import { progressAt } from "@/lib/progress-history";
export function ProgressCurve({ project: p }: { project: Project }) {
  const c = control(p),
    now = today(),
    tasks = p.activities.filter(
      (a) =>
        !a.deletedAt &&
        a.status !== "Cancelada" &&
        !p.activities.some((b) => b.parentId === a.id && !b.deletedAt),
    ),
    total = tasks.length || 1,
    hasPlan = tasks.some((a) => !a.unscheduled);
  const points = Array.from({ length: p.weeks + 1 }, (_, week) => {
    const date = new Date(Date.parse(p.start) + week * 604800000)
        .toISOString()
        .slice(0, 10),
      planned =
        (tasks.filter((a) => !a.unscheduled && a.end < date).length / total) *
        100;
    const dated = tasks.filter((a) => a.actualEnd && a.actualEnd < date).length,
      snapshot = c.snapshots.filter((s) => s.date < date).at(-1);
    // Future periods have no measured actual value. Today's progress is a separate observation.
    const actual = date > now ? null : week === 0 ? 0 : progressAt(p, date);
    return { week, date, planned, actual };
  });
  const currentWeek = (Date.parse(now) - Date.parse(p.start)) / 604800000,
    x = (week: number) => 60 + (week / p.weeks) * 730,
    y = (v: number) => 270 - v * 2.2;
  return (
    <section className="panel">
      <h2>Curva S · avance planeado y real</h2>
      <p className="form-note">
        La ejecución usa finalizaciones y capturas registradas. Los periodos
        futuros quedan sin medición. El punto de hoy muestra el avance actual.
      </p>
      <div className="curve-wrap">
        <svg
          viewBox="0 0 840 335"
          role="img"
          aria-label="Porcentaje de avance planeado y real por semana"
        >
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1="60" y1={y(v)} x2="790" y2={y(v)} stroke="#dce0ea" />
              <text x="18" y={y(v) + 5}>
                {v}%
              </text>
            </g>
          ))}
          {hasPlan && (
            <polyline
              points={points
                .map((a) => `${x(a.week)},${y(a.planned)}`)
                .join(" ")}
              fill="none"
              stroke="#0f49b6"
              strokeWidth="3"
            />
          )}
          {points
            .filter((a) => a.actual !== null)
            .map((a) => (
              <circle
                key={a.week}
                cx={x(a.week)}
                cy={y(a.actual!)}
                r="5"
                fill="#03aed2"
              >
                <title>
                  {a.date}: {Math.round(a.actual!)}% real
                </title>
              </circle>
            ))}
          {currentWeek >= 0 && currentWeek <= p.weeks && (
            <g>
              <line
                x1={x(currentWeek)}
                x2={x(currentWeek)}
                y1="40"
                y2="275"
                stroke="#03aed2"
                strokeDasharray="4 4"
              />
              <circle
                cx={x(currentWeek)}
                cy={y(progress(p))}
                r="6"
                fill="#05065c"
              >
                <title>Hoy: {progress(p)}%</title>
              </circle>
              <text x={x(currentWeek) + 5} y="30">
                Hoy
              </text>
            </g>
          )}
          {points.map((a) => (
            <text key={a.week} x={x(a.week) - 8} y="300">
              S{a.week}
            </text>
          ))}
        </svg>
      </div>
      <div className="chart-legend">
        <span>
          <i style={{ background: "#0f49b6" }} />
          {hasPlan ? "Planeado" : "Plan por definir"}
        </span>
        <span>
          <i style={{ background: "#03aed2" }} />
          Real registrado
        </span>
      </div>
      <div className="phase-table-wrap">
        <table className="phase-table">
          <thead>
            <tr>
              <th>Semana</th>
              <th>Planeado</th>
              <th>Real</th>
            </tr>
          </thead>
          <tbody>
            {points.map((a) => (
              <tr key={a.week}>
                <td>{a.week}</td>
                <td>
                  {hasPlan ? Math.round(a.planned) + "%" : "Sin planificar"}
                </td>
                <td>
                  {a.actual === null
                    ? "Sin medición"
                    : Math.round(a.actual) + "%"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
