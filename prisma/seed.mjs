import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USER || "admin";
  const password = process.env.ADMIN_PASSWORD || "changeme";

  const count = await prisma.user.count();
  if (count > 0) {
    console.log("[seed] Users already exist; skipping admin seed.");
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { username, password: hashed, isAdmin: true },
  });
  console.log(`[seed] Created initial admin user "${username}".`);
}

main()
  .catch((e) => {
    console.error("[seed] Error:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
