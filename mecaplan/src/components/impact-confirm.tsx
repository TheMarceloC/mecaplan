"use client";
import { TriangleAlert } from "lucide-react";
import { describeImpact, type PlanImpact } from "@/lib/plan-impact";

/**
 * Confirmación dentro de la app cuando un cambio mueve el fin del proyecto.
 * Reemplaza window.confirm: si el navegador bloquea esas ventanas, el cambio se
 * cancelaba sin ningún aviso.
 */
export function ImpactConfirm({
  impact,
  busy,
  confirm,
  cancel,
}: {
  impact: PlanImpact;
  busy: boolean;
  confirm: () => void;
  cancel: () => void;
}) {
  return (
    <div className="impact-confirm" role="alert">
      <p>
        <TriangleAlert size={16} aria-hidden="true" />
        <span>
          <strong>Este cambio afecta la ruta crítica.</strong>{" "}
          {describeImpact(impact)}
        </span>
      </p>
      <div className="impact-actions">
        <button type="button" className="secondary" onClick={cancel}>
          Seguir editando
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={confirm}
        >
          Guardar de todos modos
        </button>
      </div>
    </div>
  );
}
