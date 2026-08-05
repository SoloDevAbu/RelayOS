import { defineConfig } from "vitest/config";
import { baseTest } from "../../vitest.config.base";

export default defineConfig({
  test: {
    ...baseTest,
    name: "ingestion-service:integration",
    include: ["integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["./integration/setup.ts"],
  },
});

