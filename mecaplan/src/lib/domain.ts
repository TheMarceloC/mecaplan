import { z } from "zod";
import { controlSchema } from "./phase-schema";
z.config(z.locales.es());
export const states = [
  "Pendiente",
  "En progreso",
  "Bloqueada",
  "En revisión",
  "Hecha",
  "Cancelada",
] as const;
export const personSchema = z.object({
  id: z.string(),
  name: z.string().min(2).max(80),
  teamId: z.string(),
  role: z.enum(["admin", "member"]),
  lead: z.boolean(),
  capacityDays: z.number().min(0).max(7).optional(),
});
export const activitySchema = z
  .object({
    revision: z.number().int().nonnegative().optional(),
    id: z.string(),
    code: z.string(),
    effortDays: z.number().min(0).max(3650).optional(),
    title: z.string().min(3, "Escribe al menos 3 caracteres.").max(160),
    description: z.string().max(4000).default(""),
    teamId: z.string(),
    parentId: z.string().nullable().default(null),
    status: z.enum(states),
    priority: z.enum(["Alta", "Media", "Baja"]),
    start: z.iso.date(),
    end: z.iso.date(),
    duration: z.number().int().min(0).max(365),
    responsible: z.array(z.string()),
    accountable: z.string(),
    consulted: z.array(z.string()).default([]),
    informed: z.array(z.string()).default([]),
    blockedReason: z.string().max(1000).default(""),
    dependencies: z.array(z.string()).default([]),
    commits: z.number().int().min(0).default(0),
    deletedAt: z.string().nullable().default(null),
    dependencyLags: z
      .record(z.string(), z.number().int().min(-365).max(365))
      .optional(),
    actualStart: z.iso.date().nullable().optional(),
    actualEnd: z.iso.date().nullable().optional(),
    unscheduled: z.boolean().optional(),
    evidence: z.array(z.string().max(2000)).max(30).optional(),
    reviewerId: z.string().optional(),
    teamRaci: z
      .record(z.string(), z.enum(["R", "A", "C", "I", "AR", ""]))
      .optional(),
    sourceRow: z.number().int().optional(),
    aliases: z.array(z.string().max(50)).max(100).optional(),
    importKey: z.string().max(120).optional(),
  })
  .refine((a) => a.end >= a.start, {
    message: "La fecha final debe ser igual o posterior al inicio.",
    path: ["end"],
  })
  .refine(
    (a) => a.status !== "Bloqueada" || a.blockedReason.trim().length > 2,
    { message: "Explica por qué está bloqueada.", path: ["blockedReason"] },
  );
export const projectSchema = z.object({
  version: z.number().int().nonnegative().optional(),
  id: z.string(),
  name: z.string().min(3).max(100),
  description: z.string().max(2000),
  start: z.iso.date(),
  weeks: z.number().int().min(1).max(104),
  status: z.enum(["planning", "active", "closed", "archived"]),
  teams: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(2).max(80),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      codePrefix: z
        .string()
        .regex(/^[A-Z][A-Z0-9]{1,7}$/)
        .optional(),
    }),
  ),
  members: z.array(personSchema),
  activities: z.array(activitySchema),
  comments: z.array(
    z.object({
      id: z.string(),
      activityId: z.string(),
      author: z.string(),
      body: z.string().min(1).max(4000),
      date: z.string(),
    }),
  ),
  history: z.array(
    z.object({
      id: z.string(),
      actor: z.string(),
      action: z.string(),
      entity: z.string(),
      date: z.string(),
      before: z.string(),
      after: z.string(),
    }),
  ),
  control: controlSchema.optional(),
});
export type Project = z.infer<typeof projectSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type Person = z.infer<typeof personSchema>;
export type User = {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  isInstructor?: boolean;
  mustChangePassword?: boolean;
  globalRole: "superuser" | "user";
  status: "pending" | "active" | "disabled";
  passwordHash: string;
};
export type PublicUser = Omit<User, "passwordHash">;
export function raciValid(a: Activity) {
  return a.accountable.length > 0 && a.responsible.length > 0;
}
export function leafActivities(project: Pick<Project, "activities">) {
  return project.activities.filter(
    (a) =>
      !a.deletedAt &&
      a.status !== "Cancelada" &&
      !project.activities.some((b) => !b.deletedAt && b.parentId === a.id),
  );
}
export function progress(project: Pick<Project, "activities">) {
  const leaves = leafActivities(project);
  return leaves.length
    ? Math.round(
        (leaves.filter((a) => a.status === "Hecha").length / leaves.length) *
          100,
      )
    : 0;
}
export function taskProgress(a: Activity, p: Project): number {
  const children = p.activities.filter(
    (b) => b.parentId === a.id && !b.deletedAt && b.status !== "Cancelada",
  );
  return children.length
    ? Math.round(
        children.reduce((s, b) => s + taskProgress(b, p), 0) / children.length,
      )
    : a.status === "Hecha"
      ? 100
      : 0;
}
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Tegucigalpa" });
