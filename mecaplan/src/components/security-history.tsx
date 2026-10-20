"use client";
import { useState } from "react";
export function SecurityHistory() {
  const [entries, setEntries] = useState<any[]>([]),
    [error, setError] = useState("");
  return (
    <section className="panel">
      <h2>Historial de seguridad de la instalación</h2>
      <p className="form-note">
        Operaciones globales y acceso a cuentas. El contenido de evaluaciones
        docentes permanece separado.
      </p>
      <button
        className="secondary"
        onClick={async () => {
          try {
            const r = await fetch("/api/audit", { cache: "no-store" }),
              d = await r.json();
            if (!r.ok) throw Error(d.error);
            setEntries(d.entries);
            setError("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo consultar.");
          }
        }}
      >
        Consultar historial global
      </button>
      {error && <p role="alert">{error}</p>}
      {entries.map((e) => (
        <details key={e.id} className="import-details">
          <summary>
            {new Date(e.date).toLocaleString("es-HN")} · {e.action}
          </summary>
          <pre>{JSON.stringify(e.detail, null, 2)}</pre>
          <small>Usuario: {e.actorId}</small>
        </details>
      ))}
    </section>
  );
}
