/// <reference types="node" />
/**
 * Phase 22 — doctor `oauth` check.
 *
 * Reports the state of the local OAuth token file. Complementary to the
 * `figma-api-key` check (Phase 11): a user might have either or both.
 *
 * Status mapping:
 *   - ok  → tokens exist and are not within the 60s expiry buffer.
 *   - warn → tokens exist but expire within 60s. Lazy refresh-on-demand
 *           still works (Phase 21's `refreshOAuthToken`); doctor surfaces
 *           the imminent refresh as a heads-up rather than a failure.
 *   - warn → no token file. The user might be on PAT-only setup.
 *   - error → token file exists but is unreadable / malformed (treated as
 *           "needs re-auth").
 *
 * The check is path-injectable so tests can point at a fixture; production
 * defaults to `~/.figma-mcp/oauth.json`.
 */

import { readFile } from "node:fs/promises";
import { isExpired, type OAuthTokenSet } from "@repo/figma-api-client";
import type { Check } from "../doctor";

export interface OAuthCheckOptions {
  readonly tokenPath: string;
  readonly readFile?: (path: string) => Promise<string>;
  readonly now?: () => number;
}

export function createOAuthCheck(opts: OAuthCheckOptions): Check {
  const reader = opts.readFile ?? ((p: string) => readFile(p, "utf-8"));
  const now = opts.now ?? Date.now;

  return {
    name: "oauth",
    async run() {
      let raw: string;
      try {
        raw = await reader(opts.tokenPath);
      } catch (err) {
        // Distinguish "file doesn't exist" (warn — PAT-only is valid) from
        // "permission denied / IO error" (error — needs operator attention).
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === "ENOENT") {
          return {
            status: "warn" as const,
            detail:
              "no OAuth token file at ~/.figma-mcp/oauth.json — PAT-only setup if FIGMA_API_KEY is set, otherwise run `figma-mcp setup --cloud --oauth`",
          };
        }
        return {
          status: "error" as const,
          detail: `OAuth token file exists but is unreadable: ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return {
          status: "error" as const,
          detail: "OAuth token file is not valid JSON — re-run `figma-mcp setup --cloud --oauth`",
        };
      }

      if (!isOAuthTokenSet(parsed)) {
        return {
          status: "error" as const,
          detail:
            "OAuth token file is missing required fields — re-run `figma-mcp setup --cloud --oauth`",
        };
      }

      const nowMs = now();
      // `isExpired` from Phase 21 already includes a 60s buffer — match
      // its semantics here so the check and the daemon agree on when a
      // refresh is due.
      if (isExpired(parsed, nowMs)) {
        return {
          status: "warn" as const,
          detail: `OAuth access token expires within ~60s (at ${new Date(
            parsed.expiresAt
          ).toISOString()}); will refresh on next REST call`,
        };
      }
      return {
        status: "ok" as const,
        detail: `OAuth access token valid until ${new Date(parsed.expiresAt).toISOString()}`,
      };
    },
  };
}

function isOAuthTokenSet(value: unknown): value is OAuthTokenSet {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === "string" &&
    typeof v.refreshToken === "string" &&
    typeof v.expiresAt === "number" &&
    typeof v.scope === "string"
  );
}
