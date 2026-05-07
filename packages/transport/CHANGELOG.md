# @repo/transport

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @repo/protocol@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @repo/protocol@0.1.1

## 0.1.0

### Minor Changes

- [#2](https://github.com/bromso/bro/pull/2) [`c4f8119`](https://github.com/bromso/bro/commit/c4f81196f21eb3d0644a941d77397dfdd786621f) Thanks [@bromso](https://github.com/bromso)! - Phase 2: WebSocket transport (server + client + correlator + reconnect),
  FigmaAdapter type contract with FigmaFake test double, and protocol's
  PluginHandlerContext now holds a real FigmaAdapter instead of a
  placeholder. No published package consumes these yet — all `private: true`.

- [#3](https://github.com/bromso/bro/pull/3) [`2e45637`](https://github.com/bromso/bro/commit/2e45637341801a5959cf1f1be638e54d6991ed0b) Thanks [@bromso](https://github.com/bromso)! - Phase 3: daemon + canonical feature pack end-to-end.

  - @bromso/figma-mcp (apps/mcp-server) — daemon process model with
    Unix-socket IPC, lockfile-based single-instance enforcement, MCP
    stdio shim that proxies tool calls to the daemon, and `@modelcontextprotocol/sdk`
    bridge for tool registration.
  - @repo/tools-extract — canonical feature pack with
    `extract_styles`, `extract_components`, `extract_local_variables`,
    `bridge_status`. Pattern is mechanical for later packs.
  - @repo/transport — Unix-socket server + client transports.
  - @repo/figma-adapter — extended to cover paint/text/effect styles
    and components.

  Verified end-to-end (in-memory + real-process spawn). No published
  package consumes these yet — all `private: true`.

- [#5](https://github.com/bromso/bro/pull/5) [`b13db4a`](https://github.com/bromso/bro/commit/b13db4a63fb71e635cfeb733389942bf2e687ac9) Thanks [@bromso](https://github.com/bromso)! - Phase 5: variable streaming.

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

- [#9](https://github.com/bromso/bro/pull/9) [`b89d5b8`](https://github.com/bromso/bro/commit/b89d5b876efab3e74b1c69c1c2026cd417cfd526) Thanks [@bromso](https://github.com/bromso)! - Phase 7: Setup CLI + diagnostics.

  `@bromso/figma-mcp` (apps/mcp-server) gains a CLI dispatch layer:

  - `figma-mcp setup` detects installed AI clients (Claude Code,
    Claude Desktop, Cursor, Windsurf, VS Code Copilot) and writes
    their MCP config entries atomically, preserving siblings.
  - `figma-mcp setup --cloud` pairs with the relay (Phase 6) and
    writes Streamable HTTP entries pointing at `/mcp/{sessionId}`.
  - `figma-mcp setup --dry-run` and `--client <id>` for previewing
    and scoping.
  - `figma-mcp setup --open-figma` reveals the bundled bridge
    plugin manifest in the OS file picker.
  - `figma-mcp doctor` runs parallel health checks: daemon
    liveness, lockfile staleness, plugin pairing, AI client
    config drift, recent errors, socket/port conflict. `--json`
    for machine output.
  - `figma-mcp --print-path` resolves the bundled bridge plugin
    manifest path.
  - `figma-mcp --help` prints usage.

  `@repo/transport` (packages/transport) gains:

  - `pickIpcTransport(platform)` selector: Unix socket on
    POSIX, named pipe on win32.
  - `NamedPipeServerTransport` / `NamedPipeClientTransport`
    re-exports (Node's `node:net` accepts pipe paths verbatim).

  Out of scope: production relay URL (Phase 9), Windows beyond
  unit-tested selector, telemetry, auto-update, doctor --fix.

### Patch Changes

- [#11](https://github.com/bromso/bro/pull/11) [`2d6271f`](https://github.com/bromso/bro/commit/2d6271f55ae36978972eb09532e6ceeeb145edfc) Thanks [@bromso](https://github.com/bromso)! - Phase 9: polish + release.

  `@bromso/figma-mcp` (formerly the workspace package `@repo/mcp-server`)
  ships its first public release on npm:

  - Renamed published artifact: `@bromso/figma-mcp`. The CLI binary is
    unscoped: `figma-mcp`. Install via `npx @bromso/figma-mcp setup`.
  - `bin: { "figma-mcp": "./dist/main.js" }` so post-install the binary
    is on PATH.
  - New `build` script that bundles `src/main.ts` to `dist/main.js`
    (Node target, deps externalized) and copies the bridge plugin's
    built assets into `dist/plugin/`.
  - Publish metadata: `homepage`, `repository`, `license`, `bugs`,
    `keywords`, `engines: { node: ">=20.10.0" }`,
    `publishConfig: { access: "public" }`.
  - Internal libs (`@repo/protocol`, `@repo/transport`,
    `@repo/figma-adapter`, the four `@repo/tools-*` packs) remain
    `private: true` for v1; the only npm artifact is
    `@bromso/figma-mcp`. They get patch bumps from this changeset
    via `updateInternalDependencies: "patch"` so version traceability
    is preserved in the CHANGELOG.

  Pipeline:

  - `.github/workflows/release.yml` now runs `bun changeset publish`
    (was `tag`) with `setup-node` for `~/.npmrc` auth and a fresh
    build before publish.
  - `.github/workflows/real-figma.yml` (new, `workflow_dispatch`) runs
    the gated golden suite against a public test file with the
    `FIGMA_API_KEY` secret. `RECORD=1` refreshes fixtures.

  Docs:

  - `README.md` and `CONTRIBUTING.md` rewritten for the product.
  - `apps/docs/content/docs/` reset: new `index`, quickstart,
    per-AI-client install pages (claude-code, claude-desktop, cursor,
    windsurf, copilot), architecture overview, troubleshooting.
  - Template-flavored pages removed.

  Out of scope: Figma Community plugin submission (manual external
  action), publishing internal libs to npm (deferred to v1.1+),
  cutting the actual `git tag v1.0.0` (manual after Changesets PR
  merge).

- Updated dependencies [[`c4f8119`](https://github.com/bromso/bro/commit/c4f81196f21eb3d0644a941d77397dfdd786621f), [`b0e89c6`](https://github.com/bromso/bro/commit/b0e89c67da1218cd5f45d00553854d5a41c36061), [`b13db4a`](https://github.com/bromso/bro/commit/b13db4a63fb71e635cfeb733389942bf2e687ac9), [`2d6271f`](https://github.com/bromso/bro/commit/2d6271f55ae36978972eb09532e6ceeeb145edfc)]:
  - @repo/protocol@0.1.0
