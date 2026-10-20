import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/server/auth";
import { projectAccess } from "@/server/project-access";
import { can } from "@/server/auth/permissions";
import { sql } from "@/server/repositories/database";
import { evaluationSchema } from "@/lib/phase-schema";
export const runtime = "nodejs";
async function archivedVersions(projectId: string, evaluationId: string) {
  const rows = (await sql
    .prepare(
      "SELECT id,actor_id,date,payload FROM evaluation_versions WHERE project_id=? AND evaluation_id=? ORDER BY rowid DESC",
    )
    .all(projectId, evaluationId)) as {
    id: string;
    actor_id: string;
    date: string;
    payload: string;
  }[];
  return rows.map((v) => ({
    id: v.id,
    actorId: v.actor_id,
    date: v.date,
    evaluation: evaluationSchema.parse(JSON.parse(v.payload)),
  }));
}
export async function GET(req: NextRequest) {
  try {
    const user = await requireActiveUser();
    if (!can(user, "evaluate"))
      return NextResponse.json(
        { error: "Este apartado es exclusivo del ingeniero evaluador." },
        { status: 403 },
      );
    if (req.nextUrl.searchParams.get("archive") === "1") {
      const historyId = req.nextUrl.searchParams.get("history");
      const projectId = req.nextUrl.searchParams.get("projectId");
      let history: Awaited<ReturnType<typeof archivedVersions>> = [];
      if (historyId) {
        const retained =
          projectId &&
          (await sql
            .prepare("SELECT 1 FROM retained_projects WHERE id=?")
            .get(projectId));
        const evaluation =
          projectId &&
          (await sql
            .prepare("SELECT 1 FROM evaluations WHERE project_id=? AND id=?")
            .get(projectId, historyId));
        if (!retained || !evaluation)
          return NextResponse.json(
            { error: "Evaluación archivada no encontrada." },
            { status: 404 },
          );
        history = await archivedVersions(projectId!, historyId);
      }
      const projects = await sql
        .prepare("SELECT * FROM retained_projects ORDER BY deleted_at DESC")
        .all();
      const rows = (await sql
        .prepare(
          "SELECT e.payload FROM evaluations e INNER JOIN retained_projects p ON e.project_id=p.id",
        )
        .all()) as { payload: string }[];
      return NextResponse.json(
        {
          projects,
          versions: history,
          evaluations: rows.map((r) =>
            evaluationSchema.parse(JSON.parse(r.payload)),
          ),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const { project } = await projectAccess(
      req.nextUrl.searchParams.get("projectId") ?? "",
    );
    const rows = (await sql
      .prepare("SELECT payload FROM evaluations WHERE project_id=?")
      .all(project.id)) as { payload: string }[];
    const historyId = req.nextUrl.searchParams.get("history");
    const versions = historyId
      ? ((await sql
          .prepare(
            "SELECT id,actor_id,date,payload FROM evaluation_versions WHERE project_id=? AND evaluation_id=? ORDER BY rowid DESC",
          )
          .all(project.id, historyId)) as {
          id: string;
          actor_id: string;
          date: string;
          payload: string;
        }[])
      : [];
    return NextResponse.json(
      {
        evaluations: rows.map((r) =>
          evaluationSchema.parse(JSON.parse(r.payload)),
        ),
        versions: versions.map((v) => ({
          id: v.id,
          actorId: v.actor_id,
          date: v.date,
          evaluation: evaluationSchema.parse(JSON.parse(v.payload)),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo cargar." },
      { status: 403 },
    );
  }
}
