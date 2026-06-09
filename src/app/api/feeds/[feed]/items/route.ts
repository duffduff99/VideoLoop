import { NextRequest, NextResponse } from "next/server";
import { listFeedItems, isFeedLocked } from "@/lib/feeds";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

export async function GET(
  req: NextRequest,
  { params }: { params: { feed: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const feed = decodeURIComponent(params.feed);

  // Enforce feed lock.
  if (isFeedLocked(feed) && !(session.unlocked || []).includes(feed)) {
    return NextResponse.json({ error: "Feed locked" }, { status: 403 });
  }

  const cursor = parseInt(req.nextUrl.searchParams.get("cursor") || "0", 10);
  const all = await listFeedItems(feed);
  const slice = all.slice(cursor, cursor + PAGE_SIZE);
  const nextCursor = cursor + PAGE_SIZE < all.length ? cursor + PAGE_SIZE : null;

  // Annotate with favorite state for this user.
  const favs = await prisma.favorite.findMany({
    where: {
      userId: session.uid,
      feed,
      path: { in: slice.map((i) => i.path) },
    },
    select: { path: true },
  });
  const favSet = new Set(favs.map((f) => f.path));

  return NextResponse.json({
    items: slice.map((i) => ({
      feed: i.feed,
      path: i.path,
      name: i.name,
      type: i.type,
      mime: i.mime,
      favorite: favSet.has(i.path),
      src: `/api/media/${encodeURIComponent(feed)}/${i.path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    })),
    nextCursor,
    total: all.length,
  });
}
