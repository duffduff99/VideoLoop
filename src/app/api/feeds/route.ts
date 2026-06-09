import { NextResponse } from "next/server";
import { listFeeds } from "@/lib/feeds";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const feeds = await listFeeds();
  const unlocked = new Set(session.unlocked || []);
  return NextResponse.json({
    feeds: feeds.map((f) => ({
      name: f.name,
      locked: f.locked,
      unlocked: !f.locked || unlocked.has(f.name),
    })),
  });
}
