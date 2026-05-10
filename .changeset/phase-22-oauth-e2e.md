---
"@bromso/figma-mcp": minor
"@repo/relay": minor
---

Phase 22: OAuth end-to-end wire-up.

`figma-mcp setup --cloud --oauth` now actually works. The relay gains
three endpoints (`POST /oauth/start`, `GET /oauth/callback`, `GET /oauth/result`)
and an `OauthSessionDurableObject` that holds in-flight auth-code
exchanges. The daemon opens a browser at Figma's authorize URL,
polls the relay, and writes tokens to `~/.figma-mcp/oauth.json` on
completion.

The daemon's `FigmaApiClient` now prefers OAuth tokens when present,
with lazy refresh-on-expiry via Phase 21's `refreshOAuthToken`.

`figma-mcp doctor` gains an `oauth` check reporting token state.

Maintainer-side prerequisites (one-time):
1. Register an OAuth app at https://www.figma.com/developers/apps.
2. Set `FIGMA_OAUTH_CLIENT_ID`, `FIGMA_OAUTH_CLIENT_SECRET`, `OAUTH_CALLBACK_URL` on the relay (`wrangler secret put` for the secrets).
3. Redeploy the relay.

PAT-based cloud mode (Phase 6) continues to work unchanged.

Out of scope: PKCE (Figma's OAuth doesn't currently require it),
device-code flow (for headless CI), token revocation tooling, multi-account
support.
