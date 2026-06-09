import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { mimeFor, mediaType } from "@/lib/feeds";
import path from "path";

export const dynamic = "force-dynamic";

// List the current user's favorites as playable media items.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const favs = await prisma.favorite.findMany({
    where: { userId: session.uid },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    items: favs.map((f) => {
      const ext = path.extname(f.path);
      return {
        feed: f.feed,
        path: f.path,
        name: path.basename(f.path),
        type: mediaType(ext) || "image",
        mime: mimeFor(ext),
        favorite: true,
        src: `/api/media/${encodeURIComponent(f.feed)}/${f.path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
      };
    }),
  });
}

// Toggle a favorite.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const feed = body?.feed?.toString();
  const itemPath = body?.path?.toString();
  if (!feed || !itemPath) {
    return NextResponse.json({ error: "Missing feed or path" }, { status: 400 });
  }

  const existing = await prisma.favorite.findUnique({
    where: {
      userId_feed_path: { userId: session.uid, feed, path: itemPath },
    },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return NextResponse.json({ favorite: false });
  }

  await prisma.favorite.create({
    data: { userId: session.uid, feed, path: itemPath },
  });
  return NextResponse.json({ favorite: true });
}
