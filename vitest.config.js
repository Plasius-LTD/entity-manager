import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.tests.ts"],
    passWithNoTests: false,
    coverage: {
      all: false,
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "**/node_modules/**",
        "dist/**",
        "coverage/**",
        "**/*.config.*",
        "scripts/**",
      ],
      thresholds: {
        lines: 80,
        functions: 75,
        statements: 75,
        branches: 45,
      },
    },
  },
});
