import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node", // Override per-test for UI via @vitest-environment comment
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/__tests__/**",
        "src/plugin.ts", // sandbox entry — wired in Task 4.8
        "src/plugin-bootstrap.ts", // Vite entry; calls start() at import time
        "src/ui/main.tsx", // UI bootstrap entry
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});
