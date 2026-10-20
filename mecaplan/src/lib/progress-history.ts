import { leafActivities, type Project } from "./model";
import { control } from "./control";

/** Cutoff is exclusive: a weekly point represents the work known before that date. */
export function progressAt(p: Project, cutoff: string): number | null {
  const tasks = leafActivities(p),
    c = control(p);
  if (!tasks.length) return 0;
  const snapshot = [...c.snapshots]
    .filter((s) => s.date < cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const eventDate = (event: NonNullable<typeof c.statusEvents>[number]) =>
    event.date ??
    new Date(event.at).toLocaleDateString("en-CA", {
      timeZone: "America/Tegucigalpa",
    });
  const events = (c.statusEvents ?? [])
    .filter(
      (e) =>
        eventDate(e) < cutoff && (!snapshot || eventDate(e) > snapshot.date),
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  const done = new Set(
    snapshot?.doneIds ??
      tasks.filter((a) => a.actualEnd && a.actualEnd < cutoff).map((a) => a.id),
  );
  if (!snapshot && !events.length && !done.size) return null;
  for (const event of events) {
    if (event.to === "Hecha") done.add(event.activityId);
    else done.delete(event.activityId);
  }
  return Math.round(
    (tasks.filter((a) => done.has(a.id)).length / tasks.length) * 100,
  );
}
