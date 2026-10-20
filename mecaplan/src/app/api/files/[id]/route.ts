import { oneDriveUrl } from "@/lib/onedrive-link";
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { currentUser } from "@/server/auth";
import { allProjects } from "@/server/repositories";
import { can } from "@/server/auth/permissions";
import { control } from "@/lib/control";
import { filePath } from "@/server/uploads";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params,
      user = await currentUser();
    if (!user || user.mustChangePassword)
      return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
    const p = (await allProjects()).find(
        (p) =>
          can(user, "read", p) && control(p).files.some((f) => f.id === id),
      ),
      f = p && control(p).files.find((f) => f.id === id);
    if (!f)
      return NextResponse.json(
        { error: "Archivo no encontrado." },
        { status: 404 },
      );
    if (f.provider === "onedrive")
      return NextResponse.redirect(oneDriveUrl(f.url ?? ""), {
        status: 302,
        headers: { "Cache-Control": "private, no-store" },
      });
    const bytes = await fs.readFile(filePath(id));
    return new Response(bytes, {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el archivo." },
      { status: 404 },
    );
  }
}
