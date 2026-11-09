import { NextRequest, NextResponse } from "next/server";
import { canViewFeed, listFeedItems } from "@/lib/feeds";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// A random item to use as the feed's cover on the home screen, plus how many
// items the feed holds.
export async function GET(
  _req: NextRequest,
  { params }: { params: { feed: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const feed = decodeURIComponent(params.feed);
  if (!(await canViewFeed(session, feed))) {
    return NextResponse.json({ error: "Not found" }, { status: 403 });
  }
  const items = await listFeedItems(feed);
  const pick = items.length ? items[Math.floor(Math.random() * items.length)] : null;
  return NextResponse.json({
    count: items.length,
    cover: pick && {
      type: pick.type,
      src: `/api/media/${encodeURIComponent(feed)}/${pick.path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    },
  });
}
