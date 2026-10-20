import { transitionActivity } from "@/lib/activity-transitions";
import { assertActivityRevision } from "@/lib/revisions";
import { changeTarget } from "@/lib/change-target";
import { saveEvaluationVersion } from "./repositories/evaluations";
import { validateFinancialRelations } from "@/lib/control";
import { nextActivityCode } from "@/lib/codes";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  type Project,
  type PublicUser,
  activitySchema,
  projectSchema,
  today,
} from "@/lib/model";
import {
  controlSchema,
  budgetItemSchema,
  expenseSchema,
  riskSchema,
  recordSchema,
  changeSchema,
  evaluationSchema,
  baselineSchema,
} from "@/lib/phase-schema";
import {
  control,
  planning,
  reschedule,
  validateCompletion,
} from "@/lib/control";
import { can } from "./auth/permissions";
import { audit } from "./repositories";
import { sql } from "./repositories/database";
const idSchema = z.object({ id: z.string() });
export function prepareProject(p: Project) {
  p.control ??= controlSchema.parse({});
  return p.control;
}
export function snapshot(p: Project) {
  const c = prepareProject(p),
    entry = {
      date: today(),
      doneIds: p.activities
        .filter((a) => !a.deletedAt && a.status === "Hecha")
        .map((a) => a.id),
    };
  c.snapshots = c.snapshots.filter((s) => s.date !== entry.date);
  c.snapshots.push(entry);
  c.snapshots = c.snapshots.slice(-730);
}
export async function mutateControl(
  action: string,
  data: unknown,
  p: Project,
  user: PublicUser,
): Promise<{ handled: boolean; save?: boolean; result?: unknown }> {
  if (!user || user.status !== "active" || user.mustChangePassword)
    throw Error("Se requiere una cuenta activa.");
  const c = prepareProject(p);
  const require = (permission: Parameters<typeof can>[1]) => {
    if (!can(user, permission, p))
      throw Error("Tu rol no permite esta operación.");
  };
  const team = (teamId: string) => {
    if (!p.teams.some((t) => t.id === teamId))
      throw Error("Equipo no encontrado.");
  };
  const scoped = (teamId: string) => {
    team(teamId);
    require("budget:edit");
    if (
      !can(user, "project:edit", p) &&
      p.members.find((m) => m.id === user.id)?.teamId !== teamId
    )
      throw Error("Solo puedes editar las partidas de tu equipo.");
  };
  const log = (
    entity: string,
    before: unknown,
    after: unknown,
    label = action,
  ) => audit(p, user.name, label, entity, before, after);
  const person = (id: string) => {
    if (!p.members.some((m) => m.id === id))
      throw Error("La persona debe pertenecer al proyecto.");
  };
  if (action === "saveTeam") {
    require("members:edit");
    const d = z
      .object({
        team: projectSchema.shape.teams.element,
        memberIds: z.array(z.string()).max(300).default([]),
        leaderId: z.string().default(""),
      })
      .parse(data);
    if (!d.team.id) d.team.id = randomUUID();
    if (!d.team.codePrefix)
      throw Error("Define un prefijo para las actividades del equipo.");
    if (
      p.teams.some(
        (t) =>
          t.id !== d.team.id &&
          (t.codePrefix === d.team.codePrefix ||
            t.name.trim().toLocaleLowerCase() ===
              d.team.name.trim().toLocaleLowerCase()),
      )
    )
      throw Error("El nombre y el prefijo deben ser únicos en el proyecto.");
    for (const id of d.memberIds) person(id);
    if (d.leaderId) {
      person(d.leaderId);
      if (
        !d.memberIds.includes(d.leaderId) &&
        !p.members.some((m) => m.id === d.leaderId && m.teamId === d.team.id)
      )
        throw Error("El líder debe pertenecer al equipo.");
    }
    const old = p.teams.find((t) => t.id === d.team.id);
    p.teams = p.teams.filter((t) => t.id !== d.team.id);
    p.teams.push(d.team);
    for (const m of p.members) {
      if (d.memberIds.includes(m.id)) {
        if (m.teamId !== d.team.id) m.lead = false;
        m.teamId = d.team.id;
      }
      if (m.teamId === d.team.id) m.lead = m.id === d.leaderId;
    }
    log(
      d.team.name,
      old ?? null,
      { team: d.team, memberIds: d.memberIds, leaderId: d.leaderId },
      old ? "Actualizó un equipo" : "Creó un equipo",
    );
  } else if (action === "submitEvidence") {
    const d = z
        .object({
          id: z.string(),
          evidence: z.array(z.string().min(1).max(2000)).max(30),
          revision: z.number().int().nonnegative().optional(),
        })
        .parse(data),
      a = p.activities.find((a) => a.id === d.id && !a.deletedAt);
    if (!a || !can(user, "activity:status", p, a))
      throw Error(
        "Solo los responsables y líderes pueden registrar esta evidencia.",
      );
    assertActivityRevision(d, a);
    const old = { evidence: a.evidence, reviewerId: a.reviewerId };
    if (JSON.stringify(a.evidence ?? []) !== JSON.stringify(d.evidence)) {
      const next = transitionActivity(p, { ...a, evidence: d.evidence }, a);
      Object.assign(a, next);
    }
    log(
      a.title,
      old,
      { evidence: a.evidence, reviewerId: a.reviewerId },
      "Guardó evidencia",
    );
  } else if (action === "reviewActivity") {
    const { id, revision } = idSchema
        .extend({ revision: z.number().int().nonnegative().optional() })
        .parse(data),
      a = p.activities.find((a) => a.id === id && !a.deletedAt),
      member = p.members.find((m) => m.id === user.id);
    if (!a || !member || member.teamId === a.teamId)
      throw Error("La revisión debe confirmarla una persona de otro equipo.");
    assertActivityRevision({ revision }, a);
    if (!a.evidence?.length)
      throw Error("Primero registra la evidencia de la actividad.");
    const before = a.reviewerId ?? "";
    a.reviewerId = user.id;
    log(a.title, before, user.id, "Confirmó revisión cruzada");
  } else if (action === "previewPlan" || action === "savePlan") {
    const d = z
      .object({
        activities: z
          .array(
            z.object({
              id: z.string(),
              revision: z.number().int().nonnegative().optional(),
              duration: z.number().int().min(0).max(365),
              dependencies: z.array(z.string()),
              dependencyLags: z
                .record(z.string(), z.number().int().min(-365).max(365))
                .default({}),
            }),
          )
          .max(1000),
        applyDates: z.boolean().default(false),
      })
      .parse(data);
    const proposed = structuredClone(p),
      before = planning(p);
    const leaves = new Set(
      p.activities
        .filter(
          (a) =>
            !a.deletedAt &&
            !p.activities.some((b) => b.parentId === a.id && !b.deletedAt),
        )
        .map((a) => a.id),
    );
    for (const patch of d.activities) {
      const a = proposed.activities.find((a) => a.id === patch.id);
      if (!a || !leaves.has(a.id))
        throw Error("Planifica únicamente actividades hoja.");
      if (!can(user, "activity:edit", p, a))
        throw Error("No tienes permiso para planificar esta actividad.");
      if (patch.dependencies.some((id) => !leaves.has(id)))
        throw Error("Selecciona predecesoras válidas del mismo proyecto.");
      if (action === "savePlan") assertActivityRevision(patch, a);
      Object.assign(a, patch);
    }
    const after = planning(proposed);
    if (action === "previewPlan") {
      // Si quien planifica puede aplicar fechas, savePlan recalcula todas las
      // hojas: se informa antes qué actividades cambiarían (fechas o provisional).
      const rescheduled = structuredClone(proposed);
      if (can(user, "project:edit", p)) reschedule(rescheduled);
      const moved = rescheduled.activities
        .filter((a) => {
          const old = p.activities.find((b) => b.id === a.id);
          return (
            old &&
            !a.deletedAt &&
            (old.start !== a.start ||
              old.end !== a.end ||
              !!old.unscheduled !== !!a.unscheduled)
          );
        })
        .map((a) => a.code);
      return { handled: true, save: false, result: { before, after, moved } };
    }
    if (d.applyDates) {
      require("project:edit");
      reschedule(proposed);
    }
    log(
      "Cronograma",
      p.activities,
      proposed.activities,
      "Actualizó la planificación",
    );
    p.activities = proposed.activities;
  } else if (action === "saveBaseline") {
    require("project:edit");
    const b = baselineSchema.parse({
      id: randomUUID(),
      date: new Date().toISOString(),
      savedBy: user.id,
      items: p.activities
        .filter((a) => !a.deletedAt)
        .map((a) => ({
          id: a.id,
          start: a.start,
          end: a.end,
          duration: a.duration,
          status: a.status,
        })),
    });
    c.baselines.push(b);
    log("Línea base", null, b, "Guardó una línea base");
  } else if (action === "saveBudgetItem") {
    const b = budgetItemSchema.parse(data);
    scoped(b.teamId);
    if (
      b.activityId &&
      !p.activities.some((a) => a.id === b.activityId && !a.deletedAt)
    )
      throw Error("Actividad no encontrada.");
    const old = c.budget.find((x) => x.id === b.id);
    b.importKey = old?.importKey;
    if (old) scoped(old.teamId);
    c.budget = c.budget.filter((x) => x.id !== b.id);
    c.budget.push(b);
    log(b.name, old ?? null, b, "Editó una partida");
  } else if (action === "deleteBudgetItem") {
    const { id } = idSchema.parse(data),
      old = c.budget.find((x) => x.id === id);
    if (!old) throw Error("Partida no encontrada.");
    scoped(old.teamId);
    if (c.expenses.some((e) => e.budgetItemId === id))
      throw Error("Conserva las partidas que tienen gastos asociados.");
    c.budget = c.budget.filter((x) => x.id !== id);
    log(old.name, old, null, "Retiró una partida");
  } else if (action === "addExpense") {
    require("comment");
    const e = expenseSchema.parse(data);
    team(e.teamId);
    if (
      e.budgetItemId &&
      !c.budget.some((b) => b.id === e.budgetItemId && b.teamId === e.teamId)
    )
      throw Error("La partida debe pertenecer al equipo del gasto.");
    if (e.receiptId && !c.files.some((f) => f.id === e.receiptId))
      throw Error("Comprobante no encontrado.");
    e.id = randomUUID();
    e.status = "pending";
    e.paidBy = user.id;
    e.decidedBy = "";
    c.expenses.push(e);
    log(e.description, null, e, "Registró un gasto pendiente");
  } else if (action === "decideExpense") {
    require("approve");
    const d = z
        .object({ id: z.string(), status: z.enum(["approved", "rejected"]) })
        .parse(data),
      e = c.expenses.find((e) => e.id === d.id);
    if (!e || e.status !== "pending")
      throw Error("El gasto ya fue decidido o no existe.");
    // Separación de funciones: quien registra un gasto no puede aprobarlo.
    // Sí puede rechazarlo, por ejemplo para retirar un registro equivocado.
    if (d.status === "approved" && e.paidBy === user.id)
      throw Error(
        "No puedes aprobar un gasto que registraste. Pide a otra persona con permiso de aprobación que lo revise.",
      );
    const old = { ...e };
    e.status = d.status;
    e.decidedBy = user.id;
    log(
      e.description,
      old,
      e,
      d.status === "approved" ? "Aprobó un gasto" : "Rechazó un gasto",
    );
  } else if (action === "saveRisk") {
    require("comment");
    const risk = riskSchema.parse(data);
    person(risk.ownerId);
    const old = c.risks.find((r) => r.id === risk.id);
    risk.code = old?.code;
    risk.importKey = old?.importKey;
    if (old && old.ownerId !== user.id && !can(user, "project:edit", p))
      throw Error(
        "Solo el responsable o un administrador puede editar este riesgo.",
      );
    c.risks = c.risks.filter((r) => r.id !== risk.id);
    c.risks.push(risk);
    log(risk.description, old ?? null, risk, "Actualizó un riesgo");
  } else if (action === "saveRecord") {
    require("comment");
    const r = recordSchema.parse(data);
    person(r.ownerId);
    if (r.ownerId !== user.id && !can(user, "project:edit", p))
      throw Error(
        "Solo un administrador puede asignar registros a otra persona.",
      );
    if (r.teamId) team(r.teamId);
    const old = c.records.find((x) => x.id === r.id);
    r.importKey = old?.importKey;
    r.createdBy = old?.createdBy ?? user.id;
    if (old && old.ownerId !== user.id && !can(user, "project:edit", p))
      throw Error(
        "Solo el autor o un administrador puede editar este registro.",
      );
    if (
      r.kind === "acceptance" &&
      r.result === "pass" &&
      (!r.target.trim() || !r.measurement.trim() || !r.evidence.trim())
    )
      throw Error(
        "Una prueba que cumple debe tener valor objetivo, medición y evidencia.",
      );
    c.records = c.records.filter((x) => x.id !== r.id);
    c.records.push(r);
    log(r.title, old ?? null, r, "Actualizó la bitácora o revisión");
  } else if (action === "deleteRecord") {
    require("comment");
    const { id } = idSchema.parse(data),
      old = c.records.find((r) => r.id === id);
    if (!old) throw Error("Registro no encontrado.");
    if (old.ownerId !== user.id && !can(user, "project:edit", p))
      throw Error(
        "Solo el autor o un administrador puede eliminar este registro.",
      );
    c.records = c.records.filter((r) => r.id !== id);
    log(old.title, old, null, "Eliminó una bitácora o revisión");
  } else if (action === "removeFileLink") {
    require("comment");
    const { id } = idSchema.parse(data),
      old = c.files.find((f) => f.id === id);
    if (!old || old.provider !== "onedrive")
      throw Error("Selecciona un enlace de OneDrive.");
    if (old.uploadedBy !== user.id && !can(user, "project:edit", p))
      throw Error(
        "Solo quien asoció el documento o un administrador puede retirar su enlace.",
      );
    if (c.expenses.some((e) => e.receiptId === id))
      throw Error(
        "El documento es comprobante de un gasto y debe conservar su referencia.",
      );
    if (c.sourceFileId === id)
      throw Error("Conserva la referencia de la matriz original.");
    if (
      p.activities.some((a) =>
        a.evidence?.some((e) => e.includes("/api/files/" + id)),
      ) ||
      c.records.some((r) => r.evidence.includes("/api/files/" + id))
    )
      throw Error(
        "El documento se usa como evidencia. Actualiza esa evidencia antes de retirar el enlace.",
      );
    c.files = c.files.filter((f) => f.id !== id);
    log(
      old.name,
      old,
      null,
      "Retiró un enlace; documento conservado en OneDrive",
    );
  } else if (action === "recordToTask") {
    const d = z
        .object({
          id: z.string(),
          teamId: z.string(),
          title: z.string().min(3).max(160),
          responsibleId: z.string(),
        })
        .parse(data),
      record = c.records.find((r) => r.id === d.id);
    if (!record) throw Error("Registro no encontrado.");
    team(d.teamId);
    person(d.responsibleId);
    const a = activitySchema.parse({
      id: randomUUID(),
      code: nextActivityCode(p, d.teamId),
      title: d.title,
      description: record.body,
      teamId: d.teamId,
      status: "Pendiente",
      priority: "Media",
      start: today(),
      end: today(),
      duration: 1,
      responsible: [d.responsibleId],
      accountable: d.responsibleId,
      unscheduled: true,
    });
    if (!can(user, "activity:edit", p, a))
      throw Error("No puedes crear actividades para ese equipo.");
    p.activities.push(a);
    log(a.title, null, a, "Convirtió un acuerdo en actividad");
  } else if (action === "requestChange") {
    require("comment");
    const d = changeSchema.parse(data);
    const target = changeTarget(p, d);
    d.targetType = target.kind as "project" | "activity" | "budgetItem";
    d.baseValue = target.before;
    d.id = randomUUID();
    d.status = "pending";
    d.requestedBy = user.id;
    d.date = new Date().toISOString();
    d.decidedBy = "";
    d.decidedAt = "";
    c.changes.push(d);
    log(d.description, null, d, "Solicitó un cambio");
  } else if (action === "decideChange") {
    require("approve");
    const d = z
        .object({ id: z.string(), status: z.enum(["approved", "rejected"]) })
        .parse(data),
      change = c.changes.find((x) => x.id === d.id);
    if (!change || change.status !== "pending")
      throw Error("La solicitud ya fue decidida o no existe.");
    const previous = structuredClone(change);
    if (d.status === "approved") {
      const target = changeTarget(p, change);
      if (change.baseValue !== undefined && change.baseValue !== target.before)
        throw Error(
          "El destino cambió después de la solicitud. Recházala y crea una nueva con los datos actuales.",
        );
      if (target.kind === "project") {
        if (change.type === "duration") p.weeks = Number(target.value);
        else p.description = String(target.value);
      } else if (target.kind === "budgetItem")
        c.budget.find((b) => b.id === target.id)!.unitPriceCents = Number(
          target.value,
        );
      else {
        const a = p.activities.find((a) => a.id === target.id)!,
          old = structuredClone(a);
        if (change.type === "duration") a.duration = Number(target.value);
        else if (change.type === "dates") a.end = String(target.value);
        else if (change.type === "scope") a.description = String(target.value);
        else {
          a.status = activitySchema.shape.status.parse(target.value);
          if (a.status === "Bloqueada")
            a.blockedReason = change.reason.slice(0, 1000);
        }
        Object.assign(a, transitionActivity(p, a, old));
      }
      planning(p);
      log(
        target.label,
        target.before,
        target.value,
        "Aplicó el valor aprobado",
      );
    }
    change.status = d.status;
    change.decidedBy = user.id;
    change.decidedAt = new Date().toISOString();
    log(
      change.description,
      previous,
      change,
      d.status === "approved"
        ? "Aprobó y aplicó un cambio"
        : "Rechazó un cambio",
    );
  } else if (action === "saveControlSettings") {
    require("project:edit");
    const d = controlSchema
      .pick({
        currency: true,
        workingDays: true,
        integrationLeadId: true,
        requireCrossReview: true,
        deliveryDate: true,
      })
      .parse(data);
    if (d.integrationLeadId) person(d.integrationLeadId);
    log(
      "Configuración de control",
      {
        currency: c.currency,
        workingDays: c.workingDays,
        integrationLeadId: c.integrationLeadId,
        requireCrossReview: c.requireCrossReview,
        deliveryDate: c.deliveryDate,
      },
      d,
      "Actualizó configuración de control",
    );
    Object.assign(c, d);
  } else if (action === "saveMilestone") {
    require("project:edit");
    const d = z
      .object({
        id: z.string(),
        title: z.string().min(3).max(300),
        date: z.union([z.literal(""), z.iso.date()]),
        points: z.number().min(0).nullable(),
        criteria: z.string().max(3000),
        approved: z.boolean(),
      })
      .parse(data);
    const old = c.milestones.find((m) => m.id === d.id);
    const changed =
      !!old &&
      ["title", "date", "points", "criteria"].some(
        (key) => old[key as keyof typeof old] !== d[key as keyof typeof d],
      );
    if (!user.isInstructor) d.approved = !!old?.approved && !changed;
    const approvedBy = d.approved
        ? user.isInstructor
          ? user.id
          : old?.approvedBy
        : "",
      approvedAt = d.approved
        ? user.isInstructor
          ? new Date().toISOString()
          : old?.approvedAt
        : "";
    c.milestones = c.milestones.filter((m) => m.id !== d.id);
    c.milestones.push({ ...d, approvedBy, approvedAt });
    log(d.title, old ?? null, d, "Actualizó un hito");
  } else if (action === "saveRepository") {
    require("project:edit");
    const d = controlSchema.shape.repositories.unwrap().element.parse(data);
    team(d.teamId);
    const old = c.repositories.find((r) => r.id === d.id);
    c.repositories = c.repositories.filter((r) => r.id !== d.id);
    c.repositories.push(d);
    log(d.fullName, old ?? null, d, "Vinculó un repositorio");
  } else if (action === "saveEvaluation") {
    require("evaluate");
    const e = evaluationSchema.parse(data);
    if (e.projectId !== p.id)
      throw Error("La evaluación debe corresponder al proyecto actual.");
    if (e.targetType === "person") person(e.targetId);
    if (e.targetType === "team") team(e.targetId);
    if (
      e.targetType === "activity" &&
      !p.activities.some((a) => a.id === e.targetId)
    )
      throw Error("Actividad no encontrada.");
    e.authorId = user.id;
    await saveEvaluationVersion(e, user.id);
    return { handled: true, save: false, result: { evaluation: e } };
  } else if (action === "editExpense") {
    require("comment");
    const e = expenseSchema.parse(data),
      old = c.expenses.find((x) => x.id === e.id);
    if (!old || old.status !== "pending")
      throw Error("Solo se pueden corregir gastos pendientes.");
    if (old.paidBy !== user.id && !can(user, "approve", p))
      throw Error(
        "Solo el autor o un administrador puede corregir este gasto.",
      );
    e.paidBy = old.paidBy;
    e.status = "pending";
    e.decidedBy = "";
    e.importKey = old.importKey;
    c.expenses[c.expenses.indexOf(old)] = e;
    log(e.description, old, e, "Corrigió un gasto pendiente");
  } else if (action === "saveInterface") {
    require("comment");
    const d = z
        .object({
          predecessorId: z.string(),
          successorId: z.string(),
          criteria: z.string().max(6000),
          evidence: z.string().max(6000),
          dueDate: z.union([z.literal(""), z.iso.date()]),
          accept: z.boolean().default(false),
        })
        .parse(data),
      from = p.activities.find((a) => a.id === d.predecessorId && !a.deletedAt),
      to = p.activities.find((a) => a.id === d.successorId && !a.deletedAt);
    if (
      !from ||
      !to ||
      !to.dependencies.includes(from.id) ||
      from.teamId === to.teamId
    )
      throw Error("Selecciona una dependencia entre equipos.");
    const member = p.members.find((m) => m.id === user.id);
    if (
      !can(user, "project:edit", p) &&
      ![from.teamId, to.teamId].includes(member?.teamId ?? "")
    )
      throw Error("Esta interfaz pertenece a otros equipos.");
    c.interfaces ??= [];
    const old = c.interfaces.find(
      (x) => x.predecessorId === from.id && x.successorId === to.id,
    );
    if (d.accept && (!member || member.teamId !== to.teamId))
      throw Error("La recepción debe confirmarla el equipo que recibe.");
    if (
      d.accept &&
      (from.status !== "Hecha" || !d.evidence.trim() || !d.criteria.trim())
    )
      throw Error(
        "Completa el entregable, el criterio y la evidencia antes de aceptar.",
      );
    const proof = JSON.stringify([
      from.status,
      from.actualEnd ?? null,
      from.evidence ?? [],
    ]);
    const changed =
      !old ||
      old.sourceProof !== proof ||
      old.criteria !== d.criteria ||
      old.evidence !== d.evidence ||
      old.dueDate !== d.dueDate;
    const item = {
      id: old?.id ?? randomUUID(),
      predecessorId: from.id,
      successorId: to.id,
      criteria: d.criteria,
      evidence: d.evidence,
      dueDate: d.dueDate,
      acceptedBy: d.accept ? user.id : changed ? "" : (old?.acceptedBy ?? ""),
      acceptedAt: d.accept
        ? new Date().toISOString()
        : changed
          ? ""
          : (old?.acceptedAt ?? ""),
      sourceProof: proof,
    };
    c.interfaces = c.interfaces.filter((x) => x.id !== item.id);
    c.interfaces.push(item);
    log(
      from.code + " → " + to.code,
      old ?? null,
      item,
      d.accept
        ? "Confirmó recepción entre equipos"
        : "Actualizó interfaz entre equipos",
    );
  } else return { handled: false };
  validateFinancialRelations(p);
  snapshot(p);
  return { handled: true, save: true };
}
