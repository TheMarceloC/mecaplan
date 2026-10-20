import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, sessions } from "../repositories/database";
import { userById } from "../repositories";
export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function currentUser() {
  const token = (await cookies()).get("meca_session")?.value;
  if (!token) return null;
  const session = (
    await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, hashToken(token)))
  )[0];
  if (!session || session.expiresAt < new Date().toISOString()) return null;
  const user = await userById(session.userId);
  if (!user || user.status === "disabled") return null;
  const { passwordHash, ...safe } = user;
  void passwordHash;
  return safe;
}
export async function signIn(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
  });
  (await cookies()).set("meca_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 604800,
  });
}
export async function signOut() {
  const jar = await cookies();
  const token = jar.get("meca_session")?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete("meca_session");
}

export async function requireActiveUser() {
  const user = await currentUser();
  if (!user || user.status !== "active" || user.mustChangePassword)
    throw Error(
      "Inicia sesión con una cuenta activa y cambia tu contraseña inicial para continuar.",
    );
  return user;
}

export async function sessionIdentity() {
  const token = (await cookies()).get("meca_session")?.value;
  return token ? hashToken(token) : "";
}
