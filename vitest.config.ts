import { defineConfig } from "vitest/config";

const runE2e = process.env.RUN_E2E === "1";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.e2e.ts"],
    exclude: runE2e ? [] : ["tests/e2e/**"],
  },
});
