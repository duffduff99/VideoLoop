import { prisma } from "./db";
import { getSession } from "./session";

// The signed-in user if they are (still) an administrator. Checked against
// the database rather than the session cookie, so a removed or demoted admin
// loses access immediately.
export async function requireAdmin() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { id: true, isAdmin: true },
  });
  return user?.isAdmin ? session : null;
}
