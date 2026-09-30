import { defineConfig } from "prisma/config";
import { readFileSync } from "node:fs";

/**
 * Prisma 6.19+ stops auto-loading .env when a config file exists, so we load
 * it here (no dotenv dependency needed). Values already present in the real
 * environment always win over .env entries.
 */
function loadDotEnvIntoProcess() {
  try {
    const raw = readFileSync(".env", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      const value = m[2].replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env file — rely on the real environment.
  }
}

loadDotEnvIntoProcess();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
});
