import type { Check } from "../doctor";

export interface FigmaApiKeyCheckOptions {
  readonly env: NodeJS.ProcessEnv;
}

/**
 * Phase 11 reviewer follow-up: warn when FIGMA_API_KEY is not in the
 * daemon's environment. The 20 tools in `@repo/tools-rest` need the env
 * var to function. Without it they surface E_FIGMA_API_KEY_MISSING per
 * call; the doctor check tells the user up-front so a missing env var
 * isn't surprising.
 *
 * Returns warn (not error) — the daemon boots fine without it; only the
 * REST pack is gated.
 */
export const createFigmaApiKeyCheck = (opts: FigmaApiKeyCheckOptions): Check => ({
  name: "figma-api-key",
  async run() {
    const key = opts.env.FIGMA_API_KEY;
    if (typeof key === "string" && key.length > 0) {
      return { status: "ok" as const, detail: "FIGMA_API_KEY is set" };
    }
    return {
      status: "warn" as const,
      detail:
        "FIGMA_API_KEY not set — tools-rest tools (~20) will fail with E_FIGMA_API_KEY_MISSING",
    };
  },
});
