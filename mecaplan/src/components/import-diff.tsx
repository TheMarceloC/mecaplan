import { type Project } from "@/lib/model";
import { type ImportChange } from "@/lib/import-format";

const fields: Record<string, string> = {
  importKey: "Referencia",
  code: "Código",
  title: "Título",
  name: "Nombre",
  teamId: "Equipo",
  description: "Descripción",
  status: "Estado",
  priority: "Prioridad",
  start: "Inicio",
  end: "Fin",
  duration: "Duración (días)",
  responsible: "Responsables",
  accountable: "Aprobador",
  consulted: "Consultados",
  informed: "Informados",
  dependencies: "Dependencias",
  dependencyLags: "Desfases (días)",
  evidence: "Evidencia",
  blockedReason: "Motivo del bloqueo",
  unscheduled: "Sin planificar",
  quantity: "Cantidad",
  unitPriceCents: "Precio unitario",
  amountCents: "Importe",
  category: "Categoría",
  supplier: "Proveedor",
  url: "Enlace",
  activityId: "Actividad",
  isBom: "BOM",
  notes: "Notas",
  date: "Fecha",
  budgetItemId: "Partida",
  receiptId: "Comprobante",
  paidBy: "Registrado por",
  probability: "Probabilidad",
  impact: "Impacto",
  mitigation: "Mitigación",
  ownerId: "Responsable",
  body: "Resumen",
  completed: "Completado",
  items: "Elementos",
  target: "Objetivo",
  measurement: "Medición",
  result: "Resultado",
  attendees: "Participantes",
};
const labels: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  open: "Abierto",
  mitigated: "Mitigado",
  closed: "Cerrado",
  pass: "Cumple",
  fail: "No cumple",
};

export function ImportDiff({
  change: c,
  project: p,
  changes,
}: {
  change: ImportChange;
  project: Project;
  changes: ImportChange[];
}) {
  const resolve = (v: unknown): string => {
    if (v == null || v === "") return "—";
    if (typeof v === "boolean") return v ? "Sí" : "No";
    if (Array.isArray(v))
      return (
        v
          .map((item) =>
            typeof item === "object" && item !== null && "title" in item
              ? `${item.done ? "✓" : "○"} ${item.title}`
              : resolve(item),
          )
          .join("; ") || "—"
      );
    if (typeof v === "object")
      return (
        Object.entries(v)
          .map(([id, days]) => `${resolve(id)}: ${days}`)
          .join("; ") || "—"
      );
    const id = String(v);
    return (
      p.members.find((m) => m.id === id)?.name ??
      p.teams.find((t) => t.id === id)?.name ??
      p.activities.find((a) => a.id === id)?.code ??
      p.control?.budget.find((b) => b.id === id)?.name ??
      p.control?.files.find((f) => f.id === id)?.name ??
      changes.find((c) => c.id === id)?.label ??
      labels[id] ??
      id
    );
  };
  const value = (key: string, v: unknown) =>
    key.endsWith("Cents") && typeof v === "number"
      ? new Intl.NumberFormat("es-HN", {
          style: "currency",
          currency: p.control?.currency ?? "HNL",
        }).format(v / 100)
      : resolve(v);
  const keys = Object.keys(fields).filter(
    (key) =>
      key in c.after &&
      JSON.stringify(c.before?.[key]) !== JSON.stringify(c.after[key]) &&
      (c.before ||
        (![null, "", false].includes(c.after[key] as null | string | boolean) &&
          !(
            Array.isArray(c.after[key]) && !(c.after[key] as unknown[]).length
          ))),
  );
  return (
    <details>
      <summary>Ver antes y después</summary>
      {keys.length ? (
        <table className="import-diff">
          <thead>
            <tr>
              <th>Campo</th>
              <th>Antes</th>
              <th>Después</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <td>{fields[key]}</td>
                <td>{c.before ? value(key, c.before[key]) : "—"}</td>
                <td>{value(key, c.after[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="form-note">Sin cambios en los valores.</p>
      )}
    </details>
  );
}
