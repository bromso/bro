import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for the Cloudflare Worker relay.
 *
 * `@cloudflare/vitest-pool-workers@0.16+` exposes its integration as a Vite
 * plugin (`cloudflareTest`) rather than the older `defineWorkersConfig` /
 * `./config` subpath. The plugin wires up the Workers pool and bootstraps
 * Miniflare from the wrangler.toml in this directory.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
    }),
  ],
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**"],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});
