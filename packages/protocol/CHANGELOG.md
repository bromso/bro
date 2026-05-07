# @repo/protocol

## 0.1.2

### Patch Changes

- Updated dependencies [[`ee1ef8b`](https://github.com/bromso/bro/commit/ee1ef8be73c70ab7cd2515f22df73a1bbef35a48)]:
  - @repo/figma-adapter@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`38b52a2`](https://github.com/bromso/bro/commit/38b52a2a907c387f9fa6f6f8b1f20b3ee9f1d66f)]:
  - @repo/figma-adapter@0.2.0

## 0.1.0

### Minor Changes

- [#2](https://github.com/bromso/bro/pull/2) [`c4f8119`](https://github.com/bromso/bro/commit/c4f81196f21eb3d0644a941d77397dfdd786621f) Thanks [@bromso](https://github.com/bromso)! - Phase 2: WebSocket transport (server + client + correlator + reconnect),
  FigmaAdapter type contract with FigmaFake test double, and protocol's
  PluginHandlerContext now holds a real FigmaAdapter instead of a
  placeholder. No published package consumes these yet — all `private: true`.

- [#4](https://github.com/bromso/bro/pull/4) [`b0e89c6`](https://github.com/bromso/bro/commit/b0e89c67da1218cd5f45d00553854d5a41c36061) Thanks [@bromso](https://github.com/bromso)! - Phase 4: bridge plugin replaces the deleted apps/design-plugin.

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

- Updated dependencies [[`c4f8119`](https://github.com/bromso/bro/commit/c4f81196f21eb3d0644a941d77397dfdd786621f), [`2e45637`](https://github.com/bromso/bro/commit/2e45637341801a5959cf1f1be638e54d6991ed0b), [`b0e89c6`](https://github.com/bromso/bro/commit/b0e89c67da1218cd5f45d00553854d5a41c36061), [`b13db4a`](https://github.com/bromso/bro/commit/b13db4a63fb71e635cfeb733389942bf2e687ac9), [`4dfac62`](https://github.com/bromso/bro/commit/4dfac623010452e2ad1bad8646c28565de043753), [`2d6271f`](https://github.com/bromso/bro/commit/2d6271f55ae36978972eb09532e6ceeeb145edfc)]:
  - @repo/figma-adapter@0.1.0
