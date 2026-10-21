import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { oneDriveUrl } from "@/lib/onedrive-link";
import { requireActiveUser } from "@/server/auth";
import { projectAccess } from "@/server/project-access";
import { prepareProject } from "@/server/control-service";
import { audit, saveProject } from "@/server/repositories";
import { withWriteLock } from "@/server/write-lock";
import { boundedRequest } from "@/server/request-body";
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
    // Documents stay in OneDrive. Multipart remains available only in /api/import for tabular data.
    if (!req.headers.get("content-type")?.includes("application/json"))
      return NextResponse.json(
        {
          error:
            "Solo se admiten enlaces de OneDrive o SharePoint. Guarda el documento en OneDrive y asocia su enlace.",
        },
        { status: 415 },
      );
    const d = z
      .object({
        projectId: z.string(),
        name: z.string().trim().min(2).max(200),
        url: z.string().max(4096),
        activityId: z.string().default(""),
      })
      .parse(
        JSON.parse(new TextDecoder().decode(await boundedRequest(req, 20000))),
      );
    const url = oneDriveUrl(d.url);
    return await withWriteLock(async () => {
      const { user, project } = await projectAccess(d.projectId);
      if (user.id !== actor.id)
        throw Error("La sesión cambió. Vuelve a intentarlo.");
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
        url,
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
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "No se pudo guardar el enlace.",
      },
      { status: 400 },
    );
  }
}
