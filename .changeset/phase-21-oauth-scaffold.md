---
"@bromso/figma-mcp": minor
"@repo/figma-api-client": minor
---

OAuth client-side scaffold (Phase 21 of 2).

`@repo/figma-api-client` gains:

- `OAuthTokenSet` type + `OAuthTokenStore` (`load/save/isExpired`).
- Bearer-token auth — `FigmaApiClient` accepts `oauthToken: string` or `getOauthToken: () => Promise<string>` alongside the existing PAT-only `apiKey`. When both are configured, OAuth wins. Existing PAT users see no behavior change.
- `refreshOAuthToken()` — POSTs Figma's `/v1/oauth/refresh` with the standard urlencoded body and returns a new `OAuthTokenSet`.

`@bromso/figma-mcp` recognizes `figma-mcp setup --cloud --oauth`, prints a "Phase 22 required" message, and exits cleanly. The flag's wire-up to the relay's callback endpoint lands in Phase 22.

Out of scope: relay-side `/oauth/start` and `/oauth/callback` endpoints (Phase 22), Figma OAuth app registration (manual maintainer step), browser-open helper, end-to-end token-acquisition flow.
