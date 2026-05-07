---
"@repo/tools-console": minor
"@repo/tools-design": minor
"@repo/figma-adapter": minor
"@bromso/figma-mcp": minor
"@repo/bridge-plugin": minor
---

Phase 8: Feature pack expansion (console + design).

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
