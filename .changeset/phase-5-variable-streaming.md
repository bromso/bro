---
"@repo/tools-variables": minor
"@bromso/figma-mcp": minor
"@repo/figma-adapter": minor
"@repo/protocol": minor
"@repo/transport": minor
---

Phase 5: variable streaming.

- @repo/tools-variables (new) — import_variables (streaming, resumable,
  idempotent, atomic), export_variables (paginated), update_variables_batch,
  stream_status. Inline source only for Phase 5; W3C tokens / CSV deferred
  to Phase 8.
- @repo/figma-adapter — adds createVariable, createVariableCollection,
  getLocalVariableCollectionsAsync, deleteVariableAsync.
- @repo/protocol — Envelope union now includes stream-open/chunk/chunk-ack/
  stream-done.
- @repo/transport — Correlator resolves pending requests on chunk-ack
  envelopes (same id-based correlation as response/error).
- apps/mcp-server — StreamSessionManager, import_variables server handler
  factory, MCP notifications/progress wired through the stdio shim.
  Daemon exposes pluginCorrelator + wsBroadcast + serverRegistry getters.
- apps/bridge-plugin — StreamRuntime (per-session idempotency, atomic
  rollback, ack cache); BridgePluginRuntime now routes streaming envelopes
  through it. New ./src/streaming/stream-runtime export.

Verified end-to-end: 2k import baseline, 10k smoke (~14s on Bun + happy-dom),
atomic rollback, property tests for chunking + idempotency invariants.
