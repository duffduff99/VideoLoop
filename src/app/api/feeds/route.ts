import { NextResponse } from "next/server";
import { listFeeds, privateVisible } from "@/lib/feeds";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Private feeds are omitted entirely unless revealed in Settings.
  const visible = privateVisible(session);
  const feeds = (await listFeeds()).filter((f) => !f.private || visible);
  return NextResponse.json({
    feeds: feeds.map((f) => ({ name: f.name, private: f.private })),
  });
}
