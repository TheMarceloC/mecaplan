import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveUser, sessionIdentity } from "@/server/auth";
import {
  storageStatus,
  beginDriveAuth,
  disconnectDrive,
  uploadToDrive,
  markStorageLinked,
} from "@/server/onedrive";
import { withWriteLock } from "@/server/write-lock";
import { withStorageLock } from "@/server/storage-lock";
import { projectAccess } from "@/server/project-access";
import { control } from "@/lib/control";
import { filePath } from "@/server/uploads";
import { saveProject, audit } from "@/server/repositories";
import { readFile, unlink } from "node:fs/promises";
import { requestOrigin } from "@/server/request-origin";
import { boundedRequest } from "@/server/request-body";
import { securityAudit } from "@/server/security-audit";
import { can } from "@/server/auth/permissions";
export const runtime = "nodejs";
export async function GET() {
  try {
    await requireActiveUser();
    return NextResponse.json(await storageStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Inicia sesión con una cuenta activa." },
      { status: 401 },
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    const origin = requestOrigin(req);
    if (!origin)
      return NextResponse.json(
        { error: "Origen no permitido." },
        { status: 403 },
      );
    const u = await requireActiveUser();
    if (!can(u, "global:edit"))
      return NextResponse.json(
        { error: "Solo los superusuarios pueden configurar OneDrive." },
        { status: 403 },
      );
    const d = z
      .object({
        action: z.enum(["connect", "disconnect", "migrate"]),
        projectId: z.string().optional(),
        fileId: z.string().optional(),
      })
      .parse(
        JSON.parse(new TextDecoder().decode(await boundedRequest(req, 20000))),
      );
    if (d.action === "connect") {
      const session = await sessionIdentity();
      await securityAudit(u.id, "Inició conexión OneDrive", {});
      return NextResponse.json({
        url: await withStorageLock(() => beginDriveAuth(u.id, origin, session)),
      });
    }
    if (d.action === "disconnect") {
      await withStorageLock(async () => {
        await disconnectDrive();
        await securityAudit(u.id, "Desconectó OneDrive", {});
      });
      return NextResponse.json({ ok: true });
    }
    const { project: p } = await projectAccess(d.projectId ?? ""),
      f = control(p).files.find((f) => f.id === d.fileId);
    if (!f || f.provider === "onedrive")
      throw Error("Selecciona un archivo local pendiente de migrar.");
    const bytes = await readFile(filePath(f.id)),
      operationId = "migrate_" + f.id,
      remote = await uploadToDrive(p.id, f.name, bytes, {
        id: operationId,
        actorId: u.id,
      });
    await withWriteLock(async () => {
      const { user, project: fresh } = await projectAccess(p.id);
      if (user.id !== u.id || !can(user, "global:edit"))
        throw Error("Los permisos cambiaron durante la migración.");
      const file = control(fresh).files.find((x) => x.id === f.id);
      if (!file)
        throw Error(
          "La referencia cambió. El archivo se conserva en OneDrive.",
        );
      Object.assign(file, remote);
      audit(fresh, user.name, "Migró un archivo a OneDrive", file.name, null, {
        provider: "onedrive",
      });
      await saveProject(fresh);
      await markStorageLinked(operationId);
    });
    await unlink(filePath(f.id)).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "No se pudo conectar OneDrive.",
      },
      { status: 400 },
    );
  }
}
