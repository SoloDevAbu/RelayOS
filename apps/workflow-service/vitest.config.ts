import { defineConfig } from "vitest/config";
import { baseTest } from "../../vitest.config.base";

export default defineConfig({
  test: {
    ...baseTest,
    name: "workflow:unit",
    include: ["src/**/*.test.ts"],
  },
});
