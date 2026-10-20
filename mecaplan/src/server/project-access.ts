import { currentUser } from "./auth";
import { can } from "./auth/permissions";
import { allProjects } from "./repositories";
export async function projectAccess(id: string) {
  const user = await currentUser();
  if (!user || user.mustChangePassword || user.status !== "active")
    throw Error("Inicia sesión y cambia tu contraseña inicial para continuar.");
  const project = (await allProjects()).find((p) => p.id === id);
  if (!project || !can(user, "read", project))
    throw Error("No tienes acceso a este proyecto.");
  return { user, project };
}
