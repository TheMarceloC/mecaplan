import { hash } from "bcryptjs";
import { z } from "zod";
import { findUser, saveUser } from "../src/server/repositories";
import { sqlite } from "../src/server/repositories/database";
import { securityAudit } from "../src/server/security-audit";
async function main() {
  const input = z
    .object({
      email: z.email().transform((value) => value.toLowerCase()),
      password: z.string().min(12).max(128),
      name: z.string().min(2),
    })
    .parse({
      email: process.env.SUPERUSER_EMAIL,
      password: process.env.SUPERUSER_PASSWORD,
      name: process.env.SUPERUSER_NAME || "Administrador",
    });
  const existing = await findUser(input.email);
  await saveUser({
    ...existing,
    id: existing?.id ?? crypto.randomUUID(),
    name: input.name,
    email: input.email,
    passwordHash: await hash(input.password, 12),
    globalRole: "superuser",
    status: "active",
    isInstructor:
      !!existing?.isInstructor || process.env.SUPERUSER_IS_INSTRUCTOR === "1",
    mustChangePassword: false,
  });
  const configured = await findUser(input.email);
  sqlite.prepare("DELETE FROM sessions WHERE user_id=?").run(configured!.id);
  await securityAudit(configured!.id, "Configuró acceso desde script local", {
    userId: configured!.id,
    instructor: !!configured!.isInstructor,
  });
  console.log(
    "Superusuario configurado. Inicia sesión con los datos que proporcionaste.",
  );
}
main().catch(() => {
  console.error(
    "Define SUPERUSER_EMAIL y SUPERUSER_PASSWORD (mínimo 12 caracteres) en las variables de entorno.",
  );
  process.exitCode = 1;
});
