"use client";
import { useState, useEffect, type FormEvent } from "react";
import { Cloud, Link2, Upload, ExternalLink, Check } from "lucide-react";
import { type Project, type PublicUser } from "@/lib/model";
import { control } from "@/lib/control";
import { byCode } from "@/lib/codes";
import { uploadAccept, uploadTypesLabel } from "@/lib/upload-types";
import { can } from "@/server/auth/permissions";
import { useUploadLimits } from "./use-upload-limits";
type Status = {
  configured: boolean;
  connected: boolean;
  account: string;
  redirectUri: string;
  missing: string[];
};
export function StoragePanel({
  project: p,
  user,
  refresh,
  action,
}: {
  project: Project;
  user: PublicUser;
  refresh: () => Promise<void>;
  action: (name: string, data?: unknown) => Promise<unknown>;
}) {
  const limits = useUploadLimits();
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const admin = user.globalRole === "superuser",
    c = control(p);
  const activityOptions = p.activities
    .filter((a) => !a.deletedAt)
    .sort(byCode)
    .map((a) => (
      <option key={a.id} value={a.id}>
        {a.code} · {a.title}
      </option>
    ));
  async function load() {
    const r = await fetch("/api/onedrive", { cache: "no-store" });
    if (r.ok) setState(await r.json());
  }
  useEffect(() => {
    load().catch(() => {});
    setError("");
    setNotice("");
  }, [p.id]);
  async function command(action: string, fileId?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/onedrive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, projectId: p.id, fileId }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.url) {
        window.location.assign(d.url);
        return;
      }
      await load();
      await refresh();
      setNotice(
        action === "migrate"
          ? "Archivo verificado en OneDrive. Se conserva su referencia en las actividades."
          : "Conexión actualizada.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>, upload = false) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    const selectedFile = f.get("file");
    if (
      upload &&
      selectedFile instanceof File &&
      selectedFile.size > limits.documentBytes
    ) {
      setError(
        `El archivo supera ${limits.documentBytes / 1024 / 1024} MB. Súbelo a OneDrive y asocia su enlace.`,
      );
      return;
    }
    f.set("projectId", p.id);
    if (upload) f.set("operationId", operationId);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/files", {
          method: "POST",
          ...(upload
            ? { body: f }
            : {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(Object.fromEntries(f)),
              }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      form.reset();
      if (upload) setOperationId(crypto.randomUUID());
      await refresh();
      setNotice(
        upload
          ? "Archivo guardado y verificado en OneDrive."
          : "Enlace asociado al proyecto.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
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
              <Cloud size={23} />
              OneDrive institucional · UNITEC
            </h2>
            <p className="form-note">
              Los documentos quedan en OneDrive. El proyecto guarda sus enlaces
              y referencias.
            </p>
          </div>
          <span
            className={
              "phase-status " + (state?.connected ? "approved" : "pending")
            }
          >
            {state?.connected ? "Cuenta conectada" : "Sin conexión de subida"}
          </span>
        </div>
        {state?.connected ? (
          <p className="form-note">
            Cuenta: {state.account}. Las subidas se organizan en MecaPlan /
            Proyecto.
          </p>
        ) : (
          <p className="form-note">
            Puedes asociar enlaces de OneDrive desde ahora. Para subir archivos
            desde esta página, un administrador debe conectar la cuenta
            institucional.
          </p>
        )}
        {admin && (
          <div className="phase-actions">
            <button
              className="primary"
              disabled={busy || !state?.configured}
              onClick={() => command("connect")}
            >
              <Cloud size={16} />
              {state?.connected
                ? "Reconectar cuenta"
                : "Conectar Microsoft OneDrive"}
            </button>
            {state?.connected && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => command("disconnect")}
              >
                Desconectar cuenta
              </button>
            )}
          </div>
        )}
        {admin && !state?.configured && (
          <details className="import-details storage-setup">
            <summary>Configuración necesaria para conectar Microsoft</summary>
            <p>
              Registra una aplicación Web en Microsoft Entra para la cuenta
              institucional y configura sus valores privados en .env.local. La
              universidad puede requerir autorización de TI.
            </p>
            <p>Variables pendientes: {state?.missing.join(", ")}.</p>
            <p>
              Usa el mismo origen para iniciar sesión aquí y para el URI de
              retorno registrado. La guía del proyecto está en docs/ONEDRIVE.md.
              No pegues secretos en formularios, chats ni repositorios.
            </p>
            <a href="/guia-onedrive.html" target="_blank" rel="noreferrer">
              Abrir guía paso a paso de MecaPlan ↗
            </a>
          </details>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="import-success">
            <Check size={16} />
            {notice}
          </p>
        )}
      </section>
      <div className="storage-forms">
        <section className="panel">
          <h2>
            <Link2 size={20} />
            Asociar archivo de OneDrive
          </h2>
          <form onSubmit={(e) => save(e)}>
            <label>
              Nombre del documento
              <input
                name="name"
                minLength={2}
                maxLength={200}
                required
                placeholder="Acta de reunión · semana 1"
              />
            </label>
            <label>
              Enlace de OneDrive o SharePoint
              <input
                name="url"
                type="url"
                required
                placeholder="https://…sharepoint.com/…"
              />
            </label>
            <label>
              Actividad relacionada
              <select name="activityId">
                <option value="">Documento del proyecto</option>
                {activityOptions}
              </select>
            </label>
            <button className="primary" disabled={busy}>
              <Link2 size={15} />
              Guardar enlace
            </button>
          </form>
          <p className="form-note">
            Se mantienen los permisos del documento en Microsoft. Compartir el
            enlace aquí no concede acceso en OneDrive.
          </p>
        </section>
        <section className="panel">
          <h2>
            <Upload size={20} />
            Subir directamente a OneDrive
          </h2>
          {!state?.connected && (
            <p className="form-note upload-blocked" role="note">
              La subida se activa cuando un administrador conecte la cuenta
              institucional. Mientras tanto, sube el archivo a OneDrive y asocia
              su enlace en el formulario de al lado.
            </p>
          )}
          <form onSubmit={(e) => save(e, true)}>
            <fieldset className="plain-fieldset" disabled={!state?.connected}>
              <label>
                Archivo · hasta {limits.documentBytes / 1024 / 1024} MB
                <input
                  type="file"
                  name="file"
                  accept={uploadAccept}
                  onChange={() => setOperationId(crypto.randomUUID())}
                  required
                />
              </label>
              <label>
                Actividad relacionada
                <select name="activityId">
                  <option value="">Documento del proyecto</option>
                  {activityOptions}
                </select>
              </label>
              <button className="primary" disabled={busy}>
                <Upload size={15} />
                Subir a OneDrive
              </button>
            </fieldset>
          </form>
          <p className="form-note">
            {uploadTypesLabel}. El archivo se transfiere a OneDrive y se
            verifica; no se guarda como adjunto local nuevo.
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>Documentos del proyecto</h2>
        {!c.files.length ? (
          <p className="form-note">Todavía no hay documentos asociados.</p>
        ) : (
          c.files.map((f) => (
            <article className="phase-entry" key={f.id}>
              <div>
                <span
                  className={
                    "phase-status " +
                    (f.provider === "onedrive" ? "approved" : "pending")
                  }
                >
                  {f.provider === "onedrive"
                    ? "Enlace OneDrive"
                    : "Archivo local anterior"}
                </span>
                <h3>{f.name}</h3>
                <small>
                  {f.activityId
                    ? p.activities.find((a) => a.id === f.activityId)?.code
                    : "Proyecto completo"}
                  {f.size ? " · " + (f.size / 1024).toFixed(1) + " KB" : ""}
                </small>
              </div>
              <a
                className="secondary"
                target="_blank"
                rel="noreferrer"
                href={"/api/files/" + f.id}
              >
                <ExternalLink size={15} />
                Abrir
              </a>
              {f.provider === "onedrive" &&
                (f.uploadedBy === user.id || can(user, "project:edit", p)) && (
                  <button
                    className="secondary danger"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "¿Retirar este enlace del proyecto? El archivo se conserva en OneDrive.",
                        )
                      )
                        return;
                      setBusy(true);
                      try {
                        await action("removeFileLink", { id: f.id });
                        setNotice(
                          "Enlace retirado. El archivo se conserva en OneDrive.",
                        );
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "No se pudo retirar el enlace.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Retirar enlace
                  </button>
                )}
              {f.provider !== "onedrive" && admin && (
                <button
                  className="secondary"
                  disabled={busy || !state?.connected}
                  onClick={() => command("migrate", f.id)}
                >
                  Migrar a OneDrive
                </button>
              )}
            </article>
          ))
        )}
        <p className="form-note">
          Eliminar el proyecto no elimina estos documentos de OneDrive. Los
          archivos locales anteriores se migran de forma explícita cuando la
          cuenta esté conectada.
        </p>
      </section>
    </div>
  );
}
