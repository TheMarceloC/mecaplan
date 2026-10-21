"use client";
import { useState, type FormEvent } from "react";
import { Cloud, Link2, ExternalLink, Check } from "lucide-react";
import { type Project, type PublicUser } from "@/lib/model";
import { control } from "@/lib/control";
import { byCode } from "@/lib/codes";
import { oneDriveUrl } from "@/lib/onedrive-link";
import { can } from "@/server/auth/permissions";

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
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const c = control(p);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    setNotice("");
    try {
      values.url = oneDriveUrl(String(values.url));
      const r = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, projectId: p.id }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      form.reset();
      await refresh();
      setNotice(
        "Enlace guardado. Abre el documento para comprobar el acceso en Microsoft.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el enlace.",
      );
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
              Los documentos permanecen en OneDrive. MecaPlan guarda únicamente
              sus enlaces y referencias.
            </p>
          </div>
          <span className="phase-status approved">Solo enlaces</span>
        </div>
        <ol className="storage-steps">
          <li>Guarda el documento en la carpeta de OneDrive del proyecto.</li>
          <li>
            En Microsoft, usa <strong>Compartir → Copiar vínculo</strong> y
            concede acceso a las personas que lo necesitan.
          </li>
          <li>
            Pega el enlace aquí y abre el documento para comprobar sus permisos.
          </li>
        </ol>
        <p className="form-note">
          Esta página no recibe documentos adjuntos. La importación de Excel es
          un proceso aparte: lee los datos de la plantilla para rellenar las
          tablas.
        </p>
        <a
          className="text-link"
          href="/guia-onedrive.html"
          target="_blank"
          rel="noreferrer"
        >
          Cómo compartir y comprobar los enlaces ↗
        </a>
      </section>
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
      <section className="panel">
        <h2>
          <Link2 size={20} />
          Asociar enlace de OneDrive
        </h2>
        <form onSubmit={save}>
          <div className="form-grid">
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
                maxLength={4096}
                placeholder="https://…sharepoint.com/…"
              />
            </label>
          </div>
          <label>
            Actividad relacionada
            <select name="activityId">
              <option value="">Documento del proyecto</option>
              {p.activities
                .filter((a) => !a.deletedAt)
                .sort(byCode)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.title}
                  </option>
                ))}
            </select>
          </label>
          <button className="primary" disabled={busy}>
            <Link2 size={15} />
            Guardar enlace
          </button>
        </form>
        <p className="form-note">
          Se aceptan enlaces HTTPS de OneDrive y SharePoint. Guardar el enlace
          aquí no modifica sus permisos en Microsoft.
        </p>
      </section>
      <section className="panel">
        <h2>Documentos del proyecto</h2>
        {!c.files.length ? (
          <p className="form-note">
            Todavía no hay enlaces asociados. Agrega actas, bitácoras,
            comprobantes y evidencias desde el formulario.
          </p>
        ) : (
          c.files.map((f) => {
            let valid = false;
            try {
              valid = f.provider === "onedrive" && !!oneDriveUrl(f.url ?? "");
            } catch {}
            return (
              <article className="phase-entry" key={f.id}>
                <div>
                  <span
                    className={
                      "phase-status " + (valid ? "approved" : "pending")
                    }
                  >
                    {valid
                      ? "Formato de enlace válido"
                      : f.provider === "onedrive"
                        ? "Revisar enlace"
                        : "Archivo anterior"}
                  </span>
                  <h3>{f.name}</h3>
                  <small>
                    {f.activityId
                      ? p.activities.find((a) => a.id === f.activityId)?.code
                      : "Proyecto completo"}
                  </small>
                  <p className="form-note">
                    {valid
                      ? "Microsoft comprueba el acceso al abrirlo. Puede solicitar tu cuenta institucional."
                      : "Conserva el documento en OneDrive y asocia un enlace válido."}
                  </p>
                </div>
                {(valid || f.provider !== "onedrive") && (
                  <a
                    className="secondary"
                    target="_blank"
                    rel="noreferrer"
                    href={"/api/files/" + encodeURIComponent(f.id)}
                  >
                    <ExternalLink size={15} />
                    {valid
                      ? "Abrir y comprobar acceso"
                      : "Abrir archivo anterior"}
                  </a>
                )}
                {f.provider === "onedrive" &&
                  (f.uploadedBy === user.id ||
                    can(user, "project:edit", p)) && (
                    <button
                      className="secondary danger"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "¿Retirar este enlace del proyecto? El documento se conserva en OneDrive.",
                          )
                        )
                          return;
                        setBusy(true);
                        setError("");
                        setNotice("");
                        try {
                          await action("removeFileLink", { id: f.id });
                          setNotice(
                            "Enlace retirado. El documento se conserva en OneDrive.",
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
              </article>
            );
          })
        )}
        <p className="form-note">
          Retirar un enlace o eliminar el proyecto conserva los documentos en
          OneDrive.
        </p>
      </section>
    </div>
  );
}
