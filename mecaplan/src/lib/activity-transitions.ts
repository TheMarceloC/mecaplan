import { activitySchema, today, type Activity, type Project } from "./model";
import { control, validateCompletion } from "./control";

/** Shared by forms, imports, approved changes and signed webhook events. */
export function transitionActivity(
  p: Project,
  candidate: Activity,
  previous?: Activity,
  date = today(),
): Activity {
  const next = activitySchema.parse(candidate);
  if (
    previous &&
    previous.status !== next.status &&
    p.activities.some((a) => !a.deletedAt && a.parentId === next.id)
  ) {
    throw Error(
      "El avance del padre se calcula a partir de sus actividades hijas.",
    );
  }
  const evidenceChanged =
    !!previous &&
    JSON.stringify(previous.evidence ?? []) !==
      JSON.stringify(next.evidence ?? []);
  if (evidenceChanged) {
    next.reviewerId = "";
    if (previous.status === "Hecha" && next.status === "Hecha")
      next.status = "En revisión";
  }
  if (
    next.status === "En progreso" &&
    previous?.status !== "En progreso" &&
    !next.actualStart
  )
    next.actualStart = date;
  next.actualEnd =
    next.status === "Hecha"
      ? previous?.status === "Hecha"
        ? (previous.actualEnd ?? null)
        : date
      : null;
  validateCompletion(p, next);
  const from = previous?.status ?? "Pendiente";
  if (from !== next.status) {
    p.control ??= control(p);
    p.control.statusEvents ??= [];
    p.control.statusEvents.push({
      id: crypto.randomUUID(),
      activityId: next.id,
      from,
      to: next.status,
      at: new Date().toISOString(),
      date,
    });
  }
  return next;
}
