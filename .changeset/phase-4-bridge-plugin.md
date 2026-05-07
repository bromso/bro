---
"@repo/bridge-plugin": minor
"@bromso/figma-mcp": minor
"@repo/protocol": minor
"@repo/figma-adapter": minor
---

Phase 4: bridge plugin replaces the deleted apps/design-plugin.

- @repo/bridge-plugin (apps/bridge-plugin) — Figma plugin with WS
  client transport, BridgePluginRuntime (handshake + dispatch loop),
  React status panel UI, narrow allowedDomains manifest. Vite produces
  dist/plugin.js + dist/index.html + dist/manifest.json.
- @bromso/figma-mcp — Daemon now binds a WebSocket server (default
  127.0.0.1:9223), performs version handshake on plugin connect, and
  routes plugin-tool requests over WS when a plugin is connected
  (with in-process FigmaFake fallback for tests).
- @repo/protocol — adds HandshakeRequest/Response envelopes; the
  Envelope discriminated union now includes them.
- @repo/figma-adapter — adds RealFigmaAdapter wrapping the figma
  global, alongside FigmaFake.

Verified end-to-end (in-memory WS plugin path through the stdio shim).
No published package consumes these yet — all `private: true`.
