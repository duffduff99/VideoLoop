import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { listSubfolders, normalizeRel } from "@/lib/feeds";

export const dynamic = "force-dynamic";

// List the subfolders of a folder below the media root, for the feed picker.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rel = normalizeRel(req.nextUrl.searchParams.get("path") || "");
  const folders = rel === null ? null : await listSubfolders(rel);
  if (rel === null || folders === null) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }
  return NextResponse.json({ path: rel, folders });
}
