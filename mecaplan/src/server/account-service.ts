import { z } from "zod";
import { compare, hash } from "bcryptjs";
import {
  allProjects,
  allUsers,
  audit,
  saveProject,
  saveUser,
  userById,
} from "./repositories";
import { sql, transaction } from "./repositories/database";
import { securityAudit } from "./security-audit";

const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .max(80)
      .refine(
        (v) => !v || /^[a-z0-9][a-z0-9._-]{2,79}$/.test(v),
        "Usa al menos 3 caracteres: letras, números, punto, guion o guion bajo.",
      ),
    currentPassword: z.string().min(1).max(128),
  })
  .strict();

async function authenticatedUser(id: string, password: string) {
  const user = await userById(id);
  if (!user || user.status !== "active")
    throw Error("La cuenta no está activa.");
  if (!(await compare(password, user.passwordHash)))
    throw Error("La contraseña actual no es correcta.");
  return user;
}

/** Called under the application's write lock. Identity changes revoke every old session. */
export async function updateOwnProfile(userId: string, input: unknown) {
  const d = profileSchema.parse(input);
  return transaction(async () => {
    const user = await authenticatedUser(userId, d.currentPassword);
    if (user.mustChangePassword)
      throw Error("Cambia tu contraseña inicial antes de continuar.");
    const keys = [d.email, d.username].filter(Boolean);
    if (
      (await allUsers()).some(
        (u) =>
          u.id !== user.id &&
          [u.email, u.username ?? ""].some((v) =>
            keys.includes(v.toLowerCase()),
          ),
      )
    )
      throw Error("El correo o nombre de usuario ya está en uso.");
    const identityChanged =
      d.email !== user.email || d.username !== (user.username ?? "");
    const changed = ["name", "email", "username"].filter(
      (key) =>
        d[key as "name" | "email" | "username"] !==
        (user[key as "name" | "email" | "username"] ?? ""),
    );
    if (!changed.length) return { identityChanged: false };
    await saveUser({
      ...user,
      name: d.name,
      email: d.email,
      username: d.username || null,
    });
    if (d.name !== user.name) {
      for (const p of await allProjects()) {
        const member = p.members.find((m) => m.id === user.id);
        if (!member) continue;
        member.name = d.name;
        audit(
          p,
          d.name,
          "Actualizó su nombre de perfil",
          user.id,
          { name: user.name },
          { name: d.name },
        );
        await saveProject(p);
      }
    }
    if (identityChanged) {
      await sql.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
      await sql
        .prepare("DELETE FROM password_resets WHERE user_id=?")
        .run(user.id);
    }
    await securityAudit(user.id, "Actualizó su perfil", { fields: changed });
    return { identityChanged };
  });
}

export async function changeOwnPassword(userId: string, input: unknown) {
  const d = z
    .object({
      oldPassword: z.string().min(1).max(128),
      password: z.string().min(12).max(128),
    })
    .strict()
    .parse(input);
  return transaction(async () => {
    const user = await authenticatedUser(userId, d.oldPassword);
    if (await compare(d.password, user.passwordHash))
      throw Error("Elige una contraseña diferente de la actual.");
    await saveUser({
      ...user,
      passwordHash: await hash(d.password, 12),
      mustChangePassword: false,
    });
    await sql.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    await sql
      .prepare("DELETE FROM password_resets WHERE user_id=?")
      .run(user.id);
    await securityAudit(user.id, "Cambió su contraseña", {});
  });
}
