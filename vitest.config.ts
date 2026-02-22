import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
});
