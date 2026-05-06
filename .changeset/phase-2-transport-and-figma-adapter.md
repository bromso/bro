---
"@repo/transport": minor
"@repo/figma-adapter": minor
"@repo/protocol": minor
---

Phase 2: WebSocket transport (server + client + correlator + reconnect),
FigmaAdapter type contract with FigmaFake test double, and protocol's
PluginHandlerContext now holds a real FigmaAdapter instead of a
placeholder. No published package consumes these yet — all `private: true`.
