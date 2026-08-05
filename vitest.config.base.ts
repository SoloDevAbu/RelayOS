export const baseTest = {
  globals: true,
  environment: "node" as const,
  coverage: {
    provider: "v8" as const,
    reporter: ["text", "html"] as ["text", "html"],
    thresholds: {
      lines: 70,
      functions: 70,
    },
  },
};

