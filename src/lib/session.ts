import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "vl_session";
// "Remember me" → 30 days; otherwise a short-lived session cookie.
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30;

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  uid: string;
  username: string;
  isAdmin: boolean;
  // Private feeds are visible until this time (ms since epoch), if set.
  privateUntil?: number;
  // Whether this login used "Remember me" (keeps re-issued tokens consistent).
  remember?: boolean;
}

export async function createToken(
  payload: SessionPayload,
  remember: boolean
): Promise<string> {
  const builder = new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt();
  if (remember) {
    builder.setExpirationTime(`${REMEMBER_MAX_AGE}s`);
  } else {
    builder.setExpirationTime("12h");
  }
  return builder.sign(getSecret());
}

export async function verifyToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// Browsers drop "Secure" cookies sent over plain http (except on localhost),
// so only mark the cookie Secure when the request actually arrived over HTTPS
// (directly or via a reverse proxy). COOKIE_SECURE=true/false overrides this.
function cookieSecure(): boolean {
  const override = process.env.COOKIE_SECURE;
  if (override) return /^(1|true|yes)$/i.test(override);
  const proto = headers().get("x-forwarded-proto");
  return proto?.split(",")[0].trim() === "https";
}

export async function setSessionCookie(token: string, remember: boolean) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: REMEMBER_MAX_AGE } : {}),
  });
}

export async function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export { SESSION_COOKIE };
