import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.e2e.ts"],
    exclude: ["tests/e2e/**"],
  },
});
