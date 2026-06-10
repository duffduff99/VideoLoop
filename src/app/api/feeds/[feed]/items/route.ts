import { NextRequest, NextResponse } from "next/server";
import { listFeedItems, isFeedLocked } from "@/lib/feeds";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

// Deterministic in-place Fisher-Yates shuffle seeded by `seed` (mulberry32).
function seededShuffle<T>(arr: T[], seed: number): void {
  let s = seed >>> 0;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

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
  const seedParam = req.nextUrl.searchParams.get("seed");
  const all = await listFeedItems(feed);

  // Randomize playback order. The client passes a stable seed per cycle so
  // pagination stays consistent across pages within that cycle, and a fresh
  // seed each loop produces a new random order.
  if (seedParam !== null) {
    seededShuffle(all, parseInt(seedParam, 10) || 0);
  }

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
