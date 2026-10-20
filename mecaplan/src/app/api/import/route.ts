import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { projectAccess } from "@/server/project-access";
import { withWriteLock } from "@/server/write-lock";
import { previewExcel, projectHash, importAccess } from "@/server/excel-import";
import { sql } from "@/server/repositories/database";
import { audit, saveProject } from "@/server/repositories";
import { snapshot } from "@/server/control-service";
import { projectSchema } from "@/lib/model";
import { type ImportChange } from "@/lib/import-format";
import { requireActiveUser } from "@/server/auth";
import { boundedForm, boundedRequest } from "@/server/request-body";
import { requestOrigin } from "@/server/request-origin";
import { importUploadBytes } from "@/server/upload-limits";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  return withWriteLock(async () => {
    try {
      if (!requestOrigin(req))
        return NextResponse.json(
          { error: "Origen no permitido." },
          { status: 403 },
        );
      await requireActiveUser();
      if (
        Number(req.headers.get("content-length") || 0) >
        importUploadBytes() + 100000
      )
        throw Error(
          `El archivo supera ${importUploadBytes() / 1024 / 1024} MB.`,
        );
      if (req.headers.get("content-type")?.includes("application/json")) {
        const d = z
            .object({
              projectId: z.string(),
              token: z.string().length(64),
              confirm: z.literal(true),
            })
            .parse(
              JSON.parse(
                new TextDecoder().decode(await boundedRequest(req, 20000)),
              ),
            ),
          { user, project } = await projectAccess(d.projectId),
          id = createHash("sha256").update(d.token).digest("hex");
        const entry = (await sql
          .prepare("SELECT * FROM import_previews WHERE id=?")
          .get(id)) as
          | {
              project_id: string;
              user_id: string;
              expires_at: number;
              base_hash: string;
              payload: string;
            }
          | undefined;
        if (
          !entry ||
          entry.project_id !== project.id ||
          entry.user_id !== user.id ||
          entry.expires_at < Date.now()
        )
          throw Error("La vista previa caducó. Vuelve a cargar el Excel.");
        if (projectHash(project) !== entry.base_hash)
          throw Error(
            "El proyecto cambió después de la vista previa. Vuelve a cargar el Excel para no sobrescribir cambios.",
          );
        const preview = JSON.parse(entry.payload);
        if (preview.access !== importAccess(project, user))
          throw Error("Tus permisos cambiaron. Genera una nueva vista previa.");
        const p = projectSchema.parse(preview.project);
        const changed = (preview.changes as ImportChange[]).filter(
          (c) => !c.unchanged,
        );
        if (!changed.length) {
          await sql.prepare("DELETE FROM import_previews WHERE id=?").run(id);
          return NextResponse.json({
            ok: true,
            imported: 0,
            unchanged: preview.changes.length,
          });
        }
        for (const change of changed)
          audit(
            p,
            user.name,
            "Importó " + change.kind,
            change.label,
            change.before,
            change.after,
          );
        audit(
          p,
          user.name,
          "Importó tablas desde Excel",
          "Importación Excel",
          null,
          {
            file: preview.fileName,
            rows: preview.changes.length,
            kinds: [
              ...new Set(preview.changes.map((c: { kind: string }) => c.kind)),
            ],
          },
        );
        snapshot(p);
        await saveProject(p);
        await sql
          .prepare("DELETE FROM import_previews WHERE project_id=?")
          .run(p.id);
        return NextResponse.json({
          ok: true,
          imported: preview.changes.length,
        });
      }
      const form = await boundedForm(req, importUploadBytes() + 100000),
        file = form.get("file");
      if (
        !(file instanceof File) ||
        !file.name.toLowerCase().endsWith(".xlsx") ||
        file.size > importUploadBytes()
      )
        throw Error(
          `Selecciona un archivo XLSX de hasta ${importUploadBytes() / 1024 / 1024} MB.`,
        );
      const { user, project } = await projectAccess(
          String(form.get("projectId") ?? ""),
        ),
        mode = z.enum(["new", "upsert"]).parse(form.get("mode") ?? "upsert"),
        bytes = Buffer.from(await file.arrayBuffer()),
        result = await previewExcel(bytes, project, user, mode);
      let token: string | undefined;
      await sql
        .prepare("DELETE FROM import_previews WHERE expires_at<?")
        .run(Date.now());
      if (!result.errors.length) {
        token = randomBytes(32).toString("hex");
        await sql
          .prepare("INSERT INTO import_previews VALUES(?,?,?,?,?,?,?)")
          .run(
            createHash("sha256").update(token).digest("hex"),
            project.id,
            user.id,
            Date.now() + 900000,
            projectHash(project),
            createHash("sha256").update(bytes).digest("hex"),
            JSON.stringify({
              project: result.project,
              changes: result.changes,
              fileName: file.name.slice(0, 200),
              access: importAccess(project, user),
            }),
          );
      }
      return NextResponse.json({
        token,
        errors: result.errors,
        warnings: result.warnings,
        changes: result.changes,
        summary: {
          new: result.changes.filter((c) => c.mode === "new").length,
          updated: result.changes.filter(
            (c) => c.mode === "update" && !c.unchanged,
          ).length,
          unchanged: result.changes.filter((c) => c.unchanged).length,
        },
      });
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof Error ? e.message : "No se pudo importar el archivo.",
        },
        { status: 400 },
      );
    }
  });
}
