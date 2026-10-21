"use client";
import { useState, type FormEvent } from "react";
import { KeyRound, UserRound, ShieldCheck } from "lucide-react";
import type { PublicUser } from "@/lib/model";

export function AccountSettings({
  user,
  action,
  busy,
}: {
  user: PublicUser;
  busy: boolean;
  action: (name: string, data?: unknown) => Promise<unknown>;
}) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function save(e: FormEvent<HTMLFormElement>, password = false) {
    e.preventDefault();
    const form = e.currentTarget,
      values = Object.fromEntries(new FormData(form));
    setError("");
    setNotice("");
    try {
      if (password && values.password !== values.confirm)
        throw Error("Las contraseñas nuevas no coinciden.");
      if (password) delete values.confirm;
      await action(password ? "changePassword" : "updateProfile", values);
      if (password) form.reset();
      else
        (form.elements.namedItem("currentPassword") as HTMLInputElement).value =
          "";
      setNotice(
        password
          ? "Contraseña actualizada. Las otras sesiones se cerraron."
          : "Datos de usuario actualizados.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }
  return (
    <div className="account-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TU ESPACIO PERSONAL</div>
          <h1>
            Mi cuenta<span className="heading-dot">.</span>
          </h1>
          <p>Actualiza tus datos de acceso y tu contraseña.</p>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="import-success" role="status">
          {notice}
        </p>
      )}
      <div className="account-grid">
        <section className="panel">
          <h2>
            <UserRound size={21} />
            Datos del usuario
          </h2>
          <form
            key={user.id + user.email + user.name + user.username}
            onSubmit={(e) => save(e)}
          >
            <label>
              Nombre completo
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                defaultValue={user.name}
              />
            </label>
            <label>
              Correo electrónico
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                defaultValue={user.email}
              />
            </label>
            <label>
              Nombre de usuario
              <input
                name="username"
                maxLength={80}
                pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}"
                autoComplete="username"
                defaultValue={user.username ?? ""}
              />
            </label>
            <p className="form-note">
              Opcional: al menos 3 caracteres. Puedes iniciar sesión con tu
              correo o tu usuario.
            </p>
            <label>
              Contraseña actual para confirmar
              <input
                name="currentPassword"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <button className="primary" disabled={busy}>
              Guardar datos
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>
            <KeyRound size={21} />
            Cambiar contraseña
          </h2>
          <form onSubmit={(e) => save(e, true)}>
            <label>
              Contraseña actual
              <input
                name="oldPassword"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <label>
              Nueva contraseña
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirmar nueva contraseña
              <input
                name="confirm"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <p className="form-note">
              Usa al menos 12 caracteres. Al cambiarla, se cierran las otras
              sesiones y se invalidan los enlaces de recuperación anteriores.
            </p>
            <button className="primary" disabled={busy}>
              Actualizar contraseña
            </button>
          </form>
          <div className="account-permissions">
            <ShieldCheck size={19} />
            <div>
              <strong>
                {user.globalRole === "superuser"
                  ? "Superusuario"
                  : "Usuario del equipo"}
                {user.isInstructor ? " · Evaluador" : ""}
              </strong>
              <p>
                Tus equipos y permisos los gestiona la administración del
                proyecto.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
