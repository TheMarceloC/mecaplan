import { type Evaluation } from "@/lib/phase-schema";
export function EvaluationVersions({
  versions,
}: {
  versions: { id: string; date: string; evaluation: Evaluation }[];
}) {
  if (!versions.length) return null;
  return (
    <details open className="import-details">
      <summary>Versiones privadas de evaluación</summary>
      {versions.map((v) => (
        <article className="import-note" key={v.id}>
          <strong>
            {v.evaluation.title} · {new Date(v.date).toLocaleString("es-HN")}
          </strong>
          <p>{v.evaluation.notes}</p>
          <p>
            {v.evaluation.criteria
              .map((c) => c.name + ": " + c.score + "/" + c.max)
              .join(" · ")}
          </p>
        </article>
      ))}
    </details>
  );
}
