import { randomBytes, scryptSync } from "node:crypto";

import nextEnv from "@next/env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

nextEnv.loadEnvConfig(process.cwd());

const email = process.env.LOCAL_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.LOCAL_ADMIN_PASSWORD;
const name = process.env.LOCAL_ADMIN_NAME?.trim() || "Local Root Admin";

if (!email || !password || password.length < 8) {
  console.error("LOCAL_ADMIN_EMAIL and an 8+ character LOCAL_ADMIN_PASSWORD are required.");
  process.exit(1);
}

if (!process.env.DATABASE_URL?.includes("127.0.0.1")) {
  console.error("This command only creates users in a local 127.0.0.1 database.");
  process.exit(1);
}

const salt = randomBytes(16).toString("base64url");
const hash = scryptSync(password, salt, 64).toString("base64url");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  const existingUser = await prisma.appUser.findUnique({ where: { email } });
  if (existingUser) {
    console.error(`A local user with ${email} already exists.`);
    process.exitCode = 1;
  } else {
    await prisma.appUser.create({
      data: {
        id: `local-admin-${randomBytes(6).toString("hex")}`,
        email,
        name,
        role: "root_admin",
        isActive: true,
        passwordHash: `scrypt:${salt}:${hash}`,
      },
    });
    console.log(`Created local root admin ${email}.`);
  }
} finally {
  await prisma.$disconnect();
}
