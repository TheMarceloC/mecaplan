import { boundedRequest } from "@/server/request-body";
import { assertActivityRevision, RevisionConflict } from "@/lib/revisions";
import { transitionActivity } from "@/lib/activity-transitions";
import { securityAudit } from "@/server/security-audit";
import { demoEnabled } from "@/server/demo-mode";
import { nextActivityCode } from "@/lib/codes";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { currentUser, signIn, signOut, hashToken } from "@/server/auth";
import { can } from "@/server/auth/permissions";
import {
  allProjects,
  allUsers,
  findUser,
  saveUser,
  saveProject,
  audit,
  userById,
} from "@/server/repositories";
import { sql } from "@/server/repositories/database";
import { seedDemo } from "@/server/repositories/demo";
import {
  activitySchema,
  projectSchema,
  personSchema,
  type Project,
} from "@/lib/model";
import { mutateControl, snapshot } from "@/server/control-service";
import { mutateGlobal } from "@/server/global-service";
import {
  planning,
  validateCompletion,
  validateProjectStructure,
} from "@/lib/control";
import { today } from "@/lib/model";
import { withWriteLock } from "@/server/write-lock";
import { jsonRequestBytes } from "@/server/upload-limits";
export const runtime = "nodejs";
let seeded: Promise<void> | undefined;
const ready = () => (seeded ??= demoEnabled() ? seedDemo() : Promise.resolve());
export async function GET() {
  await ready();
  const user = await currentUser();
  const projects =
    !user || user.mustChangePassword
      ? []
      : (await allProjects()).filter((p) => can(user, "read", p));
  const users =
    user?.status === "active" && !user.mustChangePassword
      ? (await allUsers()).filter(
          (u) =>
            user.globalRole === "superuser" ||
            projects.some(
              (p) =>
                can(user, "members:edit", p) &&
                (u.status === "pending" ||
                  p.members.some((m) => m.id === u.id)),
            ),
        )
      : [];
  return NextResponse.json(
    {
      user,
      demoEnabled: demoEnabled(),
      projects,
      users: users.map(({ passwordHash, ...u }) => {
        void passwordHash;
        return u;
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: NextRequest) {
  return withWriteLock(() => mutate(req));
}
async function mutate(req: NextRequest) {
  try {
    await ready();
    // Reject cross-origin writes, including login, before reading request data.
    const origin = req.headers.get("origin");
    if (
      !origin ||
      new URL(origin).host !== req.headers.get("host") ||
      !["http:", "https:"].includes(new URL(origin).protocol)
    )
      return NextResponse.json(
        { error: "Origen de solicitud no permitido." },
        { status: 403 },
      );
    if (Number(req.headers.get("content-length") || 0) > jsonRequestBytes())
      throw Error("La solicitud es demasiado grande.");
    const raw = new TextDecoder().decode(
      await boundedRequest(req, jsonRequestBytes()),
    );
    if (raw.length > jsonRequestBytes())
      throw Error("La solicitud es demasiado grande.");
    const input = z
      .object({
        action: z.string().max(50),
        projectId: z.string().optional(),
        data: z.unknown().optional(),
      })
      .parse(JSON.parse(raw));
    const { action, data } = input;
    if (action === "login" || action === "register") {
      const auth = z
        .object({
          email: (action === "register"
            ? z.email("Escribe un correo válido.")
            : z.string().trim().min(3).max(254)
          ).transform((v) => v.trim().toLowerCase()),
          password: z
            .string()
            .min(
              action === "register" ? 12 : 1,
              "La contraseña debe tener al menos 12 caracteres.",
            )
            .max(128),
          name: z.string().min(2).max(80).optional(),
        })
        .parse(data);
      const key = hashToken(auth.email);
      const now = Date.now();
      const row = (await sql
        .prepare("SELECT count,expires_at FROM login_attempts WHERE key=?")
        .get(key)) as
        | {
            count: number;
            expires_at: number;
          }
        | undefined;
      if (row && row.expires_at > now && row.count >= 8)
        return NextResponse.json(
          { error: "Demasiados intentos. Espera 15 minutos." },
          { status: 429 },
        );
      await sql
        .prepare(
          "INSERT INTO login_attempts VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=?,expires_at=?",
        )
        .run(
          key,
          1,
          now + 900000,
          row && row.expires_at > now ? row.count + 1 : 1,
          now + 900000,
        );
      let user = await findUser(auth.email);
      if (action === "register") {
        if (user) throw Error("Este correo ya está registrado.");
        if (!auth.name) throw Error("Escribe tu nombre.");
        user = {
          id: crypto.randomUUID(),
          name: auth.name,
          email: auth.email,
          passwordHash: await hash(auth.password, 12),
          globalRole: "user",
          status: "pending",
        };
        await saveUser(user);
      } else if (
        !user ||
        !(await compare(auth.password, user.passwordHash)) ||
        user.status === "disabled"
      )
        throw Error("Correo o contraseña incorrectos, o cuenta desactivada.");
      await sql.prepare("DELETE FROM login_attempts WHERE key=?").run(key);
      await signIn(user!.id);
      return NextResponse.json({ ok: true });
    }
    if (action === "demo") {
      if (!demoEnabled())
        return NextResponse.json(
          { error: "La demostración está deshabilitada en esta instalación." },
          { status: 403 },
        );
      await signIn("demo");
      return NextResponse.json({ ok: true });
    }
    if (action === "logout") {
      await signOut();
      return NextResponse.json({ ok: true });
    }
    if (action === "completeReset") {
      const d = z
        .object({
          token: z.string().length(48),
          password: z.string().min(12).max(128),
        })
        .parse(data);
      const tokenHash = hashToken(d.token);
      const reset = (await sql
        .prepare(
          "SELECT user_id,expires_at FROM password_resets WHERE token_hash=?",
        )
        .get(tokenHash)) as
        | {
            user_id: string;
            expires_at: number;
          }
        | undefined;
      if (!reset || reset.expires_at < Date.now())
        throw Error("El token no es válido o ya caducó.");
      const u = await userById(reset.user_id);
      if (!u || u.status === "disabled")
        throw Error("La cuenta no está disponible.");
      await saveUser({
        ...u,
        passwordHash: await hash(d.password, 12),
        mustChangePassword: false,
      });
      await sql
        .prepare("DELETE FROM password_resets WHERE user_id=?")
        .run(u.id);
      await sql.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
      await signIn(u.id);
      return NextResponse.json({ ok: true });
    }
    const actor = await currentUser();
    if (!actor)
      return NextResponse.json(
        { error: "Inicia sesión para continuar." },
        { status: 401 },
      );
    if (action === "changePassword") {
      const d = z
          .object({
            oldPassword: z.string().min(1).max(128),
            password: z.string().min(12).max(128),
          })
          .parse(data),
        u = await userById(actor.id);
      if (!u || !(await compare(d.oldPassword, u.passwordHash)))
        throw Error("La contraseña actual no es correcta.");
      if (d.password === d.oldPassword)
        throw Error("Elige una contraseña diferente de la inicial.");
      await saveUser({
        ...u,
        passwordHash: await hash(d.password, 12),
        mustChangePassword: false,
      });
      await sql.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
      await signIn(u.id);
      return NextResponse.json({ ok: true });
    }
    if (actor.mustChangePassword)
      throw Error("Cambia tu contraseña inicial antes de continuar.");
    if (actor.status !== "active")
      return NextResponse.json(
        { error: "Tu cuenta está pendiente de activación." },
        { status: 403 },
      );
    if (await mutateGlobal(action, data, actor))
      return NextResponse.json({ ok: true });
    if (action === "resetPassword") {
      if (!can(actor, "global:edit"))
        throw Error("Solo el superusuario activo puede restablecer el acceso.");
      const { userId } = z.object({ userId: z.string() }).parse(data);
      const resetUser = await userById(userId);
      if (!resetUser) throw Error("Usuario no encontrado.");
      if (resetUser.isInstructor && !actor.isInstructor)
        throw Error(
          "Solo el ingeniero puede restablecer el acceso de otro evaluador.",
        );
      const token = randomBytes(24).toString("hex");
      await sql
        .prepare("INSERT INTO password_resets VALUES(?,?,?)")
        .run(hashToken(token), userId, Date.now() + 1800000);
      await securityAudit(actor.id, "Solicitó recuperación de acceso", {
        userId,
      });
      return NextResponse.json({ ok: true, token });
    }
    if (action === "useReset") {
      throw Error(
        "Utiliza la pantalla de restablecimiento sin una sesión activa.",
      );
    }
    if (action === "createProject") {
      if (!can(actor, "project:create"))
        throw Error("Solo el superusuario puede crear proyectos.");
      const values = z
        .object({
          name: z.string().min(3).max(100),
          weeks: z.number().int().min(1).max(104),
          start: z.iso.date(),
        })
        .parse(data);
      const p: Project = {
        id: crypto.randomUUID(),
        ...values,
        description: "",
        status: "planning",
        teams: [
          { id: "electronics", name: "Electrónica", color: "#0F49B6" },
          { id: "software", name: "Programación", color: "#03AED2" },
          { id: "cad", name: "CAD y Manufactura", color: "#05065C" },
        ],
        members: [],
        activities: [],
        comments: [],
        history: [],
      };
      audit(p, actor.name, "Creó el proyecto", p.name, null, values);
      await saveProject(p);
      return NextResponse.json({ ok: true });
    }
    const project = (await allProjects()).find((p) => p.id === input.projectId);
    if (!project || !can(actor, "read", project))
      throw Error("No tienes acceso a este proyecto.");
    const requirePermission = (
      permission: Parameters<typeof can>[1],
      activity?: Project["activities"][number],
    ) => {
      if (!can(actor, permission, project, activity))
        throw Error("Tu rol no permite realizar este cambio.");
    };
    const advanced = await mutateControl(action, data, project, actor);
    if (advanced.handled) {
      if (advanced.save) await saveProject(project);
      const activity = ["submitEvidence", "reviewActivity"].includes(action)
        ? project.activities.find((a) => a.id === (data as { id?: string })?.id)
        : undefined;
      return NextResponse.json({
        ok: true,
        ...(advanced.result as object),
        ...(activity ? { activity } : {}),
      });
    }
    if (action === "saveActivity") {
      let a = activitySchema.parse(data);
      const old = project.activities.find((b) => b.id === a.id);
      requirePermission("activity:edit", old ?? a);
      requirePermission("activity:edit", a);
      if (old) assertActivityRevision(a, old);
      a.importKey = old?.importKey ?? a.importKey;
      a.commits = old?.commits ?? 0;
      a.reviewerId = old?.reviewerId ?? "";
      if (
        old &&
        JSON.stringify(old.evidence ?? []) !== JSON.stringify(a.evidence ?? [])
      )
        a.reviewerId = "";
      if (old) a.code = old.code;
      a.aliases = old?.aliases ?? [];
      if (!project.teams.some((t) => t.id === a.teamId))
        throw Error("Selecciona un equipo del proyecto.");
      if (
        [...a.responsible, ...a.consulted, ...a.informed, a.accountable]
          .filter(Boolean)
          .some((id) => !project.members.some((m) => m.id === id))
      )
        throw Error("Los responsables deben pertenecer al proyecto.");
      if (
        a.parentId &&
        (a.parentId === a.id ||
          !project.activities.some((b) => b.id === a.parentId && !b.deletedAt))
      )
        throw Error("Selecciona una actividad padre válida.");
      if (
        a.deletedAt &&
        project.activities.some((b) => b.parentId === a.id && !b.deletedAt)
      )
        throw Error(
          "Mueve o elimina primero las actividades hijas para conservar la jerarquía.",
        );
      let parent = a.parentId;
      const seen = new Set([a.id]);
      while (parent) {
        if (seen.has(parent))
          throw Error("La jerarquía no puede contener ciclos.");
        seen.add(parent);
        parent =
          project.activities.find((b) => b.id === parent)?.parentId ?? null;
      }
      if (!old) {
        a.code = nextActivityCode(project, a.teamId);
        project.activities.push(a);
      } else project.activities[project.activities.indexOf(old)] = a;
      validateProjectStructure(project);
      a = transitionActivity(project, a, old);
      project.activities[
        project.activities.findIndex((row) => row.id === a.id)
      ] = a;
      planning(project);
      snapshot(project);
      audit(
        project,
        actor.name,
        old ? "Editó una actividad" : "Creó una actividad",
        a.title,
        old ?? null,
        a,
      );
    } else if (action === "status") {
      const { id, status, reason } = z
        .object({
          id: z.string(),
          status:
            activitySchema.shape?.status ??
            z.enum([
              "Pendiente",
              "En progreso",
              "Bloqueada",
              "En revisión",
              "Hecha",
              "Cancelada",
            ]),
          reason: z.string().max(1000).default(""),
        })
        .parse(data);
      const a = project.activities.find((b) => b.id === id && !b.deletedAt);
      if (!a) throw Error("Actividad no encontrada.");
      requirePermission("activity:status", a);
      if (project.activities.some((b) => b.parentId === id && !b.deletedAt))
        throw Error(
          "El avance del padre se calcula a partir de sus actividades hijas.",
        );
      const updated = transitionActivity(
        project,
        activitySchema.parse({ ...a, status, blockedReason: reason }),
        a,
      );
      audit(project, actor.name, "Cambió el estado", a.title, a.status, status);
      Object.assign(a, updated);
      snapshot(project);
    } else if (action === "comment") {
      requirePermission("comment");
      const c = z
        .object({
          activityId: z.string(),
          body: z.string().trim().min(1).max(4000),
        })
        .parse(data);
      if (
        !project.activities.some((a) => a.id === c.activityId && !a.deletedAt)
      )
        throw Error("Actividad no encontrada.");
      project.comments.push({
        ...c,
        id: crypto.randomUUID(),
        author: actor.name,
        date: new Date().toISOString(),
      });
      audit(
        project,
        actor.name,
        "Añadió un comentario",
        project.activities.find((a) => a.id === c.activityId)!.title,
        null,
        c.body,
      );
    } else if (action === "saveProject") {
      requirePermission("project:edit");
      const patch = projectSchema
        .pick({
          name: true,
          weeks: true,
          start: true,
          description: true,
          status: true,
          teams: true,
        })
        .parse(data);
      if (
        patch.status !== project.status &&
        (patch.status === "archived" || project.status === "archived") &&
        actor.globalRole !== "superuser"
      )
        throw Error(
          "Solo el superusuario puede archivar o restaurar proyectos.",
        );
      if (
        patch.teams.length !== project.teams.length ||
        patch.teams.some(
          (t) => !project.teams.some((old) => old.id === t.id),
        ) ||
        new Set(patch.teams.map((t) => t.id)).size !== patch.teams.length
      )
        throw Error("Conserva los identificadores de los equipos existentes.");
      audit(
        project,
        actor.name,
        "Actualizó el proyecto",
        project.name,
        {
          name: project.name,
          weeks: project.weeks,
          start: project.start,
          status: project.status,
          teams: project.teams,
        },
        patch,
      );
      Object.assign(project, patch);
    } else if (action === "assignUser") {
      requirePermission("members:edit");
      const member = personSchema.parse(data);
      const user = await userById(member.id);
      if (!user || member.id === "demo")
        throw Error("Usuario no disponible para asignar.");
      if (user.status === "disabled" && actor.globalRole !== "superuser")
        throw Error("La cuenta está desactivada por el administrador global.");
      if (user.isInstructor && !actor.isInstructor && user.status !== "active")
        throw Error(
          "Solo un evaluador puede activar la cuenta de otro docente.",
        );
      if (!project.teams.some((t) => t.id === member.teamId))
        throw Error("Equipo no válido.");
      const old = project.members.find((m) => m.id === member.id);
      member.name = user.name;
      project.members = project.members.filter((m) => m.id !== member.id);
      project.members.push(member);
      audit(
        project,
        actor.name,
        "Asignó acceso",
        member.name,
        old ?? null,
        member,
      );
      await saveUser({ ...user, status: "active" });
      await securityAudit(actor.id, "Asignó membresía", {
        userId: user.id,
        projectId: project.id,
        beforeStatus: user.status,
        status: "active",
      });
    } else if (action === "userStatus") {
      if (actor.globalRole !== "superuser")
        throw Error("Solo el superusuario puede cambiar el acceso global.");
      const d = z
        .object({
          id: z.string(),
          status: z.enum(["pending", "active", "disabled"]),
          globalRole: z.enum(["user", "superuser"]),
        })
        .parse(data);
      const u = await userById(d.id);
      if (!u || u.id === actor.id || u.id === "demo")
        throw Error("No puedes modificar esta cuenta.");
      if (u.isInstructor && !actor.isInstructor)
        throw Error(
          "Solo un evaluador puede cambiar el acceso de otro evaluador.",
        );
      audit(
        project,
        actor.name,
        "Cambió el acceso global",
        u.name,
        { status: u.status, globalRole: u.globalRole },
        d,
      );
      await saveUser({ ...u, ...d });
      if (d.status !== "active")
        await sql.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
      await securityAudit(actor.id, "Cambió acceso global", {
        userId: u.id,
        before: { status: u.status, globalRole: u.globalRole },
        after: d,
      });
    } else throw Error("Acción no reconocida.");
    await saveProject(project);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => i.message).join(" ")
            : error instanceof Error
              ? error.message
              : "No se pudo completar la operación.",
      },
      { status: error instanceof RevisionConflict ? 409 : 400 },
    );
  }
}
