"use client";
import { Dialog } from "./dialog";
import { useState, type FormEvent } from "react";
import { Plus, Users, Trash2, X } from "lucide-react";
import { type Project, type PublicUser } from "@/lib/model";
import { can } from "@/server/auth/permissions";
export function TeamManager({
  project: p,
  user,
  action,
  busy,
}: {
  project: Project;
  user: PublicUser;
  action: (name: string, data?: unknown) => Promise<unknown>;
  busy: boolean;
}) {
  const [edit, setEdit] = useState<Project["teams"][number] | null | false>(
      false,
    ),
    [error, setError] = useState("");
  if (!can(user, "members:edit", p)) return null;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await action("saveTeam", {
        team: {
          id: edit ? edit.id : crypto.randomUUID(),
          name: f.get("name"),
          color: f.get("color"),
          codePrefix: String(f.get("prefix")).toUpperCase(),
        },
        leaderId: f.get("leaderId"),
        memberIds: f.getAll("member").map(String),
      });
      setEdit(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }
  return (
    <section className="panel team-manager">
      <div className="section-heading">
        <div>
          <h2>Gestionar equipos</h2>
          <p className="form-note">
            Crea equipos y define cómo se identificarán sus actividades.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEdit(null);
            setError("");
          }}
        >
          <Plus size={16} />
          Crear equipo
        </button>
      </div>
      <div className="team-config-list">
        {p.teams.map((t) => (
          <article key={t.id}>
            <i style={{ background: t.color }} />
            <div>
              <strong>{t.name}</strong>
              <small>
                {t.codePrefix} ·{" "}
                {p.members.filter((m) => m.teamId === t.id).length} integrantes
              </small>
            </div>
            <button
              className="secondary"
              onClick={() => {
                setEdit(t);
                setError("");
              }}
            >
              Editar equipo
            </button>
          </article>
        ))}
      </div>
      {edit !== false && (
        <Dialog
          title={edit ? "Editar equipo" : "Crear equipo"}
          close={() => setEdit(false)}
          className="phase-modal"
        >
          <form onSubmit={save}>
            <label>
              Nombre del equipo
              <input
                name="name"
                minLength={2}
                maxLength={80}
                required
                defaultValue={edit?.name}
              />
            </label>
            <div className="form-grid">
              <label>
                Prefijo de actividades
                <input
                  name="prefix"
                  minLength={2}
                  maxLength={8}
                  pattern="[A-Za-z][A-Za-z0-9]{1,7}"
                  required
                  defaultValue={edit?.codePrefix}
                  placeholder="Ejemplo: PRU"
                />
              </label>
              <label>
                Color
                <input
                  name="color"
                  type="color"
                  defaultValue={edit?.color ?? "#0F49B6"}
                />
              </label>
            </div>
            <label>
              Líder del equipo
              <select
                name="leaderId"
                defaultValue={
                  p.members.find((m) => m.teamId === edit?.id && m.lead)?.id ??
                  ""
                }
              >
                <option value="">Por asignar</option>
                {p.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Integrantes que se asignarán a este equipo</legend>
              <div className="raci-people">
                {p.members.map((m) => (
                  <label className="checkbox-label" key={m.id}>
                    <input
                      name="member"
                      type="checkbox"
                      value={m.id}
                      defaultChecked={m.teamId === edit?.id}
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="form-note">
              Seleccionar una persona la mueve a este equipo. Las demás
              conservan su equipo actual. Para mover a alguien fuera de este
              equipo, asígnalo al equipo de destino. Los códigos anteriores de
              actividades se conservan como alias.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEdit(false)}
              >
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                Guardar equipo
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
export function ProjectDeletion({
  project: p,
  user,
  action,
  busy,
}: {
  project: Project;
  user: PublicUser;
  action: (name: string, data?: unknown) => Promise<unknown>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  if (user.globalRole !== "superuser") return null;
  return (
    <section className="panel deletion-panel">
      <div className="section-heading">
        <div>
          <h2>Eliminar este proyecto</h2>
          <p className="form-note">
            Se eliminarán sus registros de la aplicación. Los documentos de
            OneDrive se conservan.
          </p>
        </div>
        <button className="secondary danger" onClick={() => setOpen(true)}>
          <Trash2 size={16} />
          Eliminar proyecto
        </button>
      </div>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await action("deleteProject", { id: p.id, confirmName: name });
              setOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo eliminar.");
            }
          }}
        >
          <p>
            Se eliminarán actividades, gastos y registros. Las evaluaciones
            docentes se conservarán en su archivo privado y los documentos
            seguirán en OneDrive. Escribe <strong>{p.name}</strong> para
            confirmar.
          </p>
          <label>
            Nombre del proyecto a eliminar
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setOpen(false);
                setName("");
                setError("");
              }}
            >
              Cancelar
            </button>
            <button
              className="primary danger"
              disabled={busy || name !== p.name}
            >
              Eliminar definitivamente
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
