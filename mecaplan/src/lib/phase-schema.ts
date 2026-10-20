import { z } from "zod";
const id = z.string().min(1).max(120),
  text = z.string().max(6000),
  date = z.iso.date();
export const budgetItemSchema = z.object({
  id,
  importKey: z.string().max(120).optional(),
  teamId: id,
  activityId: z.string().default(""),
  category: z.string().min(1).max(100),
  name: z.string().min(2).max(180),
  quantity: z.number().int().min(1).max(100000),
  unitPriceCents: z.number().int().min(0).max(100000000),
  supplier: z.string().max(200).default(""),
  url: z
    .union([z.literal(""), z.url().refine((v) => /^https?:/.test(v))])
    .default(""),
  notes: text.default(""),
  isBom: z.boolean().default(false),
});
export const expenseSchema = z.object({
  id,
  importKey: z.string().max(120).optional(),
  teamId: id,
  budgetItemId: z.string().default(""),
  activityId: z.string().default(""),
  amountCents: z.number().int().positive().max(1000000000),
  date,
  paidBy: id,
  description: z.string().min(3).max(2000),
  receiptId: z.string().default(""),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  decidedBy: z.string().default(""),
});
export const riskSchema = z.object({
  id,
  importKey: z.string().max(120).optional(),
  code: z.string().max(30).optional(),
  description: z.string().min(3).max(2000),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  mitigation: text,
  ownerId: id,
  dueDate: z.union([z.literal(""), date]).optional(),
  nextAction: text.optional(),
  status: z.enum(["open", "mitigated", "closed"]),
});
export const recordSchema = z.object({
  id,
  importKey: z.string().max(120).optional(),
  kind: z.enum(["meeting", "weekly", "reception", "acceptance", "checklist"]),
  title: z.string().min(3).max(300),
  date,
  teamId: z.string().default(""),
  body: text.default(""),
  ownerId: id,
  createdBy: z.string().optional(),
  completed: z.boolean().default(false),
  items: z
    .array(
      z.object({ id, title: z.string().min(1).max(300), done: z.boolean() }),
    )
    .default([]),
  target: z.string().max(1000).default(""),
  measurement: z.string().max(1000).default(""),
  result: z.enum(["pending", "pass", "fail"]).default("pending"),
  evidence: z.string().max(2000).default(""),
  attendees: z.array(z.string()).default([]),
});
export const fileSchema = z.object({
  id,
  name: z.string().max(250),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  activityId: z.string().default(""),
  uploadedBy: id,
  date: z.string(),
  provider: z.enum(["local", "onedrive"]).optional(),
  url: z.string().max(4096).optional(),
  driveId: z.string().max(250).optional(),
  itemId: z.string().max(250).optional(),
});
export const changeSchema = z.object({
  id,
  type: z.enum(["scope", "dates", "duration", "budget", "status"]),
  activityId: z.string().default(""),
  targetType: z.enum(["project", "activity", "budgetItem"]).optional(),
  baseValue: z.union([z.string(), z.number()]).optional(),
  description: z.string().min(3).max(3000),
  reason: z.string().min(3).max(3000),
  impact: z.string().max(3000),
  value: z.union([z.string().max(4000), z.number().int()]),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  requestedBy: id,
  date: z.string(),
  decidedBy: z.string().default(""),
  decidedAt: z.string().default(""),
});
export const baselineSchema = z.object({
  id,
  date: z.string(),
  savedBy: id,
  items: z.array(
    z.object({
      id,
      start: date,
      end: date,
      duration: z.number(),
      status: z.string(),
    }),
  ),
});
export const evaluationSchema = z
  .object({
    id,
    projectId: id,
    authorId: id,
    title: z.string().min(3).max(250),
    targetType: z.enum(["project", "team", "person", "activity"]),
    targetId: z.string().default(""),
    date,
    criteria: z
      .array(
        z.object({
          name: z.string().min(1).max(300),
          score: z.number().min(0),
          max: z.number().positive().max(10000),
          comment: text.default(""),
        }),
      )
      .min(1)
      .max(40),
    notes: text.default(""),
    published: z.boolean().default(false),
  })
  .refine((e) => e.criteria.every((c) => c.score <= c.max), {
    message: "La nota de un criterio no puede superar su máximo.",
  });
export const controlSchema = z.object({
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("HNL"),
  workingDays: z.number().int().min(1).max(7).default(5),
  integrationLeadId: z.string().default(""),
  requireCrossReview: z.boolean().default(false),
  deliveryDate: z.union([z.literal(""), z.iso.date()]).default(""),
  budget: z.array(budgetItemSchema).default([]),
  expenses: z.array(expenseSchema).default([]),
  risks: z.array(riskSchema).default([]),
  records: z.array(recordSchema).default([]),
  files: z.array(fileSchema).default([]),
  changes: z.array(changeSchema).default([]),
  baselines: z.array(baselineSchema).default([]),
  milestones: z
    .array(
      z.object({
        id,
        title: z.string(),
        date: z.string(),
        points: z.number().nullable(),
        criteria: z.string(),
        approved: z.boolean(),
        approvedBy: z.string().optional(),
        approvedAt: z.string().optional(),
      }),
    )
    .default([]),
  matrixSheets: z
    .array(
      z.object({
        name: z.string(),
        rows: z.array(
          z.object({
            row: z.number(),
            values: z.array(
              z.union([z.string(), z.number(), z.boolean(), z.null()]),
            ),
          }),
        ),
      }),
    )
    .default([]),
  importNotes: z.array(z.string()).default([]),
  sourceFileId: z.string().default(""),
  clonedFromId: z.string().default(""),
  repositories: z
    .array(
      z.object({
        id,
        teamId: id,
        fullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
      }),
    )
    .default([]),
  commits: z
    .array(
      z.object({
        id,
        activityId: id,
        repositoryId: id,
        sha: z.string(),
        message: z.string(),
        author: z.string(),
        url: z.string(),
        date: z.string(),
      }),
    )
    .default([]),
  statusEvents: z
    .array(
      z.object({
        id,
        activityId: id,
        from: z.string(),
        to: z.string(),
        at: z.string(),
        date: date.optional(),
      }),
    )
    .optional(),
  interfaces: z
    .array(
      z.object({
        id,
        predecessorId: id,
        successorId: id,
        criteria: text.default(""),
        evidence: text.default(""),
        dueDate: z.union([z.literal(""), date]).default(""),
        acceptedBy: z.string().default(""),
        acceptedAt: z.string().default(""),
        sourceProof: z.string().max(70000).optional(),
      }),
    )
    .optional(),
  snapshots: z
    .array(z.object({ date, doneIds: z.array(z.string()) }))
    .default([]),
});
export type Control = z.infer<typeof controlSchema>;
export type Evaluation = z.infer<typeof evaluationSchema>;
