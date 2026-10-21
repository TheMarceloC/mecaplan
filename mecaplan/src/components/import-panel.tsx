"use client";
import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  Download,
  Upload,
  Check,
  TriangleAlert,
  FileSpreadsheet,
} from "lucide-react";
import { type Project } from "@/lib/model";
import { ImportDiff } from "./import-diff";
import { useUploadLimits } from "./use-upload-limits";
import {
  importSheets,
  type ImportIssue,
  type ImportChange,
} from "@/lib/import-format";
type Preview = {
  token?: string;
  errors: ImportIssue[];
  warnings: string[];
  changes: ImportChange[];
  summary: { new: number; updated: number; unchanged?: number };
};
export function ImportPanel({
  project: p,
  refresh,
}: {
  project: Project;
  refresh: () => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const limits = useUploadLimits();
  const [file, setFile] = useState<File | null>(null),
    [mode, setMode] = useState("upsert"),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState("");
  useEffect(() => {
    setPreview(null);
    setFile(null);
    setDone("");
    setError("");
  }, [p.id]);
  async function inspect(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > limits.importBytes) {
      setError(`El archivo supera ${limits.importBytes / 1024 / 1024} MB.`);
      return;
    }
    setBusy(true);
    setError("");
    setDone("");
    setPreview(null);
    try {
      const f = new FormData();
      f.set("projectId", p.id);
      f.set("mode", mode);
      f.set("file", file);
      const r = await fetch("/api/import", { method: "POST", body: f }),
        result = await r.json();
      if (!r.ok) throw Error(result.error);
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revisar.");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!preview?.token) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: p.id,
            token: preview.token,
            confirm: true,
          }),
        }),
        result = await r.json();
      if (!r.ok) throw Error(result.error);
      setPreview(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setDone(
        `${result.imported} filas importadas. Las tablas y el contexto ya usan estos datos.`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="phase-area">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>
              <FileSpreadsheet size={23} />
              Importar tablas desde Excel
            </h2>
            <p className="form-note">
              Completa las hojas que necesites. Las demás pueden permanecer
              vacías.
            </p>
          </div>
          <a className="primary" href="/plantilla-mecaplan.xlsx" download>
            <Download size={16} />
            Descargar plantilla Excel
          </a>
        </div>
        <div className="import-sheet-tags">
          {importSheets.map((s) => (
            <span key={s.key}>{s.name}</span>
          ))}
        </div>
        <ol className="storage-steps">
          <li>
            Descarga la plantilla y completa las hojas que necesites,
            conservando sus encabezados.
          </li>
          <li>
            Selecciona el XLSX y revisa las filas nuevas, los cambios y los
            errores.
          </li>
          <li>
            Confirma la importación para rellenar las tablas del proyecto
            seleccionado.
          </li>
        </ol>
        <form onSubmit={inspect} className="import-upload">
          <label>
            Archivo XLSX · hasta {limits.importBytes / 1024 / 1024} MB
            <input
              key={p.id}
              ref={fileInput}
              type="file"
              accept=".xlsx"
              required
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setDone("");
              }}
            />
          </label>
          <label>
            Cómo importar
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setPreview(null);
              }}
            >
              <option value="upsert">
                Agregar nuevos y actualizar existentes
              </option>
              <option value="new">Solo agregar nuevos</option>
            </select>
          </label>
          <button className="primary" disabled={busy || !file}>
            <Upload size={16} />
            {busy ? "Revisando…" : "Revisar y ver cambios"}
          </button>
        </form>
        <p className="form-note">
          La Referencia externa se conserva al reimportar; Código identifica la
          actividad visible. Si completas ambos deben apuntar al mismo registro.
          Para nuevas actividades, completa Referencia y deja Código vacío. Los
          campos vacíos conservan valores existentes; escribe [vacío] para
          limpiar un campo opcional. Los cambios se aplican únicamente al
          confirmar. Los gastos nuevos entran pendientes; los ya decididos solo
          se aceptan si no cambian. Las revisiones se validan.
        </p>
        <p className="form-note">
          El XLSX solo se procesa para importar datos a las tablas; no se guarda
          como documento. Para conservar el original, guárdalo en OneDrive y
          registra su enlace en OneDrive y enlaces.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="import-success" role="status">
            <Check size={17} />
            {done}
          </p>
        )}
      </section>
      {preview && (
        <section className="panel">
          <div className="section-heading">
            <h2>
              Vista previa · {preview.changes.length}{" "}
              {preview.changes.length === 1 ? "fila" : "filas"}
            </h2>
            <span className="mini-label">
              {preview.summary.new} NUEVAS · {preview.summary.updated}{" "}
              ACTUALIZACIONES · {preview.summary.unchanged ?? 0} SIN CAMBIOS
            </span>
          </div>
          {preview.errors.length > 0 && (
            <div className="import-errors">
              <h3>
                <TriangleAlert size={18} />
                Corrige {preview.errors.length} errores antes de importar
              </h3>
              {preview.errors.map((e, i) => (
                <p key={i}>
                  <strong>
                    {e.sheet} · fila {e.row || "general"} · {e.column}:
                  </strong>{" "}
                  {e.message}
                </p>
              ))}
            </div>
          )}
          {preview.warnings.length > 0 && (
            <details className="import-details">
              <summary>{preview.warnings.length} avisos de revisión</summary>
              {preview.warnings.map((w, i) => (
                <p className="import-note" key={i}>
                  {w}
                </p>
              ))}
            </details>
          )}
          <div className="phase-table-wrap">
            <table className="phase-table">
              <thead>
                <tr>
                  <th>Hoja / fila</th>
                  <th>Operación</th>
                  <th>Registro</th>
                  <th>Detalle del cambio</th>
                </tr>
              </thead>
              <tbody>
                {preview.changes.map((c, i) => (
                  <tr key={i}>
                    <td>
                      {c.sheet} · {c.row}
                    </td>
                    <td>
                      <span
                        className={
                          "phase-status " +
                          (c.mode === "new" ? "open" : "pending")
                        }
                      >
                        {c.unchanged
                          ? "Sin cambios"
                          : c.mode === "new"
                            ? "Nuevo"
                            : "Actualizar"}
                      </span>
                    </td>
                    <td>{c.label}</td>
                    <td>
                      <ImportDiff
                        change={c}
                        project={p}
                        changes={preview.changes}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button
              className="secondary"
              onClick={() => setPreview(null)}
              disabled={busy}
            >
              Descartar vista previa
            </button>
            <button
              className="primary"
              disabled={busy || !preview.token || preview.errors.length > 0}
              onClick={apply}
            >
              <Check size={16} />
              Confirmar importación
            </button>
          </div>
          <p className="form-note">
            La vista previa caduca en 15 minutos y se invalida si cambia el
            proyecto.
          </p>
        </section>
      )}
      <section className="panel">
        <h2>Referencias de este proyecto</h2>
        <p className="form-note">
          Usa nombres exactos o códigos del proyecto. Para varias personas o
          dependencias, separa con punto y coma.
        </p>
        <details className="import-details">
          <summary>Equipos e integrantes disponibles</summary>
          {p.teams.map((t) => (
            <p className="import-note" key={t.id}>
              <strong>
                {t.name} · {t.codePrefix}
              </strong>
              <br />
              {p.members
                .filter((m) => m.teamId === t.id)
                .map((m) => m.name)
                .join("; ") || "Sin integrantes"}
            </p>
          ))}
        </details>
        <details className="import-details">
          <summary>Códigos y referencias para actualizar</summary>
          <div className="phase-table-wrap">
            <table className="phase-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Referencia o código</th>
                  <th>Nombre</th>
                </tr>
              </thead>
              <tbody>
                {p.activities
                  .filter((a) => !a.deletedAt)
                  .map((a) => (
                    <tr key={a.id}>
                      <td>Actividad</td>
                      <td>
                        {a.code}
                        {a.importKey ? " · " + a.importKey : ""}
                      </td>
                      <td>{a.title}</td>
                    </tr>
                  ))}
                {[
                  ...(p.control?.budget ?? []).map((b) => ({
                    id: b.id,
                    key: b.importKey,
                    title: b.name,
                    kind: "Presupuesto",
                  })),
                  ...(p.control?.expenses ?? []).map((b) => ({
                    id: b.id,
                    key: b.importKey,
                    title: b.description,
                    kind: "Gasto",
                  })),
                  ...(p.control?.risks ?? []).map((b) => ({
                    id: b.id,
                    key: b.importKey ?? b.code,
                    title: b.description,
                    kind: "Riesgo",
                  })),
                  ...(p.control?.records ?? []).map((b) => ({
                    id: b.id,
                    key: b.importKey,
                    title: b.title,
                    kind: "Registro",
                  })),
                ].map((r) => (
                  <tr key={r.id}>
                    <td>{r.kind}</td>
                    <td>{r.key ?? r.id}</td>
                    <td>{r.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}
