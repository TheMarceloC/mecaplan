import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/server/auth";
import { disconnectDrive } from "@/server/onedrive";
import { withStorageLock } from "@/server/storage-lock";
import { requestOrigin } from "@/server/request-origin";
import { boundedRequest } from "@/server/request-body";
import { securityAudit } from "@/server/security-audit";
import { can } from "@/server/auth/permissions";
export const runtime = "nodejs";
export async function GET() {
  try {
    await requireActiveUser();
    return NextResponse.json(
      {
        mode: "links",
        configured: false,
        connected: false,
        account: "",
        redirectUri: "",
        missing: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Inicia sesión con una cuenta activa." },
      { status: 401 },
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    if (!requestOrigin(req))
      return NextResponse.json(
        { error: "Origen no permitido." },
        { status: 403 },
      );
    const user = await requireActiveUser();
    if (!can(user, "global:edit"))
      return NextResponse.json(
        { error: "Solo los superusuarios pueden configurar OneDrive." },
        { status: 403 },
      );
    const data = JSON.parse(
      new TextDecoder().decode(await boundedRequest(req, 20000)),
    );
    // Disconnect is retained so an administrator can revoke any legacy connection.
    if (data.action !== "disconnect")
      return NextResponse.json(
        {
          error:
            "MecaPlan utiliza solo enlaces. Guarda el documento en OneDrive y asocia su vínculo al proyecto.",
        },
        { status: 409 },
      );
    await withStorageLock(async () => {
      await disconnectDrive();
      await securityAudit(user.id, "Desconectó OneDrive", {});
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo completar." },
      { status: 400 },
    );
  }
}
