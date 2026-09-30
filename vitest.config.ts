import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import path from "node:path";

// Vitest does not load .env; integration tests need DATABASE_URL. Same
// loader contract as prisma.config.ts: real environment always wins.
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
    // No .env file — rely on the real environment (CI).
  }
}
loadDotEnvIntoProcess();

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
