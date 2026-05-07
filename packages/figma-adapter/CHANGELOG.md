# @repo/figma-adapter

## 0.3.0

### Minor Changes

- [#18](https://github.com/bromso/bro/pull/18) [`ee1ef8b`](https://github.com/bromso/bro/commit/ee1ef8be73c70ab7cd2515f22df73a1bbef35a48) Thanks [@bromso](https://github.com/bromso)! - Phase 12: tools-slides pack.

  A new tool pack ships, bringing the registry from ~53 to ~68 tools.

  `@repo/tools-slides` (new): 15 tools for Figma Slides files. Every tool is
  gated on `figma.editorType === "slides"`; calling on a Figma or FigJam
  editor returns `E_FIGMA_EDITOR_TYPE_MISMATCH` from the plugin handler.

  - Slide creation: `create_slide`, `create_slide_row`, `duplicate_slide`.
  - Slide metadata: `set_slide_name`, `set_slide_skipped`,
    `set_slide_background`, `set_slide_transition`.
  - Slide lifecycle: `move_slide`, `delete_slide`.
  - Queries: `list_slides`, `list_slide_rows`, `get_slide`, `get_slide_grid`.
  - Focus + view: `set_active_slide`, `set_slides_view`.

  The `requireSlides(figma, toolName)` guard helper is exported from
  the package for downstream reuse. The wire error code
  `E_FIGMA_EDITOR_TYPE_MISMATCH` is the same code Phase 10's FigJam
  guard surfaces — the daemon does not distinguish "wrong editor"
  between FigJam and Slides packs.

  `@repo/figma-adapter` (extended): adds the `SlideNode`, `SlideRowNode`
  types and supporting types (`SlideTransition`, `SlideTransitionStyle`,
  `SlideTransitionCurve`, `SlideTransitionTimingType`, `SlidesView`)
  plus 17 new methods (`createSlide`, `createSlideRow`, `setSlideName`,
  `setSlideSkipped`, `setSlideTransition`, `getSlideTransition`,
  `setSlideBackground`, `moveSlide`, `duplicateSlide`, `deleteSlide`,
  `listSlides`, `listSlideRows`, `setActiveSlide`, `getActiveSlideId`,
  `setSlidesView`, `getSlidesView`, `getSlideGrid`). `FigmaFake` mirrors
  all methods with deterministic id generation (`sld1`, `slr1`);
  `RealFigmaAdapter` wraps the matching `figma.*` calls (`figma.createSlide`,
  `figma.createSlideRow`, `figma.getSlideGrid`, `figma.setSlideGrid`,
  `slide.setSlideTransition`, `slide.getSlideTransition`,
  `slide.isSkippedSlide`, `figma.currentPage.focusedSlide`,
  `figma.viewport.slidesView`, `slide.clone`).

  The adapter methods themselves do NOT enforce the editor-type
  discriminator — that's the tool handler's responsibility, so the
  adapter remains testable on any editor.

  Out of scope: `@repo/tools-a11y` (audit / lint / annotation tools).
  Programmatic presentation mode, audience pointer, cursor chat,
  embedded interactive slide elements (polls / facepile / YouTube),
  slide layout templates, speaker notes (no plugin API), slide
  thumbnail tinting (no plugin API), `slidesviewchange` event
  subscription. A real-figma golden test for Slides (Task 12.11
  ships a skipped stub documenting why; Slides REST coverage is
  shallow and the round-trip value is low for plugin-side tools).

## 0.2.0

### Minor Changes

- [#15](https://github.com/bromso/bro/pull/15) [`38b52a2`](https://github.com/bromso/bro/commit/38b52a2a907c387f9fa6f6f8b1f20b3ee9f1d66f) Thanks [@bromso](https://github.com/bromso)! - Phase 10: tools-figjam pack.

  A new tool pack ships, bringing the registry from ~23 to ~33 tools.

  `@repo/tools-figjam` (new): 10 tools for FigJam files. Every tool is
  gated on `figma.editorType === "figjam"`; calling on a Figma or Slides
  editor returns `E_FIGMA_EDITOR_TYPE_MISMATCH` from the plugin handler.

  - Node creation: `create_sticky`, `create_section`, `create_connector`,
    `create_code_block`, `create_shape_with_text`, `create_table`.
  - Mutators: `set_sticky_content`, `set_section_name`.
  - Section membership: `move_into_section`, `list_section_children`.

  The `requireFigJam(figma, toolName)` guard helper is exported from
  the package for downstream reuse.

  `@repo/figma-adapter` (extended): adds the `StickyNode`, `SectionNode`,
  `ConnectorNode`, `CodeBlockNode`, `ShapeWithTextNode`, `TableNode` types
  plus 10 new methods (`createSticky`, `createSection`, `createConnector`,
  `createCodeBlock`, `createShapeWithText`, `createTable`,
  `setStickyContent`, `setSectionName`, `moveIntoSection`,
  `listSectionChildren`). `FigmaFake` mirrors all methods with
  deterministic id generation (`stk1`, `sec1`, `cn1`, `cb1`, `swt1`,
  `tbl1`); `RealFigmaAdapter` wraps the matching `figma.*` calls.

  The adapter methods themselves do NOT enforce the editor-type
  discriminator — that's the tool handler's responsibility, so the
  adapter remains testable on any editor.

  Out of scope: `@repo/tools-slides`, `@repo/tools-a11y`,
  `@repo/tools-rest` (each becomes its own follow-up phase). FigJam
  widgets, timer/voting/cursor-chat, multi-board support, connector
  geometry/labels, sticky styling beyond `content` + `authorName`. A
  real-figma golden test for FigJam (Task 10.10 ships a skipped stub
  documenting why; the REST API's FigJam coverage is too thin for the
  Phase 9 round-trip pattern).

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
