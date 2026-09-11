import { spawnSync } from "node:child_process";
import path from "node:path";

import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const prisma = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);
const result = spawnSync(prisma, process.argv.slice(2), {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
