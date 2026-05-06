---
"@repo/relay": minor
---

Phase 6: cloud relay.

apps/relay (new) — Cloudflare Worker + two Durable Objects (LookupDO
for code → sessionId, RelayDO per session) using the WebSocket
Hibernation API. Endpoints: POST /pair (returns 6-digit code +
sessionId + expiresAt), WSS /pair?code=... (plugin upgrade with
single-use code consumption), POST /mcp/{sessionId} (AI Streamable
HTTP, SSE response stream). Pure pass-through routing — no schema
knowledge.

Verified end-to-end via Miniflare 4: pair → plugin connect → AI
request → plugin response → AI SSE. Error paths covered: expired
code, double-use, unknown session, plugin disconnect mid-request.

Out of scope: setup CLI integration (Phase 7), AI-side Streamable
HTTP transport client (Phase 7), production deploy (Phase 9).
