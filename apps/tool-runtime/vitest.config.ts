import { defineConfig } from "vitest/config";
import { baseTest } from "../../vitest.config.base";

export default defineConfig({
  test: {
    ...baseTest,
    name: "tool-runtime:unit",
    include: ["src/**/*.test.ts"],
  },
});
