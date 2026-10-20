import { NextResponse } from "next/server";
import { importUploadBytes } from "@/server/upload-limits";
import { maxUpload } from "@/server/uploads";
export const runtime = "nodejs";
export function GET() {
  return NextResponse.json(
    { importBytes: importUploadBytes(), documentBytes: maxUpload() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
