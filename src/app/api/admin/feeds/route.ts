import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getFeedDefs, invalidateFeeds, listSubfolders, normalizeRel } from "@/lib/feeds";

export const dynamic = "force-dynamic";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Feed names end up in URLs and are matched exactly, so keep them simple.
function cleanName(raw: unknown): string | null {
  const name = (raw ?? "").toString().replace(/\s+/g, " ").trim();
  if (!name || name.length > 60 || /[\/\\]/.test(name)) return null;
  return name;
}

export async function GET() {
  if (!(await requireAdmin())) return forbidden();
  const defs = await getFeedDefs();
  // Flag feeds whose folder is currently missing (renamed/unmounted share).
  const feeds = await Promise.all(
    defs.map(async (d) => ({
      id: d.id,
      name: d.name,
      path: d.rel,
      private: d.private,
      missing: (await listSubfolders(d.rel)) === null,
    }))
  );
  return NextResponse.json({ feeds });
}

// Add a feed: { path, name?, private? }. The name defaults to the folder name.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return forbidden();
  const body = await req.json().catch(() => null);
  const rel = normalizeRel((body?.path ?? "").toString());
  if (!rel) return bad("Pick a folder");
  if ((await listSubfolders(rel)) === null) return bad("That folder doesn't exist", 404);
  const existing = await prisma.feed.findFirst({ where: { path: rel } });
  if (existing) return bad(`That folder is already the feed "${existing.name}"`, 409);
  const name = cleanName(body?.name || rel.split("/").pop());
  if (!name) return bad("Enter a name (up to 60 characters, no slashes)");
  if (await prisma.feed.findUnique({ where: { name } })) {
    return bad(`A feed called "${name}" already exists`, 409);
  }
  const feed = await prisma.feed.create({
    data: { name, path: rel, isPrivate: Boolean(body?.private) },
  });
  invalidateFeeds();
  return NextResponse.json({ feed: { id: feed.id, name, path: rel, private: feed.isPrivate } });
}

// Update a feed: { id, name?, private? }. Renaming keeps everyone's favorites.
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return forbidden();
  const body = await req.json().catch(() => null);
  const feed = await prisma.feed.findUnique({ where: { id: (body?.id ?? "").toString() } });
  if (!feed) return bad("Feed not found", 404);

  const data: { name?: string; isPrivate?: boolean } = {};
  if (typeof body?.private === "boolean") data.isPrivate = body.private;
  if (body?.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return bad("Enter a name (up to 60 characters, no slashes)");
    if (name !== feed.name) {
      if (await prisma.feed.findUnique({ where: { name } })) {
        return bad(`A feed called "${name}" already exists`, 409);
      }
      data.name = name;
    }
  }

  await prisma.$transaction([
    prisma.feed.update({ where: { id: feed.id }, data }),
    ...(data.name
      ? [prisma.favorite.updateMany({ where: { feed: feed.name }, data: { feed: data.name } })]
      : []),
  ]);
  invalidateFeeds();
  return NextResponse.json({ ok: true });
}

// Remove a feed from the app (files on the share are never touched).
// Favorites from it are kept and reappear if the feed is added back under
// the same name.
export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return forbidden();
  const id = req.nextUrl.searchParams.get("id") || "";
  await prisma.feed.deleteMany({ where: { id } });
  invalidateFeeds();
  return NextResponse.json({ ok: true });
}
