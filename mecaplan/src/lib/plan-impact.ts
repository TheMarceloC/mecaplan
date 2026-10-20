// Impacto de un cambio de duración sobre el fin del proyecto (resultado de previewPlan).
export type PlanImpact = {
  before: { finish: string; overflowDays: number };
  after: { finish: string; overflowDays: number };
};

/**
 * Solo hace falta pedir confirmación cuando el cambio mueve el fin del proyecto
 * o aumenta los días que se pasa de la fecha límite. Si nada de eso cambia,
 * guardar directamente evita una pregunta sin información nueva.
 */
export const impactNeedsConfirmation = (impact: PlanImpact) =>
  impact.before.finish !== impact.after.finish ||
  impact.after.overflowDays > impact.before.overflowDays;

const longDate = (value: string) =>
  new Date(value + "T12:00:00").toLocaleDateString("es-GT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const workingDays = (n: number) =>
  `${n} ${n === 1 ? "día hábil" : "días hábiles"}`;

/** Explicación en español del impacto, con las fechas en el formato del resto de la app. */
export function describeImpact(impact: PlanImpact) {
  const { before, after } = impact;
  const move =
    before.finish === after.finish
      ? `El fin del proyecto se mantiene el ${longDate(after.finish)}.`
      : `El fin del proyecto pasa del ${longDate(before.finish)} al ${longDate(after.finish)}.`;
  const deadline = after.overflowDays
    ? ` Quedaría ${workingDays(after.overflowDays)} después de la fecha límite.`
    : " Sigue dentro de la fecha límite.";
  return move + deadline;
}
