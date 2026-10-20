import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { oneDriveUrl } from "@/lib/onedrive-link";
import { uploadToDrive, markStorageLinked } from "@/server/onedrive";
import { requireActiveUser } from "@/server/auth";
import { projectAccess } from "@/server/project-access";
import { prepareProject } from "@/server/control-service";
import { audit, saveProject } from "@/server/repositories";
import { maxUpload, detectUpload } from "@/server/uploads";
import { withWriteLock } from "@/server/write-lock";
import { boundedForm, boundedRequest } from "@/server/request-body";
import { requestOrigin } from "@/server/request-origin";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    if (!requestOrigin(req))
      return NextResponse.json(
        { error: "Origen no permitido." },
        { status: 403 },
      );
    const actor = await requireActiveUser();
    if (req.headers.get("content-type")?.includes("application/json")) {
      const d = z
        .object({
          projectId: z.string(),
          name: z.string().min(2).max(200),
          url: z.string().max(4096),
          activityId: z.string().default(""),
        })
        .parse(
          JSON.parse(
            new TextDecoder().decode(await boundedRequest(req, 20000)),
          ),
        );
      return await withWriteLock(async () => {
        const { user, project } = await projectAccess(d.projectId);
        if (
          d.activityId &&
          !project.activities.some((a) => a.id === d.activityId && !a.deletedAt)
        )
          throw Error("Actividad no encontrada.");
        const record = {
          id: randomUUID(),
          name: d.name,
          mime: "application/octet-stream",
          size: 0,
          activityId: d.activityId,
          uploadedBy: user.id,
          date: new Date().toISOString(),
          provider: "onedrive" as const,
          url: oneDriveUrl(d.url),
        };
        prepareProject(project).files.push(record);
        audit(
          project,
          user.name,
          "Asoció un enlace de OneDrive",
          record.name,
          null,
          record,
        );
        await saveProject(project);
        return NextResponse.json({ ok: true, file: record });
      });
    }
    const form = await boundedForm(req, maxUpload() + 100000),
      file = form.get("file");
    if (!(file instanceof File) || !file.size)
      throw Error("Selecciona un archivo no vacío.");
    const projectId = String(form.get("projectId") || ""),
      activityId = String(form.get("activityId") || ""),
      id = z.uuid().parse(form.get("operationId") || randomUUID());
    const { project } = await projectAccess(projectId);
    if (
      activityId &&
      !project.activities.some((a) => a.id === activityId && !a.deletedAt)
    )
      throw Error("Actividad no encontrada.");
    const already = prepareProject(project).files.find((f) => f.id === id);
    if (already && already.uploadedBy === actor.id)
      return NextResponse.json({ ok: true, file: already });
    const bytes = new Uint8Array(await file.arrayBuffer()),
      mime = detectUpload(file.name, bytes),
      name = file.name.replace(/[\x00-\x1f<>:"/\\|?*]/g, "_").slice(0, 200);
    const remote = await uploadToDrive(projectId, name, bytes, {
      id,
      actorId: actor.id,
    });
    return await withWriteLock(async () => {
      const { user, project: fresh } = await projectAccess(projectId);
      if (user.id !== actor.id)
        throw Error("La sesión cambió durante la subida.");
      if (
        activityId &&
        !fresh.activities.some((a) => a.id === activityId && !a.deletedAt)
      )
        throw Error(
          "La actividad cambió durante la subida. El archivo permanece en OneDrive; vuelve a asociarlo.",
        );
      const c = prepareProject(fresh),
        existing = c.files.find((f) => f.id === id);
      if (existing) return NextResponse.json({ ok: true, file: existing });
      const record = {
        id,
        name,
        mime,
        size: file.size,
        activityId,
        uploadedBy: user.id,
        date: new Date().toISOString(),
        ...remote,
      };
      c.files.push(record);
      audit(fresh, user.name, "Adjuntó un archivo", record.name, null, record);
      await saveProject(fresh);
      await markStorageLinked(id);
      return NextResponse.json({ ok: true, file: record });
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "No se pudo subir el archivo.",
      },
      { status: 400 },
    );
  }
}
