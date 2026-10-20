import { z } from "zod";
import { type Project, activitySchema } from "./model";
import { type Control } from "./phase-schema";
import { control } from "./control";

type Change = Control["changes"][number];
export function changeTarget(
  p: Project,
  change: Pick<Change, "type" | "activityId" | "targetType" | "value">,
) {
  const kind =
    change.targetType ??
    (change.activityId
      ? change.type === "budget"
        ? "budgetItem"
        : "activity"
      : "project");
  const id = change.activityId;
  if (kind === "project") {
    if (id || !["duration", "scope"].includes(change.type))
      throw Error(
        "Selecciona un destino de proyecto compatible con este cambio.",
      );
    return {
      kind,
      id: p.id,
      label: p.name,
      before: change.type === "duration" ? p.weeks : p.description,
      value:
        change.type === "duration"
          ? z.number().int().min(1).max(104).parse(change.value)
          : z.string().max(2000).parse(change.value),
      unit: change.type === "duration" ? "semanas" : "texto",
    };
  }
  if (kind === "budgetItem") {
    if (change.type !== "budget")
      throw Error("La partida solo admite cambios de presupuesto.");
    const item = control(p).budget.find((b) => b.id === id);
    if (!item) throw Error("La partida de destino ya no existe.");
    return {
      kind,
      id: item.id,
      label: item.name,
      before: item.unitPriceCents,
      value: z.number().int().nonnegative().max(100000000).parse(change.value),
      unit: "centavos",
    };
  }
  const a = p.activities.find((a) => a.id === id && !a.deletedAt);
  if (!a) throw Error("La actividad de destino ya no existe.");
  if (change.type === "budget")
    throw Error("Selecciona una partida para cambiar presupuesto.");
  const value =
    change.type === "duration"
      ? z.number().int().min(0).max(365).parse(change.value)
      : change.type === "dates"
        ? z.iso.date().parse(change.value)
        : change.type === "status"
          ? activitySchema.shape.status.parse(change.value)
          : z.string().max(4000).parse(change.value);
  if (change.type === "dates" && String(value) < a.start)
    throw Error("La entrega debe ser igual o posterior al inicio.");
  return {
    kind,
    id: a.id,
    label: a.code + " · " + a.title,
    before:
      change.type === "duration"
        ? a.duration
        : change.type === "dates"
          ? a.end
          : change.type === "status"
            ? a.status
            : a.description,
    value,
    unit:
      change.type === "duration"
        ? "días hábiles"
        : change.type === "dates"
          ? "fecha"
          : "texto",
  };
}
