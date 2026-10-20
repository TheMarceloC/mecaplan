import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { projectAccess } from "@/server/project-access";
import { control, csv } from "@/lib/control";
import { agentContext } from "@/lib/agent-context";
import { can } from "@/server/auth/permissions";
import { filePath } from "@/server/uploads";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  try {
    const { user, project: p } = await projectAccess(
        req.nextUrl.searchParams.get("projectId") ?? "",
      ),
      format = req.nextUrl.searchParams.get("format") ?? "tasks",
      scope = req.nextUrl.searchParams.get("team") ?? "",
      c = control(p);
    let body = "",
      name = "",
      mime = "text/csv; charset=utf-8";
    if (format === "backup") {
      if (user.globalRole !== "superuser")
        throw Error(
          "Solo los administradores globales pueden exportar respaldos.",
        );
      const files = [];
      let total = 0;
      for (const f of c.files.filter((f) => f.provider !== "onedrive")) {
        const bytes = await fs.readFile(filePath(f.id));
        total += bytes.length;
        if (total > 20 * 1024 * 1024)
          throw Error(
            "El respaldo excede 20 MB de adjuntos. Usa también una copia local de data.",
          );
        files.push({ id: f.id, base64: bytes.toString("base64") });
      }
      body = JSON.stringify(
        { format: "mecaplan-project-v1", project: p, files },
        null,
        2,
      );
      name = "respaldo-" + p.id + ".json";
      mime = "application/json";
    } else if (format === "context-md" || format === "context-json") {
      if (!can(user, "context", p))
        throw Error("Solo los líderes pueden descargar contexto.");
      if (
        !can(user, "project:edit", p) &&
        scope !== p.members.find((m) => m.id === user.id)?.teamId
      )
        throw Error(
          "El líder de equipo solo puede descargar el contexto de su equipo.",
        );
      if (scope && !p.teams.some((t) => t.id === scope))
        throw Error("Equipo no encontrado.");
      const context = agentContext(p, scope);
      body =
        format === "context-md"
          ? context.markdown
          : JSON.stringify(context.data, null, 2);
      name =
        "contexto-" +
        p.id +
        (scope ? "-" + scope : "") +
        (format === "context-md" ? ".md" : ".json");
      mime =
        format === "context-md"
          ? "text/markdown; charset=utf-8"
          : "application/json";
    } else if (format === "budget" || format === "bom") {
      body = csv([
        [
          "Partida",
          "Equipo",
          "Categoría",
          "Cantidad",
          "Precio unitario (centavos)",
          "Total (centavos)",
          "Moneda",
          "Proveedor",
          "Enlace",
        ],
        ...c.budget
          .filter(
            (b) =>
              (!scope || b.teamId === scope) && (format !== "bom" || b.isBom),
          )
          .map((b) => [
            b.name,
            p.teams.find((t) => t.id === b.teamId)?.name ?? b.teamId,
            b.category,
            b.quantity,
            b.unitPriceCents,
            b.quantity * b.unitPriceCents,
            c.currency,
            b.supplier,
            b.url,
          ]),
      ]);
      name = (format === "bom" ? "bom-" : "presupuesto-") + p.id + ".csv";
    } else if (format === "tasks") {
      body = csv([
        [
          "Código",
          "Actividad",
          "Equipo",
          "Estado",
          "Prioridad",
          "Inicio",
          "Fin",
          "Días hábiles",
          "R",
          "A",
          "Evidencias",
        ],
        ...p.activities
          .filter((a) => !a.deletedAt && (!scope || a.teamId === scope))
          .map((a) => [
            a.code,
            a.title,
            p.teams.find((t) => t.id === a.teamId)?.name ?? a.teamId,
            a.status,
            a.priority,
            a.unscheduled ? "Sin planificar" : a.start,
            a.unscheduled ? "Sin planificar" : a.end,
            a.duration,
            a.responsible
              .map((id) => p.members.find((m) => m.id === id)?.name ?? "")
              .join("; "),
            p.members.find((m) => m.id === a.accountable)?.name ?? "",
            (a.evidence ?? []).join("; "),
          ]),
      ]);
      name = "actividades-" + p.id + ".csv";
    } else throw Error("Formato de exportación no disponible.");
    return new Response(body, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo exportar." },
      { status: 403 },
    );
  }
}
