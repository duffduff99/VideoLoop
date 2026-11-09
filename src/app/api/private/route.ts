import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { listFeeds, privateUnlockMs, privateVisible } from "@/lib/feeds";
import { createToken, getSession, SessionPayload, setSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

async function hasPrivateFeeds(): Promise<boolean> {
  return (await listFeeds()).some((f) => f.private);
}

function status(session: SessionPayload, hasPrivate: boolean) {
  const visible = privateVisible(session);
  return {
    hasPrivate,
    visible,
    until: visible ? session.privateUntil : null,
  };
}

// Re-issue the session cookie with a new privateUntil, keeping the original
// "remember me" lifetime.
async function reissue(session: SessionPayload, privateUntil: number | undefined) {
  const remember = Boolean(session.remember);
  const next: SessionPayload = {
    uid: session.uid,
    username: session.username,
    isAdmin: session.isAdmin,
    remember,
    ...(privateUntil ? { privateUntil } : {}),
  };
  await setSessionCookie(await createToken(next, remember), remember);
  return next;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(status(session, await hasPrivateFeeds()));
}

// { action: "show", password } reveals private feeds after re-checking the
// user's own account password; { action: "hide" } hides them again.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === "hide") {
    const next = await reissue(session, undefined);
    return NextResponse.json(status(next, await hasPrivateFeeds()));
  }

  if (action === "show") {
    const password = body?.password?.toString() || "";
    const user = await prisma.user.findUnique({ where: { id: session.uid } });
    if (!user) {
      return NextResponse.json({ error: "Session expired, please sign in again" }, { status: 401 });
    }
    if (!password || !(await bcrypt.compare(password, user.password))) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }
    const next = await reissue(session, Date.now() + privateUnlockMs());
    return NextResponse.json(status(next, await hasPrivateFeeds()));
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
