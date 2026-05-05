# Figma MCP Rewrite — Design Document

**Date:** 2026-05-06
**Status:** Approved (brainstorming phase)
**Author:** Jonas Bröms

## Goal

Build an open-source Figma MCP server that matches `figma-console-mcp`'s feature surface (~94 tools across design extraction, creation, FigJam, Slides, accessibility, console debugging, and variables) but with a cleaner architecture: schema-first single source of truth, end-to-end type safety, modular feature packs, native MCP streaming, and a one-command install UX.

The repo is repurposed entirely. The current `apps/design-plugin` is deleted. The existing Turborepo + Bun + Vite + Biome + Vitest skeleton is kept and extended.

## Settled Scope

- Full feature parity with `figma-console-mcp` (~94 tools).
- Two install modes from day 1: **local** (stdio + WebSocket to plugin) and **paired-cloud** (Streamable HTTP + Cloudflare relay). The "remote read-only" mode collapses into local mode that gracefully degrades when the plugin isn't paired — one binary, capability-aware.
- Bidirectional streaming for variables: chunked import (push, resumable), paginated export (cursor-based pull).
- Public OSS quality. No npm publish until v1 ships.
- Skills layer (Impeccable-style markdown skills) deferred until after parity.

## Architecture

Three runtimes, one shared protocol.

1. **MCP server** (`apps/mcp-server`)
   - Node CLI published to npm as `@scope/figma-mcp`.
   - Speaks MCP via stdio (local) or Streamable HTTP (cloud) to AI clients (Claude Code, Claude Desktop, Cursor, Windsurf, Copilot, claude.ai).
   - Hosts a tool registry imported from `@repo/protocol`.
   - Multiplexes multiple AI clients onto a single plugin connection (see daemon model below).
   - Bundles the bridge plugin manifest under `dist/plugin/` so `--print-path` resolves it for users.
   - Includes a `setup` subcommand that detects installed AI clients and writes their MCP configs.

2. **Bridge plugin** (`apps/bridge-plugin`)
   - Statically published Figma plugin. Replaces `apps/design-plugin`.
   - WebSocket client + small React status panel (uses `@repo/ui`).
   - Manifest declares narrow `allowedDomains`: `ws://127.0.0.1:9223` for local and `wss://*.our-relay-domain.com` for cloud. No `["*"]` workaround.
   - **No bootloader** — plugin code ships statically. Trades update convenience for a much simpler trust model. Version mismatch handled by handshake on connect with clear re-import prompt.

3. **Cloud relay** (`apps/relay`)
   - Cloudflare Worker + Durable Object using the **WebSocket Hibernation API** from day 1.
   - One DO per pairing session. Pure pass-through routing of typed envelopes; no business logic, no schema knowledge beyond message envelopes.
   - Persists session state via `serializeAttachment` for hibernate/restore.
   - Passes `{allowHalfOpen: true}` to `accept()` for proxy compatibility under the `web_socket_auto_reply_to_close` compatibility flag.

`@repo/protocol` is the source of truth: every tool defined once as a Zod schema (input, output, streaming flag, error shape). Server, plugin, and relay all import it. Drift becomes a compile error, not a runtime bug. Streaming uses MCP's native `progressToken` / `notifications/progress`, not a bespoke RPC.

## Multi-AI-Client Coordination (Local Mode)

**Decision: daemon + IPC model.**

Each AI client spawns its own `figma-mcp` stdio process. Without coordination they would all try to bind to the WS port for the plugin. Instead:

- The first invocation forks a long-lived **daemon** process that owns the single WS port (`127.0.0.1:9223`) and the plugin connection.
- Subsequent invocations from other AI clients detect the daemon via PID/lockfile in `~/.figma-mcp/`, connect over a **Unix domain socket** (or named pipe on Windows), and tunnel their MCP traffic through it.
- The daemon multiplexes traffic by `sourceClientId`.
- One port, one plugin connection, N AI clients. No port-scanning, no "which port am I on?" confusion.

Stale lockfile recovery: setup CLI verifies the PID is alive on startup; if dead, rebroadcasts ownership.

## Packages

### `apps/`

| App | Purpose |
|-----|---------|
| `apps/mcp-server` | Published as `@scope/figma-mcp`. MCP server, daemon, setup CLI, transports. |
| `apps/bridge-plugin` | Figma plugin (replaces `apps/design-plugin`). |
| `apps/relay` | Cloudflare Worker + DO. |
| `apps/docs` | Existing docs app, repurposed for product docs. |
| `apps/storybook` | Existing Storybook, used for bridge-plugin status panel components. |

### `packages/`

| Package | Purpose |
|---------|---------|
| `@repo/protocol` | **Source of truth.** Zod schemas for every tool, envelope types, error codes, streaming primitives (cursor, chunk, ack). |
| `@repo/transport` | WebSocket framing, request/response correlation, reconnect/backoff. Used by mcp-server (server side) and bridge-plugin (client side); relay uses a slim subset. |
| `@repo/figma-adapter` | Thin layer over `figma.*`. Two implementations: `RealFigmaAdapter` (production) and `FigmaFake` (testing, exported from `@repo/figma-adapter/testing`). Reliability seam — every handler talks to the adapter, never `figma.*` directly. |
| `@repo/tools-extract` | Feature pack: design system extraction (variables read, components, styles, kits). |
| `@repo/tools-design` | Feature pack: node creation (rectangles, components, frames, instances). |
| `@repo/tools-figjam` | Feature pack: stickies, tables, code blocks, connectors. |
| `@repo/tools-slides` | Feature pack: slide management. |
| `@repo/tools-a11y` | Feature pack: accessibility scanning + lint rules. |
| `@repo/tools-console` | Feature pack: console logs, screenshots. |
| `@repo/tools-variables` | Feature pack: variables (with streaming import/export). |
| `@repo/tools-rest` | Feature pack: REST-API-backed read-only tools (server-only, used as plugin-not-paired fallback). |
| `@repo/common` | Trimmed to error classes, logger, shared utilities. |
| `@repo/ui` | Existing UI components, used by bridge-plugin status panel. |

Each tool pack exports `registerServer(server)` and/or `registerPlugin(plugin)`. The MCP server iterates packs and registers what's wired for it; the plugin does the same on its side. Some packs are server-only (`-rest`), some plugin-only (`-figjam`), most are both.

All packages are JIT TypeScript (no build step). All are `private: true` for v1 — only `@scope/figma-mcp` is published. We can split off `@scope/figma-mcp-protocol` later if third parties want to write their own tool packs.

## Data Flow

### Tool call (non-streaming, local mode)

1. AI client → MCP stdio → server validates input via protocol Zod schema.
2. If tool has `serverImpl`, server handles inline (e.g., REST-API-backed read).
3. Otherwise, server routes to plugin over local WS as `{id, name, args, sourceClientId}`.
4. Plugin matches handler by name → calls `figma-adapter` → result validated against output schema → sent back.
5. Server returns result to AI as MCP tool result.

### Streaming variable import

1. AI calls `import_variables` with input source (URL, inline tokens) and target collection/mode.
2. Server opens a stream session, parses input, breaks into chunks of N (default 100, tunable).
3. Each chunk envelope: `{sessionId, seq, total, items, idempotencyKey}`.
4. Plugin handler runs `setValueForMode` in a tight sandbox loop per item; emits `ChunkAck {applied[], failed[]}`.
5. Server forwards each ack as MCP `notifications/progress {progressToken, progress, total, message}`.
6. **Resumability:** plugin retains `(sessionId, seq) → applied` map; on reconnect server queries last-acked seq and resumes; idempotency keys block double-apply.

### Streaming variable export

Cursor-paginated tool, not push-stream.

1. AI calls `export_variables {filter?, pageSize, cursor?}`.
2. Plugin reads via `getLocalVariablesAsync`, returns `{items, nextCursor}`.
3. AI calls again with `nextCursor` until exhausted.
4. Optional `notifications/progress` between pages for UI feedback.

### Cloud pairing

1. `npx @scope/figma-mcp setup --cloud` calls relay → returns `{pairingCode, sessionId}`.
2. AI client speaks Streamable HTTP to relay endpoint.
3. User pastes pairing code into bridge plugin status panel.
4. Plugin opens WSS to `wss://relay/pair?code=...`.
5. DO (one per session, Hibernation API) routes traffic between AI HTTP requests and plugin WS messages.

### Read-only fallback

When plugin is not paired:
- Tools with `serverImpl` (REST-API-backed reads) work transparently.
- Tools requiring the plugin return MCP error `E_BRIDGE_NOT_CONNECTED` with remediation text.
- `bridge_status` diagnostic tool exposes pairing state to the AI.

## Error Handling

**Six categories, stable codes in `@repo/protocol`:**

- `ProtocolError` — schema validation, malformed envelopes. Includes offending JSON path.
- `FigmaError` — wraps `figma.*` failures. Subtyped: `NoPermission`, `NodeNotFound`, `PlanLimit`, `EditorTypeMismatch`, `Sandbox`. Each carries remediation hint.
- `TransportError` — WS disconnect, IPC failure, timeout. Auto-retried with bounded backoff; terminal failures bubble as `E_BRIDGE_UNAVAILABLE`.
- `StreamError` — partial application or idempotency conflict. Carries `lastAppliedSeq` so AI can resume or abort.
- `DaemonError` — stale lockfile, version drift, port already bound.
- `RelayError` — pairing expired, DO eviction, session not found.

**Validation at every boundary.** Zod on both directions of every cross-process message.

**MCP error mapping:**
- Tool-level (`Figma`, `Stream`, `Protocol`) → MCP tool result with `isError: true` and structured `content`. AI can react.
- Catastrophic (`Transport`, `Daemon`, `Relay`) → JSON-RPC error response. AI sees "server is broken."

**Streaming partial-failure:** per-chunk errors do not kill the stream. Acks report `applied[]`/`failed[]`; final tool result summarizes `{total, applied, failed, failedDetails}`. `--atomic` opt-in for all-or-nothing imports — plugin tracks creations and rolls back on first failure.

**Diagnostics:**
- `figma-mcp doctor` CLI — checks daemon liveness, plugin pairing, AI client configs, port conflicts, recent errors.
- `bridge_status` MCP tool — same data callable by the AI.

**Specific gotchas explicitly handled:**
- Stale daemon lockfile (PID checked-then-cleared on startup).
- `documentAccess: "dynamic-page"` — calling sync getter is a hard error with upgrade message.
- Plugin/server version handshake on every connect — mismatch = `E_VERSION_DRIFT` with re-import path.
- Editor-type mismatch — FigJam tool in Figma Design = `E_WRONG_EDITOR_TYPE`.

Logging: structured JSON to stderr, `--log-level` flag. Plugin-side console logs streamable into MCP via `tools-console`. Telemetry opt-in only.

## Testing

Six layers, each guarantees something specific.

1. **Protocol unit tests.** Every Zod schema gets positive + negative validation tests and an encode/decode roundtrip. `fast-check` property tests on streaming envelopes prove chunking invariants. **Coverage target: 95%.**

2. **Handler unit tests** (per feature pack). Each handler tested against `FigmaFake`. Both `serverHandler` and `pluginHandler`. Cases: happy path, deleted node, plan-limit, sandbox restriction, editor-type mismatch, async-getter enforcement. **Coverage target: 90%.**

3. **Transport tests.** Framing, correlation, reconnect backoff. Injected failures: drops mid-stream, reorderings, duplicate envelopes, slow ack. Daemon + multi-stdio-shim multiplexing tested via in-memory Unix-socket fakes. No real network in unit tests.

4. **Streaming integration tests** (the reliability spine). 10k-variable fixtures. Assert: chunked transfer completes, progress events monotonic, resume from last-acked seq after disconnect, idempotency blocks double-apply, partial-failure totals add up, `--atomic` rolls back cleanly.

5. **MCP-level integration tests.** `@modelcontextprotocol/sdk` test client drives the server. Verify tool listing, tool calls, `notifications/progress` flow, error mapping. Catches MCP regressions when SDK upgrades.

6. **Smoke tests in CI.** Real daemon, real stdio shim, ~10 happy-path tool calls against `FigmaFake`. <30 s. Required check.

**Optional, manual workflow trigger:** golden tests against real Figma using `FIGMA_API_KEY` and a test file. Run before each release; results recorded as fixtures the offline tests can replay later.

**Relay tests:** Cloudflare Miniflare 4 with Hibernation API; assert pairing, message routing, hibernation/restore via `serializeAttachment`.

**CI:** Turbo-cached lint → unit → integration → smoke → build. Per-pack PRs only rerun their pack + downstream consumers. Coverage published per package; regressions block merge.

**Coverage targets:**
- `packages/*`: 90%
- `apps/mcp-server`: 80%
- `apps/bridge-plugin` handlers: 85%, UI: 70%
- `apps/relay`: 80%

## Out of Scope (v1)

- Impeccable-style design-discipline skills layer (deferred — revisit after parity).
- Public split of `@scope/figma-mcp-protocol` (revisit when third parties want to write tool packs).
- Telemetry beyond opt-in.
- Plugin auto-update / bootloader pattern (deliberately rejected for trust reasons).

## Open Questions for the Implementation Plan

- Final product/package name (placeholder `@scope/figma-mcp` throughout).
- Cloud relay domain choice (affects `allowedDomains` policy and Figma plugin review).
- Zod version: pin Zod 3 for v1 (zod-to-json-schema ecosystem stable) or invest in Zod 4 path.
- MCP SDK version: target stable 1.x; plan a clean migration path to 2.x when it goes stable.
- License (MIT? Apache 2.0?) — implicates relationship with the reference if any code is derived.

## References

- [southleft/figma-console-mcp](https://github.com/southleft/figma-console-mcp)
- [DeepWiki: figma-console-mcp](https://deepwiki.com/southleft/figma-console-mcp)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP TypeScript SDK Docs](https://ts.sdk.modelcontextprotocol.io/)
- [Figma Plugin Manifest](https://developers.figma.com/docs/plugins/manifest/)
- [Figma Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables/)
- [Cloudflare WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/)
- [Rules of Durable Objects (2026)](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- [A Better Figma MCP](https://cianfrani.dev/posts/a-better-figma-mcp/)
- [paper.design vs Figma MCP](https://sfailabs.com/guides/figma-mcp-vs-paper)
- [claude-talk-to-figma-mcp](https://github.com/arinspunk/claude-talk-to-figma-mcp)
- [mcpkit (Zod-first MCP framework)](https://glama.ai/mcp/servers/EuKennedy/mcpkit)
