export type CpmTask = { id: string; duration: number };
export type Dependency = {
  predecessorId: string;
  successorId: string;
  lagDays?: number;
};
export type CpmItem = {
  id: string;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  slack: number;
  critical: boolean;
};
export function calculateCPM(tasks: CpmTask[], dependencies: Dependency[]) {
  const map = new Map(tasks.map((t) => [t.id, t]));
  if (map.size !== tasks.length)
    throw Error("Hay identificadores de actividad duplicados.");
  for (const t of tasks)
    if (!Number.isInteger(t.duration) || t.duration < 0)
      throw Error(
        "La duración debe ser un número entero de días hábiles mayor o igual a cero.",
      );
  const incoming = new Map(tasks.map((t) => [t.id, [] as Dependency[]])),
    outgoing = new Map(tasks.map((t) => [t.id, [] as Dependency[]]));
  for (const d of dependencies) {
    if (!map.has(d.predecessorId) || !map.has(d.successorId))
      throw Error(
        "La dependencia hace referencia a una actividad inexistente o que no es hoja.",
      );
    if (!Number.isInteger(d.lagDays ?? 0))
      throw Error("El desfase debe expresarse en días enteros.");
    incoming.get(d.successorId)!.push(d);
    outgoing.get(d.predecessorId)!.push(d);
  }
  const degree = new Map(tasks.map((t) => [t.id, incoming.get(t.id)!.length]));
  const queue = tasks.filter((t) => !degree.get(t.id)).map((t) => t.id),
    order: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    order.push(id);
    for (const d of outgoing.get(id)!) {
      degree.set(d.successorId, degree.get(d.successorId)! - 1);
      if (!degree.get(d.successorId)) queue.push(d.successorId);
    }
  }
  if (order.length !== tasks.length)
    throw Error(
      "Esta dependencia crea un ciclo. El plan debe avanzar sin volver a una actividad anterior.",
    );
  const result = new Map<string, CpmItem>();
  for (const id of order) {
    const es = Math.max(
      0,
      ...incoming
        .get(id)!
        .map(
          (d) => result.get(d.predecessorId)!.earlyFinish + (d.lagDays ?? 0),
        ),
    );
    result.set(id, {
      id,
      earlyStart: es,
      earlyFinish: es + map.get(id)!.duration,
      lateStart: 0,
      lateFinish: 0,
      slack: 0,
      critical: false,
    });
  }
  const duration = Math.max(
    0,
    ...[...result.values()].map((r) => r.earlyFinish),
  );
  for (const id of [...order].reverse()) {
    const r = result.get(id)!;
    r.lateFinish = Math.min(
      duration,
      ...outgoing
        .get(id)!
        .map((d) => result.get(d.successorId)!.lateStart - (d.lagDays ?? 0)),
    );
    r.lateStart = r.lateFinish - map.get(id)!.duration;
    r.slack = r.lateStart - r.earlyStart;
    r.critical = r.slack === 0;
  }
  return {
    duration,
    order,
    items: order.map((id) => result.get(id)!),
    criticalIds: order.filter((id) => result.get(id)!.critical),
  };
}
const utc = (value: string) => new Date(value + "T12:00:00Z");
export function workingDaysInclusive(
  start: string,
  end: string,
  workingDays = 5,
) {
  let n = 0;
  for (
    const d = utc(start), last = utc(end);
    d <= last;
    d.setUTCDate(d.getUTCDate() + 1)
  )
    if ((d.getUTCDay() + 6) % 7 < workingDays) n++;
  return n;
}
export function addWorkingDays(
  start: string,
  offset: number,
  workingDays = 5,
): string {
  if (!Number.isInteger(offset) || offset < 0)
    throw Error("El desplazamiento debe ser un entero no negativo.");
  const d = utc(start);
  const isWorking = () => (d.getUTCDay() + 6) % 7 < workingDays;
  while (!isWorking()) d.setUTCDate(d.getUTCDate() + 1);
  for (let n = 0; n < offset; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorking()) n++;
  }
  return d.toISOString().slice(0, 10);
}
export function workingDayDistance(
  start: string,
  end: string,
  workingDays = 5,
) {
  let n = 0;
  const d = utc(start),
    target = utc(end);
  const sign = d <= target ? 1 : -1;
  while ((sign > 0 && d < target) || (sign < 0 && d > target)) {
    if ((d.getUTCDay() + 6) % 7 < workingDays) n += sign;
    d.setUTCDate(d.getUTCDate() + sign);
  }
  return n;
}
