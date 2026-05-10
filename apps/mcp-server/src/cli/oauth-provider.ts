/// <reference types="node" />
/**
 * Phase 22 — OAuth bearer-token provider for the daemon's FigmaApiClient.
 *
 * The provider is wired into `FigmaApiClient` via `getOauthToken: () =>
 * Promise<string>`. It's called once per REST call, so it has to be cheap
 * — we cache the in-memory token for `cacheTtlMs` (default 60s) before
 * re-reading the file. On expiry we lazy-call `refreshOAuthToken` and
 * re-save the file.
 *
 * Why a 60s file-read cache? The token file is rewritten only by the
 * OAuth flow (Task 22.5) or by a refresh kicked off here. Both are rare;
 * 60s is short enough that an external rewrite (e.g. user re-runs setup
 * --cloud --oauth) is picked up quickly, and long enough to amortize the
 * fs stat across bursts of REST calls.
 *
 * Refresh requires `FIGMA_OAUTH_CLIENT_ID` + `FIGMA_OAUTH_CLIENT_SECRET`
 * in the daemon's environment — the same secrets the relay holds. If
 * they're missing and the access token expires, we throw a clean
 * `E_OAUTH_REFRESH_NOT_CONFIGURED` so the user knows to either set them
 * or re-run the OAuth flow.
 */

import {
  isExpired,
  loadOAuthTokens,
  type OAuthTokenSet,
  refreshOAuthToken,
  saveOAuthTokens,
} from "@repo/figma-api-client";

export interface OAuthProviderOptions {
  readonly tokenPath: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly cacheTtlMs?: number;
  readonly now?: () => number;
  // Test seams. Default to the production helpers from @repo/figma-api-client.
  readonly loadTokens?: typeof loadOAuthTokens;
  readonly saveTokens?: typeof saveOAuthTokens;
  readonly refreshTokens?: typeof refreshOAuthToken;
}

const DEFAULT_CACHE_TTL_MS = 60_000;

export function createOAuthProvider(opts: OAuthProviderOptions): () => Promise<string> {
  const env = opts.env ?? process.env;
  const cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = opts.now ?? Date.now;
  const loadTokens = opts.loadTokens ?? loadOAuthTokens;
  const saveTokens = opts.saveTokens ?? saveOAuthTokens;
  const refreshTokens = opts.refreshTokens ?? refreshOAuthToken;

  let cached: OAuthTokenSet | null = null;
  let cachedAt = 0;

  return async () => {
    const nowMs = now();
    if (!cached || nowMs - cachedAt >= cacheTtlMs) {
      cached = await loadTokens(opts.tokenPath);
      cachedAt = nowMs;
    }
    if (!cached) {
      throw new Error(
        "E_OAUTH_NO_TOKENS: ~/.figma-mcp/oauth.json missing — run `figma-mcp setup --cloud --oauth`"
      );
    }
    if (isExpired(cached, nowMs)) {
      const clientId = env.FIGMA_OAUTH_CLIENT_ID;
      const clientSecret = env.FIGMA_OAUTH_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error(
          "E_OAUTH_REFRESH_NOT_CONFIGURED: access token expired and FIGMA_OAUTH_CLIENT_ID/SECRET are not set on the daemon. Re-run `figma-mcp setup --cloud --oauth` or set the env vars to enable lazy refresh."
        );
      }
      const refreshed = await refreshTokens({
        clientId,
        clientSecret,
        refreshToken: cached.refreshToken,
      });
      await saveTokens(opts.tokenPath, refreshed);
      cached = refreshed;
      cachedAt = nowMs;
    }
    return cached.accessToken;
  };
}
