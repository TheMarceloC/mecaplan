import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser, sessionIdentity } from "@/server/auth";
import { finishDriveAuth } from "@/server/onedrive";
import { withStorageLock } from "@/server/storage-lock";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  return withStorageLock(async () => {
    let message = "OneDrive conectado.";
    try {
      const u = await requireActiveUser();
      if (!u || u.mustChangePassword || u.globalRole !== "superuser")
        throw Error(
          "Inicia sesión como administrador para completar la conexión.",
        );
      if (req.nextUrl.searchParams.has("error"))
        throw Error(
          "Microsoft no autorizó la conexión. Puedes volver a intentarlo o asociar enlaces existentes.",
        );
      const state = req.nextUrl.searchParams.get("state"),
        code = req.nextUrl.searchParams.get("code");
      if (!state || state.length > 200 || !code || code.length > 8000)
        throw Error("Respuesta de Microsoft no válida.");
      await finishDriveAuth(u.id, state, code, await sessionIdentity());
    } catch (e) {
      message =
        e instanceof Error ? e.message : "No se pudo conectar OneDrive.";
    }
    const url = new URL("/", req.url);
    url.searchParams.set("panel", "storage");
    url.searchParams.set("storageMessage", message.slice(0, 250));
    return NextResponse.redirect(url);
  });
}
