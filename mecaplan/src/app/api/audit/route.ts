import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/auth";
import { can } from "@/server/auth/permissions";
import { sql } from "@/server/repositories/database";
export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await requireActiveUser();
    if (!can(user, "global:edit"))
      throw Error(
        "Solo un administrador global puede consultar este historial.",
      );
    const rows = (await sql
      .prepare(
        "SELECT id,actor_id,action,date,payload FROM global_audit ORDER BY date DESC LIMIT 200",
      )
      .all()) as {
      id: string;
      actor_id: string;
      action: string;
      date: string;
      payload: string;
    }[];
    return NextResponse.json(
      {
        entries: rows.map((r) => ({
          id: r.id,
          actorId: r.actor_id,
          action: r.action,
          date: r.date,
          detail: JSON.parse(r.payload),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo consultar." },
      { status: 403 },
    );
  }
}
