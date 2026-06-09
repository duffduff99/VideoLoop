import { NextRequest, NextResponse } from "next/server";
import { feedPassword, isFeedLocked } from "@/lib/feeds";
import { getSession, createToken, setSessionCookie } from "@/lib/session";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";

// Unlocking a feed re-issues the session token with the feed added to the
// session's unlocked list. We preserve the original cookie max-age by reading
// whether it was a "remember me" session (presence of a persistent cookie).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const feed = body?.feed?.toString();
  const password = body?.password?.toString();

  if (!feed) {
    return NextResponse.json({ error: "Feed is required" }, { status: 400 });
  }
  if (!isFeedLocked(feed)) {
    return NextResponse.json({ ok: true });
  }
  if (password !== feedPassword(feed)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const unlocked = Array.from(new Set([...(session.unlocked || []), feed]));
  // Re-issue with the longer lifetime if the original cookie persisted.
  const remember = Boolean(cookies().get(SESSION_COOKIE));
  const token = await createToken(
    {
      uid: session.uid,
      username: session.username,
      isAdmin: session.isAdmin,
      unlocked,
    },
    remember
  );
  await setSessionCookie(token, remember);

  return NextResponse.json({ ok: true });
}
