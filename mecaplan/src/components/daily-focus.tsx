"use client";
import { type Project, leafActivities, today } from "@/lib/model";
export function DailyFocus({
  project: p,
  userId,
}: {
  project: Project;
  userId: string;
}) {
  const now = today(),
    limit = new Date(Date.parse(now) + 7 * 86400000).toISOString().slice(0, 10),
    tasks = leafActivities(p).filter(
      (a) =>
        (a.responsible.includes(userId) || a.accountable === userId) &&
        a.status !== "Hecha",
    ),
    due = tasks.filter((a) => !a.unscheduled && a.end <= limit),
    blocked = tasks.filter((a) => a.status === "Bloqueada");
  return (
    <section className="panel daily-focus">
      <h2>Tu siguiente paso</h2>
      <p>
        {due.length} compromisos con entrega hasta {limit} · {blocked.length}{" "}
        bloqueos · {tasks.filter((a) => a.unscheduled).length} tareas por
        planificar
      </p>
      <p className="form-note">
        Abre una actividad para actualizar su estado, aportar evidencia o pedir
        revisión. Revisa primero las vencidas y las que desbloquean a otro
        equipo.
      </p>
      {due.slice(0, 3).map((a) => (
        <p key={a.id}>
          <strong>{a.code}</strong> · {a.title} ·{" "}
          {a.end < now ? "Vencida · " : ""}
          {a.end}
        </p>
      ))}
    </section>
  );
}
