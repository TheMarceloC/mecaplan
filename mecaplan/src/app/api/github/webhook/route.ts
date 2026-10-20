import { boundedRequest } from "@/server/request-body";
import { transitionActivity } from "@/lib/activity-transitions";
import { matchesActivityCode } from "@/lib/codes";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { parseCommit, verifySignature } from "@/lib/commits";
import {
  allProjects,
  allUsers,
  saveProject,
  audit,
} from "@/server/repositories";
import { prepareProject, snapshot } from "@/server/control-service";
import { withWriteLock } from "@/server/write-lock";
import { today } from "@/lib/model";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  return withWriteLock(async () => {
    try {
      const secret = process.env.GITHUB_WEBHOOK_SECRET;
      if (
        process.env.ENABLE_LOCAL_WEBHOOK !== "1" ||
        !secret ||
        secret.length < 16
      )
        return NextResponse.json(
          {
            error:
              "El webhook local no está habilitado o falta un secreto de al menos 16 caracteres.",
          },
          { status: 503 },
        );
      if (Number(req.headers.get("content-length") || 0) > 1000000)
        throw Error("Evento demasiado grande.");
      const body = new TextDecoder().decode(await boundedRequest(req, 1000000));
      if (body.length > 1000000) throw Error("Evento demasiado grande.");
      if (
        !verifySignature(body, req.headers.get("x-hub-signature-256"), secret)
      )
        return NextResponse.json(
          { error: "Firma no válida." },
          { status: 401 },
        );
      const kind = req.headers.get("x-github-event");
      if (!["push", "pull_request"].includes(kind ?? ""))
        return NextResponse.json({ ok: true, ignored: true }, { status: 202 });
      const raw = JSON.parse(body);
      const repo = z
        .object({ full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/) })
        .parse(raw.repository);
      const eventSchema = z.object({
        id: z.string().regex(/^[a-f0-9]{7,64}$/i),
        message: z.string().max(4000),
        timestamp: z.string(),
        url: z.url().refine((v) => v.startsWith("https://github.com/")),
        author: z.object({
          name: z.string().max(200),
          email: z.string().max(250).optional(),
        }),
      });
      const commits =
        kind === "push"
          ? z.array(eventSchema).max(200).parse(raw.commits)
          : [
              eventSchema.parse({
                id: raw.pull_request?.head?.sha,
                message: String(raw.pull_request?.title ?? "") + " #review",
                timestamp: raw.pull_request?.updated_at,
                url: raw.pull_request?.html_url,
                author: {
                  name: raw.pull_request?.user?.login ?? "Autor de PR",
                },
              }),
            ];
      let linked = 0;
      const users = await allUsers();
      for (const p of await allProjects()) {
        const c = prepareProject(p),
          repository = c.repositories.find(
            (r) => r.fullName === repo.full_name,
          );
        if (!repository) continue;
        for (const k of commits) {
          const parsed = parseCommit(k.message);
          for (const code of parsed.codes) {
            const a = p.activities.find(
              (a) => matchesActivityCode(a, code) && !a.deletedAt,
            );
            if (
              !a ||
              c.commits.some((x) => x.sha === k.id && x.activityId === a.id)
            )
              continue;
            c.commits.push({
              id: randomUUID(),
              activityId: a.id,
              repositoryId: repository.id,
              sha: k.id,
              message: k.message,
              author: k.author.name,
              url: k.url,
              date: k.timestamp,
            });
            a.commits++;
            linked++;
            const author = users.find(
              (u) => u.email === k.author.email?.toLowerCase(),
            );
            if (parsed.automatic && a.status === "Pendiente") {
              Object.assign(
                a,
                transitionActivity(p, { ...a, status: "En progreso" }, a),
              );
            } else if (!parsed.automatic)
              c.changes.push({
                id: randomUUID(),
                type: "status",
                activityId: a.id,
                description: `${a.code}: sugerencia de ${parsed.suggestedStatus}`,
                reason: "Commit firmado recibido por el webhook local.",
                impact: k.message,
                value: parsed.suggestedStatus,
                status: "pending",
                requestedBy:
                  author?.id ||
                  c.integrationLeadId ||
                  p.members[0]?.id ||
                  "webhook",
                date: new Date().toISOString(),
                decidedBy: "",
                decidedAt: "",
              });
            audit(p, k.author.name, "Vinculó un commit", a.title, null, {
              sha: k.id,
              statusSuggestion: parsed.suggestedStatus,
            });
          }
        }
        snapshot(p);
        await saveProject(p);
      }
      return NextResponse.json({ ok: true, linked });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Evento no válido." },
        { status: 400 },
      );
    }
  });
}
