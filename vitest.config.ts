import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["default", "json"],
    outputFile: {
      json: "./test-results.json",
    },
    coverage: {
      provider: "v8",
      exclude: [
        "**/__tests__/**",
        "**/node_modules/**",
        "src/adapters/postgresql/schemas/index.ts",
        "src/types/index.ts",
      ],
    },
  },
  bench: {
    include: ["src/__tests__/benchmarks/**/*.bench.ts"],
    reporters: ["default"],
  },
});
