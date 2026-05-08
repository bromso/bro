/**
 * Phase 21 — OAuth refresh-token exchange.
 *
 * The daemon calls `refreshOAuthToken` from its `getOauthToken` callback
 * when `isExpired(tokens)` returns true. We intentionally don't host a
 * background refresh loop — refresh is lazy and only kicks in immediately
 * before a real REST call.
 *
 * Figma's OAuth refresh endpoint is `POST /v1/oauth/refresh` with a
 * standard urlencoded body. The response shape is:
 *
 *   {
 *     "access_token":  string,
 *     "refresh_token": string?,    // optional — reuse the old one if absent
 *     "expires_in":    number,     // seconds
 *     "scope":         string,
 *     ...
 *   }
 *
 * On non-2xx we surface a `FigmaApiError` mapped via `mapStatusToCode` so
 * the daemon can distinguish "user revoked the grant" (401 →
 * `E_FIGMA_REST_AUTH`, re-run the OAuth flow) from "Figma is down" (5xx
 * → `E_FIGMA_REST_UNKNOWN`, retry later).
 */

import { FigmaApiError, mapStatusToCode } from "./errors";
import type { OAuthTokenSet } from "./oauth";

const REFRESH_URL = "https://api.figma.com/v1/oauth/refresh";

export interface RefreshOAuthTokenOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly fetchFn?: typeof fetch;
}

interface FigmaRefreshResponseBody {
  readonly access_token?: unknown;
  readonly refresh_token?: unknown;
  readonly expires_in?: unknown;
  readonly scope?: unknown;
}

export async function refreshOAuthToken(opts: RefreshOAuthTokenOptions): Promise<OAuthTokenSet> {
  const fetchFn = opts.fetchFn ?? fetch;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    refresh_token: opts.refreshToken,
  }).toString();

  const resp = await fetchFn(REFRESH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new FigmaApiError({
      status: resp.status,
      code: mapStatusToCode(resp.status),
      message: text || `HTTP ${resp.status}`,
    });
  }

  const json = (await resp.json()) as FigmaRefreshResponseBody;
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 0;
  const scope = typeof json.scope === "string" ? json.scope : "";
  const refreshToken =
    typeof json.refresh_token === "string" && json.refresh_token.length > 0
      ? json.refresh_token
      : opts.refreshToken;

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scope,
  };
}
