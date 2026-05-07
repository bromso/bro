# @repo/tools-console

## 0.1.3

### Patch Changes

- Updated dependencies [[`bbbedc9`](https://github.com/bromso/bro/commit/bbbedc93cd008f187efaf8e823c825698882f3a5)]:
  - @repo/figma-adapter@0.4.0
  - @repo/protocol@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`ee1ef8b`](https://github.com/bromso/bro/commit/ee1ef8be73c70ab7cd2515f22df73a1bbef35a48)]:
  - @repo/figma-adapter@0.3.0
  - @repo/protocol@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`38b52a2`](https://github.com/bromso/bro/commit/38b52a2a907c387f9fa6f6f8b1f20b3ee9f1d66f)]:
  - @repo/figma-adapter@0.2.0
  - @repo/protocol@0.1.1

## 0.1.0

### Minor Changes

- [#10](https://github.com/bromso/bro/pull/10) [`4dfac62`](https://github.com/bromso/bro/commit/4dfac623010452e2ad1bad8646c28565de043753) Thanks [@bromso](https://github.com/bromso)! - Phase 8: Feature pack expansion (console + design).

  Two new tool packs ship together, bringing the registry from
  ~5 to ~23 tools.

  `@repo/tools-console` (new): 6 tools backed by an in-memory
  ring buffer (cap 1000 entries; drop-oldest):

  - `get_console_logs` — recent entries, optional limit.
  - `clear_console` — empties the buffer; reports cleared count.
  - `get_console_errors` — entries at level=error only.
  - `get_console_warnings` — entries at level=warn only.
  - `query_console` — regex filter on message text.
  - `console_status` — total + per-level + droppedCount.

  The bridge plugin patches `console.{log,warn,error,info}` at
  boot via `installConsoleCapture()` and exposes the resulting
  `ConsoleStore` to handlers through a module-level setter.

  `@repo/tools-design` (new): 12 tools for node creation/editing:

  - Node creation: `create_rectangle`, `create_frame`,
    `create_ellipse`, `create_line`, `create_text`.
  - Property mutators: `set_text_content`, `set_fill`,
    `set_stroke`.
  - Node lifecycle: `resize_node`, `clone_node`, `delete_node`,
    `create_component`.

  Inputs use Zod strict schemas; outputs return minimal
  `{nodeId, type}` shapes — callers can chain
  `getNodeById` (adapter-side) for full state.

  `@repo/figma-adapter` (extended): adds 11 methods plus the
  `FrameNode`/`TextNode`/`EllipseNode`/`LineNode`/`SolidPaint`/
  `NodeSnapshot` types. `FigmaFake` mirrors all methods with
  deterministic id generation; `RealFigmaAdapter` wraps the
  matching `figma.*` calls.

  Out of scope: `@repo/tools-figjam`, `@repo/tools-slides`,
  `@repo/tools-a11y`, `@repo/tools-rest` (each becomes its own
  follow-up phase). Real-Figma smoke runs (Phase 9).
  Telemetry on tool usage. Tool versioning / deprecation.

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
  - @repo/protocol@0.1.0
