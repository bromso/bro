# Phase 12: tools-slides pack

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ship `@repo/tools-slides` — ~15 tools for Figma Slides files: slide creation, reordering, layout, transitions, speaker notes, presentation mode. Brings the registry from ~53 to ~68 tools.

**Architecture:** Mirrors Phase 10 figjam pack: adapter extensions on `FigmaAdapter`, `FigmaFake` mirror, tool schemas + plugin handlers in `packages/tools-slides/`. Editor-type discriminator gates every tool: when `figma.editorType !== "slides"`, the handler throws `E_FIGMA_EDITOR_TYPE_MISMATCH` before touching any API. The `requireSlides(figma, toolName)` helper is the single guard.

**Tech Stack:** Existing — Bun + Vitest + Zod + the Phase 1–11 infrastructure. No new runtime deps.

---

## Plugin API verification (locked tool list)

The wishful list in the brief was reconciled against `@figma/plugin-typings@1.125.0`'s `plugin-api.d.ts`. Several wishlist items don't map to real plugin API surface; they're swapped for tools that do. Each translation is documented inline.

**Confirmed plugin API surface (Slides-only):**

- `figma.createSlide(row?: number, col?: number): SlideNode` — **positional** row/col args. There is **no** `slideType` parameter; layouts beyond a default blank slide cannot be set programmatically.
- `figma.createSlideRow(row?: number): SlideRowNode`.
- `figma.getSlideGrid(): SlideNode[][]` and `figma.setSlideGrid(grid: SlideNode[][]): void` — the canonical primitive for reordering / moving slides across rows. The 2D array's outer dimension is rows.
- `SlideNode extends BaseFrameMixin` — therefore the slide's title surface is its `name` (BaseFrameMixin), and its background is `fills` (DefaultFrameMixin via BaseFrameMixin). Slides are themselves frames.
- `SlideRowNode extends OpaqueNodeMixin, ChildrenMixin` — has `id`, `children`, `name`. Cannot be reordered via `setSlideGrid` (the grid takes slide nodes only); rows are recreated implicitly via grid mutation.
- `slide.getSlideTransition(): SlideTransition` and `slide.setSlideTransition(t: SlideTransition): void` — NOT a `transition` property; **methods**. The `SlideTransition` interface is `{ style, duration, curve, timing: {type, delay?} }`. Style is a fixed enum of 23 values (NONE, DISSOLVE, SLIDE_FROM_*, PUSH_FROM_*, MOVE_FROM_*, SLIDE_OUT_TO_*, MOVE_OUT_TO_*, SMART_ANIMATE).
- `slide.isSkippedSlide: boolean` — read/write. Closest plugin-API analog to "speaker notes / metadata"; we surface it as `set_slide_skipped`.
- `slide.clone(): SlideNode` — duplicates the slide.
- `figma.viewport.slidesView: 'grid' | 'single-slide'` — read/write viewport mode.
- `figma.currentPage.focusedSlide: SlideNode | null` — set/read focused slide. THIS is how you focus a slide programmatically — no `scrollAndZoomIntoSlide` exists for slides.
- `SlideGridNode` (the parent grid container) is **opaque** — `clone()` throws. It exists in the node graph but is not directly mutable; `figma.setSlideGrid` is the canonical write path.

**Wishlist items that do NOT map to plugin API (and are dropped or swapped):**

| Wishlist tool                         | Plugin API status                                                                                                                | Swap in                                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `create_slide({slideType: "TITLE"})`  | NOT in plugin API. `figma.createSlide()` accepts only `(row?, col?)`. Layout templates aren't reachable.                         | `create_slide` keeps `rowIndex` + `columnIndex` + an optional `name` (writes `slide.name`).            |
| `set_slide_layout({layout})`          | NOT in plugin API. Slide layouts are in-product templates; the plugin runtime can't switch a slide's layout enum.                | Drop. Replaced by `set_slide_name` (directly writes the slide's BaseFrameMixin `name`).                |
| `set_slide_title({text})`             | Slide title is the slide's `name` (BaseFrameMixin), not a separate placeholder.                                                  | Folded into `set_slide_name` (which is what "title" is, plugin-API-wise).                              |
| `set_speaker_notes({text})`           | NOT in plugin API. There is no `slide.notes` property exposed.                                                                   | `set_slide_skipped({skipped})` — the only slide-level metadata flag the API exposes (`isSkippedSlide`). |
| `set_slide_thumbnail_color({color})`  | NOT in plugin API. Thumbnail tinting is product UI, not plugin-reachable.                                                        | `set_slides_view({view})` — toggles the editor's grid/single-slide viewport (also a product UX knob, but actually exposed). |
| `set_active_slide({slideId})`         | Maps to `figma.currentPage.focusedSlide = slide`, NOT a `scrollAndZoomIntoSlide` call.                                           | Kept; rewires to the `focusedSlide` property.                                                          |
| `get_slide({slideId})`                | Maps. Returns `{ id, name, hasNotes (always false — no notes API), transition, isSkipped, fills }`.                              | Kept; the `hasNotes` field is dropped from the output (no API surface) and replaced with `isSkipped`. |
| Programmatic presentation mode        | NOT in plugin API. Cannot start/stop a deck programmatically. Audience pointer / cursor chat / slide templates also out.         | Out of scope — flagged in "Out of scope".                                                              |

**Locked tool list (15 tools, all plugin-API-backed):**

1. `create_slide({name?, rowIndex?, columnIndex?})`
2. `create_slide_row({rowIndex?})`
3. `set_slide_name({slideId, name})`
4. `set_slide_skipped({slideId, skipped})`
5. `set_slide_transition({slideId, style, durationSec?, curve?, timingType?, timingDelaySec?})`
6. `set_slide_background({slideId, paint})`
7. `move_slide({slideId, rowIndex, columnIndex})`
8. `duplicate_slide({slideId})`
9. `delete_slide({slideId})`
10. `list_slides({rowIndex?})`
11. `list_slide_rows()`
12. `set_active_slide({slideId})`
13. `get_slide({slideId})`
14. `set_slides_view({view})`
15. `get_slide_grid()`

This is the full set Tasks 12.3–12.7 implement.

---

## Out of scope (call-out so the executor doesn't drift)

- **`@repo/tools-a11y`.** Audit / lint / annotation tools. Separate phase.
- **Programmatic presentation mode.** No `figma.startPresentation()`. Audience pointer, cursor chat, audience analytics, embedded polls / facepile / YouTube interactives are NOT reachable as write operations (the `InteractiveSlideElementNode` exists but `figma.createInteractiveSlideElement` does not — they are rendered, not authored, by plugins).
- **AI-assisted slide generation.** Not a plugin API capability; a higher-level workflow.
- **Slide layout templates.** No plugin API to switch a slide's layout enum (TITLE / SECTION / CONTENT, etc.). Only the slide's `name` and `fills` are programmatically settable.
- **Speaker notes / slide notes.** No plugin API surface; we expose `set_slide_skipped` instead, which is the only slide-level metadata flag the API exposes.
- **Slide thumbnail tinting.** No plugin API surface.
- **`InteractiveSlideElementNode` creation.** Read-only via children traversal. We do not author polls / embeds / facepiles / alignment widgets / YouTube embeds.
- **`SlotNode` (template slots).** Slides have a slot system for presets that the plugin API exposes only for read access. Out of scope.
- **Smart animate inter-frame matching.** A `SMART_ANIMATE` transition style is acceptable as a value to `set_slide_transition`, but the plugin API does not let us configure layer-by-layer matching beyond the runtime's defaults.
- **Modifying the SlideGridNode directly.** `figma.setSlideGrid` is the only write path; we do not fish out the grid node and mutate its children.
- **`slidesviewchange` event subscription.** The runtime emits this, but our pack model is request/response — events would be Phase 12+x.
- **Real-Figma smoke runs against a live Slides file.** Same posture as Phase 10's FigJam stub. The `/v1/files/<key>?depth=1` REST endpoint exposes Slides node trees but the canonical schema is undocumented and the round-trip value is low. Task 12.11 ships an `it.skip` stub with TODO; full coverage is left to a follow-up phase.
- **Editor-type round-tripping in `e2e.test.ts`.** Task 12.10 adds one focused test; the broader e2e suite continues to assume `editorType: "figma"`.
- **Tool versioning / deprecation channels.** Tools are added; nothing is removed or renamed.
- **Telemetry on tool usage.** No analytics, no opt-in flow.
- **Cross-pack integration tests.** Each pack's tests are isolated against `FigmaFake({editorType: "slides"})`. The Task 12.9 e2e catalog test asserts only registration.
- **Beyond the existing six error categories.** Validation errors stay `E_PROTOCOL_INVALID`; adapter throws stay `E_FIGMA_UNKNOWN`; editor-type mismatches surface as `E_FIGMA_EDITOR_TYPE_MISMATCH` (the same wire code Phase 10 introduced — Phase 12 reuses it verbatim for Slides).
- **Deferred items inherited:** Phase 7 Windows IPC fix; Phase 8 `query_console` regex DoS hardening; Phase 11 doctor `figma-api-key` check.

---

## Acceptance Criteria

- `packages/tools-slides/` exists with 15 tool definitions (`create_slide`, `create_slide_row`, `set_slide_name`, `set_slide_skipped`, `set_slide_transition`, `set_slide_background`, `move_slide`, `duplicate_slide`, `delete_slide`, `list_slides`, `list_slide_rows`, `set_active_slide`, `get_slide`, `set_slides_view`, `get_slide_grid`) and per-tool plugin handlers.
- Every plugin handler in `packages/tools-slides/src/plugin-handlers.ts` calls `requireSlides(figma, "<tool_name>")` (Task 12.8) and throws `E_FIGMA_EDITOR_TYPE_MISMATCH` when the adapter reports `editorType !== "slides"`.
- `FigmaAdapter` interface in `packages/figma-adapter/src/adapter.ts` extends with the 2 new node types (`SlideNode`, `SlideRowNode`) and the 12 new methods listed in Task 12.1; `FigmaFake` implements them deterministically (`sld1`, `slr1`); `RealFigmaAdapter` wraps the corresponding `figma.*` calls.
- Adapter methods themselves do NOT enforce the editor-type discriminator. The check lives in the **tool handler** so downstream callers (and tests) can still exercise the methods on a non-Slides adapter when needed.
- `apps/mcp-server/src/main.ts` registers `tools-slides` alongside `tools-extract`, `tools-variables`, `tools-console`, `tools-design`, `tools-figjam`, and `tools-rest`. The shim's `tools` array is extended with all 15 new tool schemas.
- `apps/bridge-plugin/src/plugin.ts` registers the 15 plugin handlers on the runtime.
- An end-to-end catalog test asserts every Phase 12 tool name appears in the daemon's catalog (mirrors Phase 10's `e2e-phase10-catalog.test.ts`).
- A wire-level mismatch test asserts that calling a slides tool against a `FigmaFake({editorType: "figma"})` returns `E_FIGMA_EDITOR_TYPE_MISMATCH`.
- Per-pack coverage ≥90/85/90/90 (lines/branches/functions/statements). `packages/figma-adapter` retains its existing bar.
- Phase 12 changeset under `.changeset/phase-12-tools-slides.md`. The changeset bumps `@bromso/figma-mcp`, `@repo/tools-slides`, and `@repo/figma-adapter` (all minor).
- Commit hygiene: each task ends with one conventional-commit-formatted commit. No multi-task commits. No `git add -A`.

---

## Task Map

| #     | Task                                                                                  | Package / App         | Type        |
| ----- | ------------------------------------------------------------------------------------- | --------------------- | ----------- |
| 12.1  | Adapter extensions (2 node types, 12 methods, fake + real)                            | figma-adapter         | code        |
| 12.2  | `@repo/tools-slides` package scaffold                                                 | tools-slides (new)    | infra       |
| 12.3  | `tools-slides`: `create_slide`, `create_slide_row`                                    | tools-slides          | code        |
| 12.4  | `tools-slides`: `set_slide_name`, `set_slide_skipped`                                 | tools-slides          | code        |
| 12.5  | `tools-slides`: `set_slide_transition`, `set_slide_background`                        | tools-slides          | code        |
| 12.6  | `tools-slides`: `move_slide`, `duplicate_slide`, `delete_slide`                       | tools-slides          | code        |
| 12.7  | `tools-slides`: `list_slides`, `list_slide_rows`, `set_active_slide`, `get_slide`, `set_slides_view`, `get_slide_grid` | tools-slides          | code        |
| 12.8  | Editor-type guard helper (`requireSlides`) + handler refactor                         | tools-slides          | code        |
| 12.9  | Wire `tools-slides` into mcp-server + bridge-plugin + e2e catalog test                | mcp-server + bridge   | code/tests  |
| 12.10 | Editor-type-mismatch wire-level e2e test                                              | mcp-server            | tests       |
| 12.11 | Real-Figma slides fixture stub (skipped by default)                                   | mcp-server            | tests       |
| 12.12 | Coverage gate + Phase 12 changeset + acceptance                                       | repo                  | infra       |

---

## Task 12.1: Adapter extensions for slides tools

**Goal:** Extend `FigmaAdapter` with the 2 Slides node types plus the 12 methods that the Slides tools depend on. Mirror in `FigmaFake` (deterministic id generation: `sld1`, `slr1`) and in `RealFigmaAdapter` (wraps `figma.createSlide`, `figma.createSlideRow`, etc. — the `@figma/plugin-typings` package exposes these factories for `editorType === "slides"`).

**Crucially:** the new methods do NOT themselves check `editorType`. The check happens in the tool handler (Task 12.8). This keeps the adapter callable from any caller who has already proved they're in a Slides runtime, and makes unit testing the adapter independent of editor-type wiring.

**Files:**

- Modify: `packages/figma-adapter/src/adapter.ts` (add 2 types + 12 method signatures + slide-related helper types)
- Modify: `packages/figma-adapter/src/figma-fake.ts` (implement methods + add seeders)
- Modify: `packages/figma-adapter/src/real-figma-adapter.ts` (wrap `figma.*`)
- Modify: `packages/figma-adapter/src/index.ts` (re-export new types)
- Modify: `packages/figma-adapter/src/__tests__/figma-fake.test.ts` (extend)
- Modify: `packages/figma-adapter/src/__tests__/real-figma-adapter.test.ts` (extend)

### Step 1: Failing tests for `FigmaFake` — append to `figma-fake.test.ts`

```ts
describe("FigmaFake.createSlide", () => {
  it("creates a SLIDE node with a sld-prefixed id and appends to the last row", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    const b = await fake.createSlide({});
    expect(a.type).toBe("SLIDE");
    expect(a.id).toMatch(/^sld/);
    expect(a.id).not.toBe(b.id);
    const grid = await fake.getSlideGrid();
    expect(grid.length).toBeGreaterThan(0);
    expect(grid[grid.length - 1]).toContain(a.id);
  });

  it("respects optional name", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({ name: "Intro" });
    expect(slide.name).toBe("Intro");
  });

  it("places at (rowIndex, columnIndex) when supplied", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await fake.createSlideRow({}); // ensure row 0 + row 1 exist
    await fake.createSlideRow({});
    const slide = await fake.createSlide({ rowIndex: 1, columnIndex: 0 });
    const grid = await fake.getSlideGrid();
    expect(grid[1][0]).toBe(slide.id);
  });

  it("auto-extends the grid when (rowIndex) exceeds existing rows", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({ rowIndex: 5 });
    const grid = await fake.getSlideGrid();
    expect(grid.length).toBeGreaterThanOrEqual(6);
    expect(grid[5]).toContain(slide.id);
  });
});

describe("FigmaFake.createSlideRow", () => {
  it("creates a SLIDE_ROW node with a slr-prefixed id, appended at the end", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const r = await fake.createSlideRow({});
    expect(r.type).toBe("SLIDE_ROW");
    expect(r.id).toMatch(/^slr/);
    const rows = await fake.listSlideRows();
    expect(rows[rows.length - 1]).toBe(r.id);
  });

  it("inserts at a given rowIndex when supplied", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await fake.createSlideRow({});
    await fake.createSlideRow({});
    const r = await fake.createSlideRow({ rowIndex: 0 });
    const rows = await fake.listSlideRows();
    expect(rows[0]).toBe(r.id);
  });
});

describe("FigmaFake.setSlideName", () => {
  it("rewrites the name of an existing slide", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({ name: "Old" });
    await fake.setSlideName({ slideId: slide.id, name: "New" });
    const node = await fake.getNodeById({ nodeId: slide.id });
    expect((node as { name?: string }).name).toBe("New");
  });

  it("rejects non-slide nodes", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const row = await fake.createSlideRow({});
    await expect(
      fake.setSlideName({ slideId: row.id, name: "X" })
    ).rejects.toThrow(/slide/i);
  });

  it("rejects unknown slideId", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(
      fake.setSlideName({ slideId: "missing", name: "X" })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.setSlideSkipped", () => {
  it("toggles isSkippedSlide", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({});
    await fake.setSlideSkipped({ slideId: slide.id, skipped: true });
    const node = await fake.getNodeById({ nodeId: slide.id });
    expect((node as { isSkipped?: boolean }).isSkipped).toBe(true);
    await fake.setSlideSkipped({ slideId: slide.id, skipped: false });
    const node2 = await fake.getNodeById({ nodeId: slide.id });
    expect((node2 as { isSkipped?: boolean }).isSkipped).toBe(false);
  });

  it("rejects non-slide nodes", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const row = await fake.createSlideRow({});
    await expect(
      fake.setSlideSkipped({ slideId: row.id, skipped: true })
    ).rejects.toThrow(/slide/i);
  });
});

describe("FigmaFake.setSlideTransition", () => {
  it("stores the transition object on the slide", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({});
    await fake.setSlideTransition({
      slideId: slide.id,
      style: "DISSOLVE",
      durationSec: 0.4,
      curve: "EASE_IN_AND_OUT",
      timingType: "ON_CLICK",
    });
    const t = await fake.getSlideTransition({ slideId: slide.id });
    expect(t.style).toBe("DISSOLVE");
    expect(t.duration).toBe(0.4);
    expect(t.curve).toBe("EASE_IN_AND_OUT");
    expect(t.timing.type).toBe("ON_CLICK");
  });

  it("rejects non-slide nodes", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const row = await fake.createSlideRow({});
    await expect(
      fake.setSlideTransition({ slideId: row.id, style: "NONE" })
    ).rejects.toThrow(/slide/i);
  });
});

describe("FigmaFake.setSlideBackground", () => {
  it("writes a SOLID paint to the slide's fills", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({});
    await fake.setSlideBackground({
      slideId: slide.id,
      paint: { type: "SOLID", color: { r: 0, g: 0.5, b: 1 } },
    });
    const node = await fake.getNodeById({ nodeId: slide.id });
    const fills = (node as { fills?: ReadonlyArray<SolidPaint> }).fills;
    expect(fills?.[0]).toMatchObject({
      type: "SOLID",
      color: { r: 0, g: 0.5, b: 1 },
    });
  });
});

describe("FigmaFake.moveSlide", () => {
  it("repositions a slide within the grid", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await fake.createSlideRow({}); // row 0
    await fake.createSlideRow({}); // row 1
    const a = await fake.createSlide({ rowIndex: 0, columnIndex: 0 });
    await fake.createSlide({ rowIndex: 1, columnIndex: 0 });
    await fake.moveSlide({ slideId: a.id, rowIndex: 1, columnIndex: 1 });
    const grid = await fake.getSlideGrid();
    expect(grid[0]).not.toContain(a.id);
    expect(grid[1][1]).toBe(a.id);
  });

  it("rejects unknown slide ids", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(
      fake.moveSlide({ slideId: "missing", rowIndex: 0, columnIndex: 0 })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.duplicateSlide", () => {
  it("creates a new SLIDE with a fresh id, appended after the source", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({ name: "Intro" });
    const dup = await fake.duplicateSlide({ slideId: a.id });
    expect(dup.id).not.toBe(a.id);
    expect(dup.id).toMatch(/^sld/);
    expect(dup.type).toBe("SLIDE");
    expect(dup.name).toBe("Intro");
  });

  it("rejects unknown slide ids", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(
      fake.duplicateSlide({ slideId: "missing" })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.deleteSlide", () => {
  it("removes the slide from the grid + node map", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    await fake.deleteSlide({ slideId: a.id });
    await expect(
      fake.getNodeById({ nodeId: a.id })
    ).rejects.toThrow(/not found/i);
    const grid = await fake.getSlideGrid();
    for (const row of grid) expect(row).not.toContain(a.id);
  });

  it("is a no-op error when the id does not exist", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(
      fake.deleteSlide({ slideId: "missing" })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.listSlides", () => {
  it("returns every slide id when rowIndex is omitted", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    const b = await fake.createSlide({});
    expect(await fake.listSlides({})).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it("returns the slides in a single row when rowIndex is supplied", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await fake.createSlideRow({});
    const a = await fake.createSlide({ rowIndex: 0, columnIndex: 0 });
    const b = await fake.createSlide({ rowIndex: 0, columnIndex: 1 });
    const c = await fake.createSlide({ rowIndex: 1, columnIndex: 0 });
    expect(await fake.listSlides({ rowIndex: 0 })).toEqual([a.id, b.id]);
    expect(await fake.listSlides({ rowIndex: 1 })).toEqual([c.id]);
  });

  it("rejects an out-of-range rowIndex", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(
      fake.listSlides({ rowIndex: 99 })
    ).rejects.toThrow(/row.*not found/i);
  });
});

describe("FigmaFake.listSlideRows", () => {
  it("returns row ids in grid order", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const r0 = await fake.createSlideRow({});
    const r1 = await fake.createSlideRow({});
    const rows = await fake.listSlideRows();
    expect(rows).toEqual(expect.arrayContaining([r0.id, r1.id]));
    expect(rows.indexOf(r0.id)).toBeLessThan(rows.indexOf(r1.id));
  });
});

describe("FigmaFake.setActiveSlide", () => {
  it("records the focused slide id", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    await fake.setActiveSlide({ slideId: a.id });
    expect(await fake.getActiveSlideId()).toBe(a.id);
  });

  it("rejects unknown ids", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(
      fake.setActiveSlide({ slideId: "missing" })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.setSlidesView", () => {
  it("toggles between grid and single-slide", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await fake.setSlidesView({ view: "single-slide" });
    expect(await fake.getSlidesView()).toBe("single-slide");
    await fake.setSlidesView({ view: "grid" });
    expect(await fake.getSlidesView()).toBe("grid");
  });
});

describe("FigmaFake.getSlideGrid", () => {
  it("returns a 2D array of slide ids", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    const grid = await fake.getSlideGrid();
    expect(Array.isArray(grid)).toBe(true);
    expect(Array.isArray(grid[0])).toBe(true);
    expect(grid.flat()).toContain(a.id);
  });
});
```

Run: `bun run --filter @repo/figma-adapter test figma-fake` → FAIL.

### Step 2: Extend the interface and node types — `packages/figma-adapter/src/adapter.ts`

Append (after the FigJam additions from Phase 10):

```ts
export interface SlideNode {
  readonly id: string;
  readonly type: "SLIDE";
  readonly name: string;
  readonly isSkipped: boolean;
  readonly fills: readonly SolidPaint[];
  readonly width: number;
  readonly height: number;
}

export interface SlideRowNode {
  readonly id: string;
  readonly type: "SLIDE_ROW";
  readonly name: string;
}

export type SlideTransitionStyle =
  | "NONE"
  | "DISSOLVE"
  | "SLIDE_FROM_LEFT"
  | "SLIDE_FROM_RIGHT"
  | "SLIDE_FROM_TOP"
  | "SLIDE_FROM_BOTTOM"
  | "PUSH_FROM_LEFT"
  | "PUSH_FROM_RIGHT"
  | "PUSH_FROM_TOP"
  | "PUSH_FROM_BOTTOM"
  | "MOVE_FROM_LEFT"
  | "MOVE_FROM_RIGHT"
  | "MOVE_FROM_TOP"
  | "MOVE_FROM_BOTTOM"
  | "SLIDE_OUT_TO_LEFT"
  | "SLIDE_OUT_TO_RIGHT"
  | "SLIDE_OUT_TO_TOP"
  | "SLIDE_OUT_TO_BOTTOM"
  | "MOVE_OUT_TO_LEFT"
  | "MOVE_OUT_TO_RIGHT"
  | "MOVE_OUT_TO_TOP"
  | "MOVE_OUT_TO_BOTTOM"
  | "SMART_ANIMATE";

export type SlideTransitionCurve =
  | "EASE_IN"
  | "EASE_OUT"
  | "EASE_IN_AND_OUT"
  | "LINEAR"
  | "GENTLE"
  | "QUICK"
  | "BOUNCY"
  | "SLOW";

export type SlideTransitionTimingType = "ON_CLICK" | "AFTER_DELAY";

export interface SlideTransition {
  readonly style: SlideTransitionStyle;
  readonly duration: number;
  readonly curve: SlideTransitionCurve;
  readonly timing: {
    readonly type: SlideTransitionTimingType;
    readonly delay?: number;
  };
}

export type SlidesView = "grid" | "single-slide";
```

Extend the `FigmaAdapter` interface with the 12 new methods:

```ts
export interface FigmaAdapter {
  // …existing members…

  createSlide(args: {
    name?: string;
    rowIndex?: number;
    columnIndex?: number;
  }): Promise<SlideNode>;

  createSlideRow(args: { rowIndex?: number }): Promise<SlideRowNode>;

  setSlideName(args: { slideId: string; name: string }): Promise<void>;

  setSlideSkipped(args: { slideId: string; skipped: boolean }): Promise<void>;

  setSlideTransition(args: {
    slideId: string;
    style: SlideTransitionStyle;
    durationSec?: number;
    curve?: SlideTransitionCurve;
    timingType?: SlideTransitionTimingType;
    timingDelaySec?: number;
  }): Promise<void>;

  getSlideTransition(args: { slideId: string }): Promise<SlideTransition>;

  setSlideBackground(args: {
    slideId: string;
    paint: SolidPaint;
  }): Promise<void>;

  moveSlide(args: {
    slideId: string;
    rowIndex: number;
    columnIndex: number;
  }): Promise<void>;

  duplicateSlide(args: { slideId: string }): Promise<SlideNode>;

  deleteSlide(args: { slideId: string }): Promise<void>;

  listSlides(args: { rowIndex?: number }): Promise<readonly string[]>;

  listSlideRows(): Promise<readonly string[]>;

  setActiveSlide(args: { slideId: string }): Promise<void>;

  getActiveSlideId(): Promise<string | null>;

  setSlidesView(args: { view: SlidesView }): Promise<void>;

  getSlidesView(): Promise<SlidesView>;

  getSlideGrid(): Promise<readonly (readonly string[])[]>;
}
```

> **Method count note:** the brief calls for "~12 adapter methods". The above adds 17 (12 mutators + 5 getters). The getters are in addition to the canonical "12" because each tool either has a paired getter (e.g. `set_slide_transition` ↔ `getSlideTransition`) or returns adapter state (e.g. `get_slide` reads via `getNodeById`, `get_slide_grid` reads via `getSlideGrid`). The acceptance criteria match this expanded set; the "12 methods" referenced in the brief is the mutator count.

### Step 3: Implement on `FigmaFake` — `packages/figma-adapter/src/figma-fake.ts`

Add internal mutable shapes and counters:

```ts
interface MutableSlideNode {
  id: string;
  type: "SLIDE";
  name: string;
  isSkipped: boolean;
  fills: SolidPaint[];
  width: number;
  height: number;
  transition: SlideTransition;
}

interface MutableSlideRowNode {
  id: string;
  type: "SLIDE_ROW";
  name: string;
}

type AnyMutableNode =
  | // …existing entries from Phases 8 + 10…
  | MutableSlideNode
  | MutableSlideRowNode;

// add to the FigmaFake class:
private slideCounter = 0;
private slideRowCounter = 0;
/** 2D array of slide ids; outer index is row, inner is column. */
private slideGrid: string[][] = [];
/** Ordered list of row node ids matching slideGrid's outer index. */
private slideRowIds: string[] = [];
private focusedSlideId: string | null = null;
private slidesView: SlidesView = "grid";
```

Default slide dimensions (matches Figma Slides — slides default to 1920×1080):

```ts
const DEFAULT_SLIDE_WIDTH = 1920;
const DEFAULT_SLIDE_HEIGHT = 1080;
const DEFAULT_TRANSITION: SlideTransition = {
  style: "NONE",
  duration: 0.3,
  curve: "EASE_IN_AND_OUT",
  timing: { type: "ON_CLICK" },
};
```

Method bodies:

```ts
async createSlide(args: {
  name?: string;
  rowIndex?: number;
  columnIndex?: number;
}): Promise<SlideNode> {
  const id = `sld${++this.slideCounter}`;
  const mutable: MutableSlideNode = {
    id,
    type: "SLIDE",
    name: args.name ?? `Slide ${this.slideCounter}`,
    isSkipped: false,
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
    width: DEFAULT_SLIDE_WIDTH,
    height: DEFAULT_SLIDE_HEIGHT,
    transition: DEFAULT_TRANSITION,
  };
  this.allNodes.set(id, mutable);

  // Ensure at least one row exists.
  if (this.slideRowIds.length === 0) {
    const rowId = `slr${++this.slideRowCounter}`;
    this.allNodes.set(rowId, { id: rowId, type: "SLIDE_ROW", name: `Row ${this.slideRowCounter}` });
    this.slideRowIds.push(rowId);
    this.slideGrid.push([]);
  }

  let row = args.rowIndex ?? this.slideGrid.length - 1;
  // Auto-extend if rowIndex points past the end.
  while (this.slideGrid.length <= row) {
    const rowId = `slr${++this.slideRowCounter}`;
    this.allNodes.set(rowId, { id: rowId, type: "SLIDE_ROW", name: `Row ${this.slideRowCounter}` });
    this.slideRowIds.push(rowId);
    this.slideGrid.push([]);
  }

  const col = args.columnIndex ?? this.slideGrid[row].length;
  if (col < 0 || col > this.slideGrid[row].length) {
    throw new Error(`columnIndex out of range: ${col}`);
  }
  this.slideGrid[row].splice(col, 0, id);

  return this.snapshotSlide(mutable);
}

async createSlideRow(args: { rowIndex?: number }): Promise<SlideRowNode> {
  const id = `slr${++this.slideRowCounter}`;
  const mutable: MutableSlideRowNode = {
    id,
    type: "SLIDE_ROW",
    name: `Row ${this.slideRowCounter}`,
  };
  this.allNodes.set(id, mutable);

  const insertAt = args.rowIndex ?? this.slideRowIds.length;
  if (insertAt < 0 || insertAt > this.slideRowIds.length) {
    throw new Error(`rowIndex out of range: ${insertAt}`);
  }
  this.slideRowIds.splice(insertAt, 0, id);
  this.slideGrid.splice(insertAt, 0, []);

  return { id, type: "SLIDE_ROW", name: mutable.name };
}

async setSlideName(args: { slideId: string; name: string }): Promise<void> {
  const node = this.allNodes.get(args.slideId);
  if (!node) throw new Error(`node not found: ${args.slideId}`);
  if (node.type !== "SLIDE") {
    throw new Error(`expected SLIDE node: ${args.slideId}`);
  }
  node.name = args.name;
}

async setSlideSkipped(args: { slideId: string; skipped: boolean }): Promise<void> {
  const node = this.allNodes.get(args.slideId);
  if (!node) throw new Error(`node not found: ${args.slideId}`);
  if (node.type !== "SLIDE") {
    throw new Error(`expected SLIDE node: ${args.slideId}`);
  }
  node.isSkipped = args.skipped;
}

async setSlideTransition(args: {
  slideId: string;
  style: SlideTransitionStyle;
  durationSec?: number;
  curve?: SlideTransitionCurve;
  timingType?: SlideTransitionTimingType;
  timingDelaySec?: number;
}): Promise<void> {
  const node = this.allNodes.get(args.slideId);
  if (!node) throw new Error(`node not found: ${args.slideId}`);
  if (node.type !== "SLIDE") {
    throw new Error(`expected SLIDE node: ${args.slideId}`);
  }
  node.transition = {
    style: args.style,
    duration: args.durationSec ?? DEFAULT_TRANSITION.duration,
    curve: args.curve ?? DEFAULT_TRANSITION.curve,
    timing: {
      type: args.timingType ?? "ON_CLICK",
      delay: args.timingDelaySec,
    },
  };
}

async getSlideTransition(args: { slideId: string }): Promise<SlideTransition> {
  const node = this.allNodes.get(args.slideId);
  if (!node) throw new Error(`node not found: ${args.slideId}`);
  if (node.type !== "SLIDE") {
    throw new Error(`expected SLIDE node: ${args.slideId}`);
  }
  return node.transition;
}

async setSlideBackground(args: {
  slideId: string;
  paint: SolidPaint;
}): Promise<void> {
  const node = this.allNodes.get(args.slideId);
  if (!node) throw new Error(`node not found: ${args.slideId}`);
  if (node.type !== "SLIDE") {
    throw new Error(`expected SLIDE node: ${args.slideId}`);
  }
  node.fills = [args.paint];
}

async moveSlide(args: {
  slideId: string;
  rowIndex: number;
  columnIndex: number;
}): Promise<void> {
  const node = this.allNodes.get(args.slideId);
  if (!node) throw new Error(`node not found: ${args.slideId}`);
  if (node.type !== "SLIDE") {
    throw new Error(`expected SLIDE node: ${args.slideId}`);
  }
  // Remove from current location.
  for (const row of this.slideGrid) {
    const idx = row.indexOf(args.slideId);
    if (idx >= 0) row.splice(idx, 1);
  }
  // Validate target.
  if (args.rowIndex < 0 || args.rowIndex >= this.slideGrid.length) {
    throw new Error(`rowIndex out of range: ${args.rowIndex}`);
  }
  const targetRow = this.slideGrid[args.rowIndex];
  if (args.columnIndex < 0 || args.columnIndex > targetRow.length) {
    throw new Error(`columnIndex out of range: ${args.columnIndex}`);
  }
  targetRow.splice(args.columnIndex, 0, args.slideId);
}

async duplicateSlide(args: { slideId: string }): Promise<SlideNode> {
  const node = this.allNodes.get(args.slideId);
  if (!node) throw new Error(`node not found: ${args.slideId}`);
  if (node.type !== "SLIDE") {
    throw new Error(`expected SLIDE node: ${args.slideId}`);
  }
  const id = `sld${++this.slideCounter}`;
  const dup: MutableSlideNode = {
    id,
    type: "SLIDE",
    name: node.name,
    isSkipped: node.isSkipped,
    fills: [...node.fills],
    width: node.width,
    height: node.height,
    transition: { ...node.transition, timing: { ...node.transition.timing } },
  };
  this.allNodes.set(id, dup);
  // Append after source.
  outer: for (const row of this.slideGrid) {
    const idx = row.indexOf(args.slideId);
    if (idx >= 0) {
      row.splice(idx + 1, 0, id);
      break outer;
    }
  }
  return this.snapshotSlide(dup);
}

async deleteSlide(args: { slideId: string }): Promise<void> {
  const node = this.allNodes.get(args.slideId);
  if (!node) throw new Error(`node not found: ${args.slideId}`);
  if (node.type !== "SLIDE") {
    throw new Error(`expected SLIDE node: ${args.slideId}`);
  }
  for (const row of this.slideGrid) {
    const idx = row.indexOf(args.slideId);
    if (idx >= 0) row.splice(idx, 1);
  }
  this.allNodes.delete(args.slideId);
  if (this.focusedSlideId === args.slideId) this.focusedSlideId = null;
}

async listSlides(args: { rowIndex?: number }): Promise<readonly string[]> {
  if (args.rowIndex === undefined) {
    return this.slideGrid.flat();
  }
  if (args.rowIndex < 0 || args.rowIndex >= this.slideGrid.length) {
    throw new Error(`row not found: ${args.rowIndex}`);
  }
  return [...this.slideGrid[args.rowIndex]];
}

async listSlideRows(): Promise<readonly string[]> {
  return [...this.slideRowIds];
}

async setActiveSlide(args: { slideId: string }): Promise<void> {
  const node = this.allNodes.get(args.slideId);
  if (!node) throw new Error(`node not found: ${args.slideId}`);
  if (node.type !== "SLIDE") {
    throw new Error(`expected SLIDE node: ${args.slideId}`);
  }
  this.focusedSlideId = args.slideId;
}

async getActiveSlideId(): Promise<string | null> {
  return this.focusedSlideId;
}

async setSlidesView(args: { view: SlidesView }): Promise<void> {
  this.slidesView = args.view;
}

async getSlidesView(): Promise<SlidesView> {
  return this.slidesView;
}

async getSlideGrid(): Promise<readonly (readonly string[])[]> {
  return this.slideGrid.map((r) => [...r]);
}

private snapshotSlide(node: MutableSlideNode): SlideNode {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    isSkipped: node.isSkipped,
    fills: [...node.fills],
    width: node.width,
    height: node.height,
  };
}
```

Extend the existing `snapshot()` method's switch to surface the new node types via `getNodeById`:

```ts
private snapshot(node: AnyMutableNode): NodeSnapshot {
  // …existing branches preserved (rect, frame, text, ellipse, line, sticky, section, connector, codeblock, swt, table)…
  if (node.type === "SLIDE") {
    return {
      id: node.id, type: node.type,
      width: node.width, height: node.height,
      name: node.name,
      fills: [...node.fills],
      isSkipped: node.isSkipped,
    };
  }
  if (node.type === "SLIDE_ROW") {
    return {
      id: node.id, type: node.type,
      name: node.name,
    };
  }
  // …
}
```

Extend `NodeSnapshot` in `adapter.ts` with the new optional fields:

```ts
export interface NodeSnapshot {
  // …existing fields…
  // Phase 12 (slides):
  readonly isSkipped?: boolean;
}
```

> The `name` field is already part of the snapshot from Phase 10's section additions. The `fills` field already exists from Phase 8. Only `isSkipped` is genuinely new.

### Step 4: Implement on `RealFigmaAdapter` — `packages/figma-adapter/src/real-figma-adapter.ts`

Mechanical translation. Each method calls the matching `figma.*()` factory or `node.*` accessor and writes through the result. Key invariants per method:

- `createSlide({rowIndex?, columnIndex?, name?})`:
  ```ts
  const node = (figma as unknown as {
    createSlide: (row?: number, col?: number) => SlideNodeRT;
  }).createSlide(args.rowIndex, args.columnIndex);
  if (args.name !== undefined) node.name = args.name;
  return {
    id: node.id, type: "SLIDE", name: node.name,
    isSkipped: node.isSkippedSlide,
    fills: this.solidPaintsFrom(node.fills),
    width: node.width, height: node.height,
  };
  ```

- `createSlideRow({rowIndex?})`:
  ```ts
  const node = (figma as unknown as {
    createSlideRow: (row?: number) => SlideRowNodeRT;
  }).createSlideRow(args.rowIndex);
  return { id: node.id, type: "SLIDE_ROW", name: node.name };
  ```

- `setSlideName({slideId, name})`: lookup, narrow to SLIDE, assign `node.name = args.name`.

- `setSlideSkipped({slideId, skipped})`: lookup, narrow, assign `node.isSkippedSlide = args.skipped`.

- `setSlideTransition({slideId, style, durationSec?, curve?, timingType?, timingDelaySec?})`: lookup, narrow, build `SlideTransition` object, call `node.setSlideTransition(t)`.

- `getSlideTransition({slideId})`: lookup, narrow, call `node.getSlideTransition()`, map to our flat shape.

- `setSlideBackground({slideId, paint})`: lookup, narrow, assign `node.fills = [args.paint]` (Slides extend BaseFrameMixin → fills are settable).

- `moveSlide({slideId, rowIndex, columnIndex})`: read the grid via `figma.getSlideGrid()`, locate + remove the slide, re-insert at `(rowIndex, columnIndex)`, write via `figma.setSlideGrid(grid)`. Use the rule "all slides must round-trip" — the API requires every slide currently in the grid to appear in the new grid.

- `duplicateSlide({slideId})`: lookup, narrow, call `node.clone()`. The clone is parented to `figma.currentPage` by default; insert into the grid after the source via `setSlideGrid` for deterministic placement.

- `deleteSlide({slideId})`: lookup, narrow, call `node.remove()`.

- `listSlides({rowIndex?})`: read `figma.getSlideGrid()`. If `rowIndex` undefined → flatten + return ids. If supplied → bounds-check + return that row's ids.

- `listSlideRows()`: walk `figma.currentPage.children` for `SlideRowNode` types and return their ids in order. (The Slides plugin API parents slide rows under the page's `SlideGridNode`; in practice the children traversal is `figma.currentPage.children[0].children` if the grid is the first child, but for safety we filter by type.)

- `setActiveSlide({slideId})`: lookup, narrow, assign `(figma.currentPage as { focusedSlide?: SlideNodeRT }).focusedSlide = node`.

- `getActiveSlideId()`: read `(figma.currentPage as { focusedSlide?: SlideNodeRT | null }).focusedSlide?.id ?? null`.

- `setSlidesView({view})`: assign `(figma.viewport as { slidesView: SlidesView }).slidesView = args.view`.

- `getSlidesView()`: read `(figma.viewport as { slidesView: SlidesView }).slidesView`.

- `getSlideGrid()`: call `figma.getSlideGrid()`, map every `SlideNode` to its `.id`, return as `string[][]`.

> `SlideNodeRT` and `SlideRowNodeRT` are local type aliases for the runtime shapes (`@figma/plugin-typings` exposes them only when `editorType === "slides"`). The cast pattern mirrors what Phase 10 used for FigJam factories.

> **Why `figma.setSlideGrid(grid)` is the canonical write path for `moveSlide` + `duplicateSlide` placement.** The plugin API enforces that every existing slide round-trips through `setSlideGrid`; partial updates throw. Both `moveSlide` and `duplicateSlide` therefore read the current grid, mutate the 2D array in memory, and write the whole thing back. This is fine for slide counts up to a few hundred (the typical real-world deck size); the operation is O(n) in slide count.

### Step 5: Failing tests for `RealFigmaAdapter` — append to `real-figma-adapter.test.ts`

Pattern: stub `figma.createSlide`, `figma.createSlideRow`, `figma.getSlideGrid`, `figma.setSlideGrid`, etc. Assert each delegates correctly. One happy + one error path per method.

```ts
describe("RealFigmaAdapter.createSlide", () => {
  it("calls figma.createSlide with row + col, sets name, returns summary", async () => {
    const node = {
      id: "sld1",
      name: "untitled",
      isSkippedSlide: false,
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
      width: 1920,
      height: 1080,
    };
    const figmaStub = stubFigma({
      createSlide: vi.fn().mockReturnValue(node),
    });
    vi.stubGlobal("figma", figmaStub);
    const r = await new RealFigmaAdapter().createSlide({
      name: "Intro",
      rowIndex: 1,
      columnIndex: 0,
    });
    expect(figmaStub.createSlide).toHaveBeenCalledWith(1, 0);
    expect(node.name).toBe("Intro");
    expect(r).toMatchObject({ id: "sld1", type: "SLIDE", name: "Intro" });
  });
});

describe("RealFigmaAdapter.createSlideRow", () => {
  it("calls figma.createSlideRow with the rowIndex", async () => {
    const node = { id: "slr1", name: "Row 1" };
    const figmaStub = stubFigma({
      createSlideRow: vi.fn().mockReturnValue(node),
    });
    vi.stubGlobal("figma", figmaStub);
    const r = await new RealFigmaAdapter().createSlideRow({ rowIndex: 0 });
    expect(figmaStub.createSlideRow).toHaveBeenCalledWith(0);
    expect(r).toEqual({ id: "slr1", type: "SLIDE_ROW", name: "Row 1" });
  });
});

describe("RealFigmaAdapter.setSlideTransition", () => {
  it("delegates to slide.setSlideTransition with the built object", async () => {
    const setSlideTransition = vi.fn();
    const slide = { id: "sld1", type: "SLIDE", setSlideTransition };
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue(slide),
    }));
    await new RealFigmaAdapter().setSlideTransition({
      slideId: "sld1",
      style: "DISSOLVE",
      durationSec: 0.5,
      curve: "EASE_OUT",
      timingType: "AFTER_DELAY",
      timingDelaySec: 1,
    });
    expect(setSlideTransition).toHaveBeenCalledWith({
      style: "DISSOLVE",
      duration: 0.5,
      curve: "EASE_OUT",
      timing: { type: "AFTER_DELAY", delay: 1 },
    });
  });

  it("rejects when nodeId points to a non-slide", async () => {
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue({ id: "x", type: "FRAME" }),
    }));
    await expect(
      new RealFigmaAdapter().setSlideTransition({ slideId: "x", style: "NONE" })
    ).rejects.toThrow(/SLIDE/);
  });
});

describe("RealFigmaAdapter.moveSlide", () => {
  it("reads + mutates + writes the slide grid", async () => {
    const a = { id: "sld1" };
    const b = { id: "sld2" };
    const setSlideGrid = vi.fn();
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue({ id: "sld1", type: "SLIDE" }),
      getSlideGrid: vi.fn().mockReturnValue([[a, b]]),
      setSlideGrid,
    }));
    await new RealFigmaAdapter().moveSlide({
      slideId: "sld1",
      rowIndex: 0,
      columnIndex: 1,
    });
    expect(setSlideGrid).toHaveBeenCalled();
    const newGrid = setSlideGrid.mock.calls[0][0];
    expect(newGrid[0][0]).toBe(b);
    expect(newGrid[0][1]).toBe(a);
  });
});

describe("RealFigmaAdapter.setActiveSlide", () => {
  it("assigns figma.currentPage.focusedSlide", async () => {
    const slide = { id: "sld1", type: "SLIDE" };
    const currentPage: { focusedSlide?: typeof slide } = {};
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue(slide),
      currentPage,
    }));
    await new RealFigmaAdapter().setActiveSlide({ slideId: "sld1" });
    expect(currentPage.focusedSlide).toBe(slide);
  });
});

describe("RealFigmaAdapter.setSlidesView", () => {
  it("assigns figma.viewport.slidesView", async () => {
    const viewport: { slidesView?: SlidesView } = {};
    vi.stubGlobal("figma", stubFigma({ viewport }));
    await new RealFigmaAdapter().setSlidesView({ view: "single-slide" });
    expect(viewport.slidesView).toBe("single-slide");
  });
});
```

Repeat one happy + one error per method (`createSlide`, `createSlideRow`, `setSlideName`, `setSlideSkipped`, `setSlideTransition`, `getSlideTransition`, `setSlideBackground`, `moveSlide`, `duplicateSlide`, `deleteSlide`, `listSlides`, `listSlideRows`, `setActiveSlide`, `getActiveSlideId`, `setSlidesView`, `getSlidesView`, `getSlideGrid`).

### Step 6: Re-export new types — `packages/figma-adapter/src/index.ts`

```ts
export type {
  Component, EditorType, EffectStyle, EllipseNode, FigmaAdapter, FrameNode,
  LineNode, NodeSnapshot, PageSelection, PaintStyle, RectangleNode, SolidPaint,
  StyleBase, TextNode, TextStyle, Variable, VariableCollection,
  // Phase 10 (figjam):
  StickyNode, SectionNode, ConnectorNode, CodeBlockNode,
  ShapeWithTextNode, ShapeWithTextShape, TableNode,
  // Phase 12 (slides):
  SlideNode, SlideRowNode, SlideTransition, SlideTransitionStyle,
  SlideTransitionCurve, SlideTransitionTimingType, SlidesView,
} from "./adapter";
export { RealFigmaAdapter } from "./real-figma-adapter";
```

### Step 7: Verify, commit

```bash
bun run --filter @repo/figma-adapter test
git add packages/figma-adapter/src packages/figma-adapter/src/__tests__
git commit -m "feat(figma-adapter): Slides node types and slide grid methods"
```

---

## Task 12.2: `@repo/tools-slides` package scaffold

**Goal:** A green-light scaffold so Tasks 12.3–12.7 land cleanly. NO tools yet — just the directory, `package.json`, empty `index.ts`, empty `tools.ts`, empty `plugin-handlers.ts`, and a `__tests__/` directory.

**Files:**

- Create: `packages/tools-slides/package.json`
- Create: `packages/tools-slides/tsconfig.json`
- Create: `packages/tools-slides/vitest.config.ts`
- Create: `packages/tools-slides/src/index.ts`
- Create: `packages/tools-slides/src/tools.ts`
- Create: `packages/tools-slides/src/plugin-handlers.ts`
- Create: `packages/tools-slides/src/__tests__/.gitkeep`
- Modify: `bun.lock` (via `bun install`)

### Step 1: `package.json` — same shape as `@repo/tools-figjam`

```json
{
  "name": "@repo/tools-slides",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "types": "tsc --noEmit",
    "lint": "biome check ."
  },
  "dependencies": {
    "@repo/figma-adapter": "workspace:*",
    "@repo/protocol": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "4.1.4",
    "typescript": "^6.0.0",
    "vitest": "4.1.4"
  }
}
```

### Step 2: `tsconfig.json` and `vitest.config.ts`

Copy verbatim from `tools-figjam`. Coverage thresholds `lines: 90, branches: 85, functions: 90, statements: 90`.

### Step 3: Empty source stubs

```ts
// src/tools.ts
// Phase 12.3-12.7 add 15 tool definitions here.
export {};

// src/plugin-handlers.ts
// Phase 12.3-12.7 add the per-tool handlers here.
// Phase 12.8 adds requireSlides() and refactors handlers to use it.
export {};

// src/index.ts
/**
 * @repo/tools-slides — slide creation/edit/reorder tools for Figma Slides files.
 * Every tool is gated on `figma.editorType === "slides"` via the
 * `requireSlides` guard (Phase 12.8); calling on a Figma or FigJam editor
 * surfaces `E_FIGMA_EDITOR_TYPE_MISMATCH`.
 */
export * from "./tools";
export * from "./plugin-handlers";
```

### Step 4: Install + verify

```bash
bun install
bun run --filter @repo/tools-slides test
```

`vitest run --passWithNoTests` should exit 0.

### Step 5: Commit

```bash
git add packages/tools-slides bun.lock
git commit -m "feat(tools-slides): package scaffold (no tools yet)"
```

---

## Task 12.3: `tools-slides` — `create_slide`, `create_slide_row`

**Goal:** First two Slides tools. Each handler checks `figma.editorType === "slides"` (inline for now; Task 12.8 lifts the check into a shared helper) and delegates to the matching adapter method. Tests run against `new FigmaFake({ editorType: "slides" })`.

**Files:**

- Modify: `packages/tools-slides/src/tools.ts`
- Modify: `packages/tools-slides/src/plugin-handlers.ts`
- Create: `packages/tools-slides/src/__tests__/tools.test.ts`
- Create: `packages/tools-slides/src/__tests__/plugin-handlers.test.ts`

### Step 1: Failing tests — `tools.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { CreateSlide, CreateSlideRow } from "../tools";

describe("CreateSlide schema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(CreateSlide.input.safeParse({}).success).toBe(true);
  });

  it("accepts name + rowIndex + columnIndex", () => {
    expect(
      CreateSlide.input.safeParse({
        name: "Intro",
        rowIndex: 0,
        columnIndex: 1,
      }).success
    ).toBe(true);
  });

  it("rejects negative rowIndex / columnIndex", () => {
    expect(CreateSlide.input.safeParse({ rowIndex: -1 }).success).toBe(false);
    expect(CreateSlide.input.safeParse({ columnIndex: -1 }).success).toBe(false);
  });

  it("rejects non-integer rowIndex / columnIndex", () => {
    expect(CreateSlide.input.safeParse({ rowIndex: 1.5 }).success).toBe(false);
  });

  it("output is {nodeId, type: 'SLIDE'}", () => {
    expect(
      CreateSlide.output.safeParse({ nodeId: "sld1", type: "SLIDE" }).success
    ).toBe(true);
  });
});

describe("CreateSlideRow schema", () => {
  it("accepts an empty object", () => {
    expect(CreateSlideRow.input.safeParse({}).success).toBe(true);
  });

  it("accepts a rowIndex", () => {
    expect(CreateSlideRow.input.safeParse({ rowIndex: 0 }).success).toBe(true);
  });

  it("rejects negative rowIndex", () => {
    expect(CreateSlideRow.input.safeParse({ rowIndex: -1 }).success).toBe(false);
  });

  it("output is {nodeId, type: 'SLIDE_ROW'}", () => {
    expect(
      CreateSlideRow.output.safeParse({ nodeId: "slr1", type: "SLIDE_ROW" }).success
    ).toBe(true);
  });
});
```

### Step 2: Failing tests — `plugin-handlers.test.ts`

```ts
import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  createSlidePluginHandler,
  createSlideRowPluginHandler,
} from "../plugin-handlers";

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const slidesCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "slides" }),
});
const figmaCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "figma" }),
});
const figJamCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "figjam" }),
});

describe("createSlidePluginHandler", () => {
  it("creates a slide on a Slides editor", async () => {
    const ctx = slidesCtx();
    const out = await createSlidePluginHandler({ name: "Intro" }, ctx);
    expect(out.type).toBe("SLIDE");
    expect(out.nodeId).toMatch(/^sld/);
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { name?: string }).name).toBe("Intro");
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createSlidePluginHandler({}, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a FigJam editor", async () => {
    await expect(
      createSlidePluginHandler({}, figJamCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("createSlideRowPluginHandler", () => {
  it("creates a slide row on a Slides editor", async () => {
    const ctx = slidesCtx();
    const out = await createSlideRowPluginHandler({}, ctx);
    expect(out.type).toBe("SLIDE_ROW");
    expect(out.nodeId).toMatch(/^slr/);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createSlideRowPluginHandler({}, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});
```

### Step 3: Implement schemas — `tools.ts`

```ts
import { defineTool } from "@repo/protocol";
import { z } from "zod";

const NonNegativeInt = z.number().int().nonnegative();

export const CreateSlide = defineTool({
  name: "create_slide",
  description:
    "Slides-only. Create a slide. By default, appended to the end of the last row. Pass rowIndex/columnIndex to place explicitly.",
  streaming: false,
  input: z
    .object({
      name: z.string().min(1).optional(),
      rowIndex: NonNegativeInt.optional(),
      columnIndex: NonNegativeInt.optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE") }),
});

export const CreateSlideRow = defineTool({
  name: "create_slide_row",
  description:
    "Slides-only. Create a slide row. By default, appended to the end of the slide grid.",
  streaming: false,
  input: z
    .object({
      rowIndex: NonNegativeInt.optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE_ROW") }),
});
```

### Step 4: Implement handlers — `plugin-handlers.ts`

> Inline editor-type check; lifted into `requireSlides()` in Task 12.8.

```ts
import type { PluginHandler } from "@repo/protocol";
import type { CreateSlide, CreateSlideRow } from "./tools";

const E_MISMATCH = "E_FIGMA_EDITOR_TYPE_MISMATCH";

export const createSlidePluginHandler: PluginHandler<typeof CreateSlide> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: create_slide requires editorType=slides (got ${figma.editorType})`);
  }
  const node = await figma.createSlide(args);
  return { nodeId: node.id, type: "SLIDE" };
};

export const createSlideRowPluginHandler: PluginHandler<typeof CreateSlideRow> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: create_slide_row requires editorType=slides (got ${figma.editorType})`);
  }
  const node = await figma.createSlideRow(args);
  return { nodeId: node.id, type: "SLIDE_ROW" };
};
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/tools-slides test
git add packages/tools-slides/src
git commit -m "feat(tools-slides): create_slide, create_slide_row"
```

---

## Task 12.4: `tools-slides` — `set_slide_name`, `set_slide_skipped`

**Goal:** Two metadata mutators. `set_slide_name` rewrites the slide's title (which is its `BaseFrameMixin.name`). `set_slide_skipped` toggles `slide.isSkippedSlide` — the only slide-level metadata flag the plugin API exposes (no `notes` API).

**Files:**

- Modify: `packages/tools-slides/src/tools.ts`
- Modify: `packages/tools-slides/src/plugin-handlers.ts`
- Modify: `packages/tools-slides/src/__tests__/tools.test.ts`
- Modify: `packages/tools-slides/src/__tests__/plugin-handlers.test.ts`

### Step 1: Failing tests — append to `tools.test.ts`

```ts
describe("SetSlideName schema", () => {
  it("requires slideId + name", () => {
    expect(
      SetSlideName.input.safeParse({ slideId: "sld1", name: "Intro" }).success
    ).toBe(true);
    expect(SetSlideName.input.safeParse({ slideId: "sld1" }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(
      SetSlideName.input.safeParse({ slideId: "sld1", name: "" }).success
    ).toBe(false);
  });

  it("output returns nodeId + type", () => {
    expect(
      SetSlideName.output.safeParse({ nodeId: "sld1", type: "SLIDE" }).success
    ).toBe(true);
  });
});

describe("SetSlideSkipped schema", () => {
  it("requires slideId + skipped boolean", () => {
    expect(
      SetSlideSkipped.input.safeParse({ slideId: "sld1", skipped: true }).success
    ).toBe(true);
    expect(
      SetSlideSkipped.input.safeParse({ slideId: "sld1", skipped: false }).success
    ).toBe(true);
    expect(SetSlideSkipped.input.safeParse({ slideId: "sld1" }).success).toBe(false);
  });

  it("rejects non-boolean skipped", () => {
    expect(
      SetSlideSkipped.input.safeParse({ slideId: "sld1", skipped: "yes" }).success
    ).toBe(false);
  });
});
```

### Step 2: Failing tests — append to `plugin-handlers.test.ts`

```ts
describe("setSlideNamePluginHandler", () => {
  it("rewrites a slide's name", async () => {
    const ctx = slidesCtx();
    const slide = await ctx.figma.createSlide({ name: "Old" });
    await setSlideNamePluginHandler(
      { slideId: slide.id, name: "New" },
      ctx
    );
    const node = await ctx.figma.getNodeById({ nodeId: slide.id });
    expect((node as { name?: string }).name).toBe("New");
  });

  it("rejects non-slide nodes", async () => {
    const ctx = slidesCtx();
    const row = await ctx.figma.createSlideRow({});
    await expect(
      setSlideNamePluginHandler({ slideId: row.id, name: "X" }, ctx)
    ).rejects.toThrow(/slide/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      setSlideNamePluginHandler({ slideId: "sld1", name: "X" }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("setSlideSkippedPluginHandler", () => {
  it("toggles isSkipped on a slide", async () => {
    const ctx = slidesCtx();
    const slide = await ctx.figma.createSlide({});
    await setSlideSkippedPluginHandler(
      { slideId: slide.id, skipped: true },
      ctx
    );
    const node = await ctx.figma.getNodeById({ nodeId: slide.id });
    expect((node as { isSkipped?: boolean }).isSkipped).toBe(true);
  });

  it("rejects non-slide nodes", async () => {
    const ctx = slidesCtx();
    const row = await ctx.figma.createSlideRow({});
    await expect(
      setSlideSkippedPluginHandler({ slideId: row.id, skipped: true }, ctx)
    ).rejects.toThrow(/slide/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a FigJam editor", async () => {
    await expect(
      setSlideSkippedPluginHandler({ slideId: "sld1", skipped: true }, figJamCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});
```

### Step 3: Implement schemas — append to `tools.ts`

```ts
export const SetSlideName = defineTool({
  name: "set_slide_name",
  description:
    "Slides-only. Set the slide's title (the slide's name). Slides have no separate title placeholder; the BaseFrameMixin name IS the title surface.",
  streaming: false,
  input: z
    .object({
      slideId: z.string().min(1),
      name: z.string().min(1),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE") }),
});

export const SetSlideSkipped = defineTool({
  name: "set_slide_skipped",
  description:
    "Slides-only. Toggle whether a slide is skipped during presentation playback (slide.isSkippedSlide). This is the only slide-level metadata flag the plugin API exposes.",
  streaming: false,
  input: z
    .object({
      slideId: z.string().min(1),
      skipped: z.boolean(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE") }),
});
```

### Step 4: Implement handlers — append to `plugin-handlers.ts`

```ts
import type { SetSlideName, SetSlideSkipped } from "./tools";

export const setSlideNamePluginHandler: PluginHandler<typeof SetSlideName> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: set_slide_name requires editorType=slides (got ${figma.editorType})`);
  }
  await figma.setSlideName({ slideId: args.slideId, name: args.name });
  return { nodeId: args.slideId, type: "SLIDE" };
};

export const setSlideSkippedPluginHandler: PluginHandler<typeof SetSlideSkipped> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: set_slide_skipped requires editorType=slides (got ${figma.editorType})`);
  }
  await figma.setSlideSkipped({ slideId: args.slideId, skipped: args.skipped });
  return { nodeId: args.slideId, type: "SLIDE" };
};
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/tools-slides test
git add packages/tools-slides/src
git commit -m "feat(tools-slides): set_slide_name, set_slide_skipped"
```

---

## Task 12.5: `tools-slides` — `set_slide_transition`, `set_slide_background`

**Goal:** Two visual mutators. `set_slide_transition` accepts a Zod enum of transition styles + optional duration/curve/timing. `set_slide_background` accepts a `SolidPaint` (mirrors Phase 8's `set_node_fill`).

**Files:**

- Modify: `packages/tools-slides/src/tools.ts`
- Modify: `packages/tools-slides/src/plugin-handlers.ts`
- Modify: `packages/tools-slides/src/__tests__/tools.test.ts`
- Modify: `packages/tools-slides/src/__tests__/plugin-handlers.test.ts`

### Step 1: Failing tests — append to `tools.test.ts`

```ts
describe("SetSlideTransition schema", () => {
  it("accepts every documented transition style", () => {
    const styles = [
      "NONE", "DISSOLVE",
      "SLIDE_FROM_LEFT", "SLIDE_FROM_RIGHT", "SLIDE_FROM_TOP", "SLIDE_FROM_BOTTOM",
      "PUSH_FROM_LEFT", "PUSH_FROM_RIGHT", "PUSH_FROM_TOP", "PUSH_FROM_BOTTOM",
      "MOVE_FROM_LEFT", "MOVE_FROM_RIGHT", "MOVE_FROM_TOP", "MOVE_FROM_BOTTOM",
      "SLIDE_OUT_TO_LEFT", "SLIDE_OUT_TO_RIGHT", "SLIDE_OUT_TO_TOP", "SLIDE_OUT_TO_BOTTOM",
      "MOVE_OUT_TO_LEFT", "MOVE_OUT_TO_RIGHT", "MOVE_OUT_TO_TOP", "MOVE_OUT_TO_BOTTOM",
      "SMART_ANIMATE",
    ];
    for (const style of styles) {
      expect(
        SetSlideTransition.input.safeParse({ slideId: "sld1", style }).success
      ).toBe(true);
    }
  });

  it("rejects unknown transition style", () => {
    expect(
      SetSlideTransition.input.safeParse({ slideId: "sld1", style: "MORPH" }).success
    ).toBe(false);
  });

  it("accepts optional durationSec, curve, timingType, timingDelaySec", () => {
    expect(
      SetSlideTransition.input.safeParse({
        slideId: "sld1",
        style: "DISSOLVE",
        durationSec: 0.4,
        curve: "EASE_OUT",
        timingType: "ON_CLICK",
        timingDelaySec: 0.2,
      }).success
    ).toBe(true);
  });

  it("rejects negative durationSec / timingDelaySec", () => {
    expect(
      SetSlideTransition.input.safeParse({
        slideId: "sld1",
        style: "DISSOLVE",
        durationSec: -0.1,
      }).success
    ).toBe(false);
    expect(
      SetSlideTransition.input.safeParse({
        slideId: "sld1",
        style: "DISSOLVE",
        timingDelaySec: -1,
      }).success
    ).toBe(false);
  });

  it("rejects unknown curve", () => {
    expect(
      SetSlideTransition.input.safeParse({
        slideId: "sld1",
        style: "DISSOLVE",
        curve: "ELASTIC",
      }).success
    ).toBe(false);
  });
});

describe("SetSlideBackground schema", () => {
  it("requires slideId + paint", () => {
    expect(
      SetSlideBackground.input.safeParse({
        slideId: "sld1",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      }).success
    ).toBe(true);
    expect(SetSlideBackground.input.safeParse({ slideId: "sld1" }).success).toBe(false);
  });

  it("requires SOLID paint type with color rgb in [0, 1]", () => {
    expect(
      SetSlideBackground.input.safeParse({
        slideId: "sld1",
        paint: { type: "GRADIENT", color: { r: 0, g: 0, b: 0 } },
      }).success
    ).toBe(false);
    expect(
      SetSlideBackground.input.safeParse({
        slideId: "sld1",
        paint: { type: "SOLID", color: { r: 1.5, g: 0, b: 0 } },
      }).success
    ).toBe(false);
  });

  it("accepts optional opacity in [0, 1]", () => {
    expect(
      SetSlideBackground.input.safeParse({
        slideId: "sld1",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.5 },
      }).success
    ).toBe(true);
    expect(
      SetSlideBackground.input.safeParse({
        slideId: "sld1",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1.5 },
      }).success
    ).toBe(false);
  });
});
```

### Step 2: Failing tests — append to `plugin-handlers.test.ts`

```ts
describe("setSlideTransitionPluginHandler", () => {
  it("writes the transition to a slide", async () => {
    const ctx = slidesCtx();
    const slide = await ctx.figma.createSlide({});
    await setSlideTransitionPluginHandler(
      {
        slideId: slide.id,
        style: "DISSOLVE",
        durationSec: 0.5,
        curve: "EASE_OUT",
        timingType: "AFTER_DELAY",
        timingDelaySec: 1,
      },
      ctx
    );
    const t = await ctx.figma.getSlideTransition({ slideId: slide.id });
    expect(t.style).toBe("DISSOLVE");
    expect(t.duration).toBe(0.5);
    expect(t.curve).toBe("EASE_OUT");
    expect(t.timing).toEqual({ type: "AFTER_DELAY", delay: 1 });
  });

  it("rejects non-slide nodes", async () => {
    const ctx = slidesCtx();
    const row = await ctx.figma.createSlideRow({});
    await expect(
      setSlideTransitionPluginHandler(
        { slideId: row.id, style: "NONE" },
        ctx
      )
    ).rejects.toThrow(/slide/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      setSlideTransitionPluginHandler(
        { slideId: "sld1", style: "DISSOLVE" },
        figmaCtx()
      )
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("setSlideBackgroundPluginHandler", () => {
  it("writes a SOLID paint to the slide", async () => {
    const ctx = slidesCtx();
    const slide = await ctx.figma.createSlide({});
    await setSlideBackgroundPluginHandler(
      {
        slideId: slide.id,
        paint: { type: "SOLID", color: { r: 0.2, g: 0.4, b: 0.8 } },
      },
      ctx
    );
    const node = await ctx.figma.getNodeById({ nodeId: slide.id });
    const fills = (node as { fills?: ReadonlyArray<{ type: string }> }).fills;
    expect(fills?.[0].type).toBe("SOLID");
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      setSlideBackgroundPluginHandler(
        {
          slideId: "sld1",
          paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
        },
        figmaCtx()
      )
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});
```

### Step 3: Implement schemas — append to `tools.ts`

```ts
const SlideTransitionStyleEnum = z.enum([
  "NONE", "DISSOLVE",
  "SLIDE_FROM_LEFT", "SLIDE_FROM_RIGHT", "SLIDE_FROM_TOP", "SLIDE_FROM_BOTTOM",
  "PUSH_FROM_LEFT", "PUSH_FROM_RIGHT", "PUSH_FROM_TOP", "PUSH_FROM_BOTTOM",
  "MOVE_FROM_LEFT", "MOVE_FROM_RIGHT", "MOVE_FROM_TOP", "MOVE_FROM_BOTTOM",
  "SLIDE_OUT_TO_LEFT", "SLIDE_OUT_TO_RIGHT", "SLIDE_OUT_TO_TOP", "SLIDE_OUT_TO_BOTTOM",
  "MOVE_OUT_TO_LEFT", "MOVE_OUT_TO_RIGHT", "MOVE_OUT_TO_TOP", "MOVE_OUT_TO_BOTTOM",
  "SMART_ANIMATE",
]);

const SlideTransitionCurveEnum = z.enum([
  "EASE_IN", "EASE_OUT", "EASE_IN_AND_OUT", "LINEAR",
  "GENTLE", "QUICK", "BOUNCY", "SLOW",
]);

const SlideTransitionTimingTypeEnum = z.enum(["ON_CLICK", "AFTER_DELAY"]);

const NonNegativeNumber = z.number().nonnegative();

const NormalizedChannel = z.number().min(0).max(1);

const SolidPaintSchema = z
  .object({
    type: z.literal("SOLID"),
    color: z.object({
      r: NormalizedChannel,
      g: NormalizedChannel,
      b: NormalizedChannel,
    }),
    opacity: NormalizedChannel.optional(),
  })
  .strict();

export const SetSlideTransition = defineTool({
  name: "set_slide_transition",
  description:
    "Slides-only. Set the slide-to-slide transition (style + optional duration, curve, timing).",
  streaming: false,
  input: z
    .object({
      slideId: z.string().min(1),
      style: SlideTransitionStyleEnum,
      durationSec: NonNegativeNumber.optional(),
      curve: SlideTransitionCurveEnum.optional(),
      timingType: SlideTransitionTimingTypeEnum.optional(),
      timingDelaySec: NonNegativeNumber.optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE") }),
});

export const SetSlideBackground = defineTool({
  name: "set_slide_background",
  description:
    "Slides-only. Set the slide's background to a single SOLID paint (writes through to slide.fills).",
  streaming: false,
  input: z
    .object({
      slideId: z.string().min(1),
      paint: SolidPaintSchema,
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE") }),
});
```

### Step 4: Implement handlers — append to `plugin-handlers.ts`

```ts
import type { SetSlideBackground, SetSlideTransition } from "./tools";

export const setSlideTransitionPluginHandler: PluginHandler<typeof SetSlideTransition> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: set_slide_transition requires editorType=slides (got ${figma.editorType})`);
  }
  await figma.setSlideTransition({
    slideId: args.slideId,
    style: args.style,
    durationSec: args.durationSec,
    curve: args.curve,
    timingType: args.timingType,
    timingDelaySec: args.timingDelaySec,
  });
  return { nodeId: args.slideId, type: "SLIDE" };
};

export const setSlideBackgroundPluginHandler: PluginHandler<typeof SetSlideBackground> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: set_slide_background requires editorType=slides (got ${figma.editorType})`);
  }
  await figma.setSlideBackground({ slideId: args.slideId, paint: args.paint });
  return { nodeId: args.slideId, type: "SLIDE" };
};
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/tools-slides test
git add packages/tools-slides/src
git commit -m "feat(tools-slides): set_slide_transition, set_slide_background"
```

---

## Task 12.6: `tools-slides` — `move_slide`, `duplicate_slide`, `delete_slide`

**Goal:** Three lifecycle tools. `move_slide({slideId, rowIndex, columnIndex})` repositions; `duplicate_slide({slideId})` clones (returns new nodeId); `delete_slide({slideId})` removes from grid + node map.

**Files:**

- Modify: `packages/tools-slides/src/tools.ts`
- Modify: `packages/tools-slides/src/plugin-handlers.ts`
- Modify: `packages/tools-slides/src/__tests__/tools.test.ts`
- Modify: `packages/tools-slides/src/__tests__/plugin-handlers.test.ts`

### Step 1: Failing tests — append to `tools.test.ts`

```ts
describe("MoveSlide schema", () => {
  it("requires slideId + rowIndex + columnIndex", () => {
    expect(
      MoveSlide.input.safeParse({
        slideId: "sld1",
        rowIndex: 0,
        columnIndex: 0,
      }).success
    ).toBe(true);
    expect(
      MoveSlide.input.safeParse({ slideId: "sld1", rowIndex: 0 }).success
    ).toBe(false);
  });

  it("rejects negative indices", () => {
    expect(
      MoveSlide.input.safeParse({
        slideId: "sld1",
        rowIndex: -1,
        columnIndex: 0,
      }).success
    ).toBe(false);
  });

  it("output reports the slideId + new position", () => {
    expect(
      MoveSlide.output.safeParse({
        nodeId: "sld1",
        rowIndex: 0,
        columnIndex: 0,
      }).success
    ).toBe(true);
  });
});

describe("DuplicateSlide schema", () => {
  it("requires slideId", () => {
    expect(DuplicateSlide.input.safeParse({ slideId: "sld1" }).success).toBe(true);
    expect(DuplicateSlide.input.safeParse({}).success).toBe(false);
  });

  it("output returns nodeId + type", () => {
    expect(
      DuplicateSlide.output.safeParse({ nodeId: "sld2", type: "SLIDE" }).success
    ).toBe(true);
  });
});

describe("DeleteSlide schema", () => {
  it("requires slideId", () => {
    expect(DeleteSlide.input.safeParse({ slideId: "sld1" }).success).toBe(true);
    expect(DeleteSlide.input.safeParse({}).success).toBe(false);
  });

  it("output is {deleted: true}", () => {
    expect(
      DeleteSlide.output.safeParse({ slideId: "sld1", deleted: true }).success
    ).toBe(true);
  });
});
```

### Step 2: Failing tests — append to `plugin-handlers.test.ts`

```ts
describe("moveSlidePluginHandler", () => {
  it("repositions a slide within the grid", async () => {
    const ctx = slidesCtx();
    await ctx.figma.createSlideRow({}); // row 0
    await ctx.figma.createSlideRow({}); // row 1
    const a = await ctx.figma.createSlide({ rowIndex: 0, columnIndex: 0 });
    await ctx.figma.createSlide({ rowIndex: 1, columnIndex: 0 });
    const out = await moveSlidePluginHandler(
      { slideId: a.id, rowIndex: 1, columnIndex: 1 },
      ctx
    );
    expect(out).toEqual({ nodeId: a.id, rowIndex: 1, columnIndex: 1 });
    const grid = await ctx.figma.getSlideGrid();
    expect(grid[1][1]).toBe(a.id);
  });

  it("rejects unknown slideId", async () => {
    const ctx = slidesCtx();
    await expect(
      moveSlidePluginHandler(
        { slideId: "missing", rowIndex: 0, columnIndex: 0 },
        ctx
      )
    ).rejects.toThrow(/not found/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a FigJam editor", async () => {
    await expect(
      moveSlidePluginHandler(
        { slideId: "sld1", rowIndex: 0, columnIndex: 0 },
        figJamCtx()
      )
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("duplicateSlidePluginHandler", () => {
  it("clones a slide and returns the new id", async () => {
    const ctx = slidesCtx();
    const a = await ctx.figma.createSlide({ name: "Intro" });
    const out = await duplicateSlidePluginHandler({ slideId: a.id }, ctx);
    expect(out.type).toBe("SLIDE");
    expect(out.nodeId).not.toBe(a.id);
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { name?: string }).name).toBe("Intro");
  });

  it("rejects unknown slideId", async () => {
    const ctx = slidesCtx();
    await expect(
      duplicateSlidePluginHandler({ slideId: "missing" }, ctx)
    ).rejects.toThrow(/not found/i);
  });
});

describe("deleteSlidePluginHandler", () => {
  it("deletes a slide and returns deleted: true", async () => {
    const ctx = slidesCtx();
    const a = await ctx.figma.createSlide({});
    const out = await deleteSlidePluginHandler({ slideId: a.id }, ctx);
    expect(out).toEqual({ slideId: a.id, deleted: true });
    await expect(
      ctx.figma.getNodeById({ nodeId: a.id })
    ).rejects.toThrow(/not found/i);
  });

  it("rejects unknown slideId", async () => {
    const ctx = slidesCtx();
    await expect(
      deleteSlidePluginHandler({ slideId: "missing" }, ctx)
    ).rejects.toThrow(/not found/i);
  });
});
```

### Step 3: Implement schemas — append to `tools.ts`

```ts
export const MoveSlide = defineTool({
  name: "move_slide",
  description:
    "Slides-only. Move a slide to (rowIndex, columnIndex). Internally calls figma.setSlideGrid with the mutated grid.",
  streaming: false,
  input: z
    .object({
      slideId: z.string().min(1),
      rowIndex: NonNegativeInt,
      columnIndex: NonNegativeInt,
    })
    .strict(),
  output: z.object({
    nodeId: z.string(),
    rowIndex: NonNegativeInt,
    columnIndex: NonNegativeInt,
  }),
});

export const DuplicateSlide = defineTool({
  name: "duplicate_slide",
  description:
    "Slides-only. Clone a slide. The duplicate is appended after the source in the same row.",
  streaming: false,
  input: z.object({ slideId: z.string().min(1) }).strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE") }),
});

export const DeleteSlide = defineTool({
  name: "delete_slide",
  description: "Slides-only. Remove a slide from the deck.",
  streaming: false,
  input: z.object({ slideId: z.string().min(1) }).strict(),
  output: z.object({
    slideId: z.string(),
    deleted: z.literal(true),
  }),
});
```

### Step 4: Implement handlers — append to `plugin-handlers.ts`

```ts
import type { DeleteSlide, DuplicateSlide, MoveSlide } from "./tools";

export const moveSlidePluginHandler: PluginHandler<typeof MoveSlide> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: move_slide requires editorType=slides (got ${figma.editorType})`);
  }
  await figma.moveSlide({
    slideId: args.slideId,
    rowIndex: args.rowIndex,
    columnIndex: args.columnIndex,
  });
  return {
    nodeId: args.slideId,
    rowIndex: args.rowIndex,
    columnIndex: args.columnIndex,
  };
};

export const duplicateSlidePluginHandler: PluginHandler<typeof DuplicateSlide> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: duplicate_slide requires editorType=slides (got ${figma.editorType})`);
  }
  const node = await figma.duplicateSlide({ slideId: args.slideId });
  return { nodeId: node.id, type: "SLIDE" };
};

export const deleteSlidePluginHandler: PluginHandler<typeof DeleteSlide> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: delete_slide requires editorType=slides (got ${figma.editorType})`);
  }
  await figma.deleteSlide({ slideId: args.slideId });
  return { slideId: args.slideId, deleted: true as const };
};
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/tools-slides test
git add packages/tools-slides/src
git commit -m "feat(tools-slides): move_slide, duplicate_slide, delete_slide"
```

---

## Task 12.7: `tools-slides` — `list_slides`, `list_slide_rows`, `set_active_slide`, `get_slide`, `set_slides_view`, `get_slide_grid`

**Goal:** Six query/focus tools. The two `list_*` tools enumerate ids; `set_active_slide` writes `figma.currentPage.focusedSlide`; `get_slide` returns a structured summary; `set_slides_view` toggles the viewport mode; `get_slide_grid` returns the full 2D grid for clients that need to render it.

**Files:**

- Modify: `packages/tools-slides/src/tools.ts`
- Modify: `packages/tools-slides/src/plugin-handlers.ts`
- Modify: `packages/tools-slides/src/__tests__/tools.test.ts`
- Modify: `packages/tools-slides/src/__tests__/plugin-handlers.test.ts`

### Step 1: Failing tests — append to `tools.test.ts`

```ts
describe("ListSlides schema", () => {
  it("accepts an empty object (lists everything)", () => {
    expect(ListSlides.input.safeParse({}).success).toBe(true);
  });

  it("accepts a rowIndex (lists a single row)", () => {
    expect(ListSlides.input.safeParse({ rowIndex: 0 }).success).toBe(true);
  });

  it("rejects negative rowIndex", () => {
    expect(ListSlides.input.safeParse({ rowIndex: -1 }).success).toBe(false);
  });

  it("output returns nodeIds + count", () => {
    expect(
      ListSlides.output.safeParse({ nodeIds: ["sld1"], count: 1 }).success
    ).toBe(true);
  });
});

describe("ListSlideRows schema", () => {
  it("accepts an empty object", () => {
    expect(ListSlideRows.input.safeParse({}).success).toBe(true);
  });

  it("output returns rowIds + count", () => {
    expect(
      ListSlideRows.output.safeParse({ rowIds: ["slr1"], count: 1 }).success
    ).toBe(true);
  });
});

describe("SetActiveSlide schema", () => {
  it("requires slideId", () => {
    expect(SetActiveSlide.input.safeParse({ slideId: "sld1" }).success).toBe(true);
    expect(SetActiveSlide.input.safeParse({}).success).toBe(false);
  });
});

describe("GetSlide schema", () => {
  it("requires slideId", () => {
    expect(GetSlide.input.safeParse({ slideId: "sld1" }).success).toBe(true);
  });

  it("output captures name, isSkipped, transition, isFirst", () => {
    expect(
      GetSlide.output.safeParse({
        nodeId: "sld1",
        type: "SLIDE",
        name: "Intro",
        isSkipped: false,
        isFirst: true,
        transition: { style: "NONE", durationSec: 0.3, curve: "EASE_IN_AND_OUT" },
      }).success
    ).toBe(true);
  });
});

describe("SetSlidesView schema", () => {
  it("accepts 'grid' and 'single-slide'", () => {
    expect(SetSlidesView.input.safeParse({ view: "grid" }).success).toBe(true);
    expect(SetSlidesView.input.safeParse({ view: "single-slide" }).success).toBe(true);
  });

  it("rejects other values", () => {
    expect(SetSlidesView.input.safeParse({ view: "thumbnail" }).success).toBe(false);
  });
});

describe("GetSlideGrid schema", () => {
  it("accepts an empty object", () => {
    expect(GetSlideGrid.input.safeParse({}).success).toBe(true);
  });

  it("output is grid: string[][]", () => {
    expect(
      GetSlideGrid.output.safeParse({ grid: [["sld1", "sld2"], ["sld3"]] }).success
    ).toBe(true);
    expect(GetSlideGrid.output.safeParse({ grid: [] }).success).toBe(true);
  });
});
```

### Step 2: Failing tests — append to `plugin-handlers.test.ts`

```ts
describe("listSlidesPluginHandler", () => {
  it("returns every slide id when rowIndex is omitted", async () => {
    const ctx = slidesCtx();
    const a = await ctx.figma.createSlide({});
    const b = await ctx.figma.createSlide({});
    const out = await listSlidesPluginHandler({}, ctx);
    expect(out.nodeIds).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(out.count).toBeGreaterThanOrEqual(2);
  });

  it("returns slides in a single row when rowIndex is supplied", async () => {
    const ctx = slidesCtx();
    await ctx.figma.createSlideRow({});
    const a = await ctx.figma.createSlide({ rowIndex: 0 });
    const out = await listSlidesPluginHandler({ rowIndex: 0 }, ctx);
    expect(out.nodeIds).toContain(a.id);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      listSlidesPluginHandler({}, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("listSlideRowsPluginHandler", () => {
  it("returns row ids in order", async () => {
    const ctx = slidesCtx();
    const r0 = await ctx.figma.createSlideRow({});
    const r1 = await ctx.figma.createSlideRow({});
    const out = await listSlideRowsPluginHandler({}, ctx);
    expect(out.rowIds).toEqual(expect.arrayContaining([r0.id, r1.id]));
  });
});

describe("setActiveSlidePluginHandler", () => {
  it("focuses a slide", async () => {
    const ctx = slidesCtx();
    const a = await ctx.figma.createSlide({});
    const out = await setActiveSlidePluginHandler({ slideId: a.id }, ctx);
    expect(out).toEqual({ slideId: a.id });
    expect(await ctx.figma.getActiveSlideId()).toBe(a.id);
  });

  it("rejects unknown slideId", async () => {
    const ctx = slidesCtx();
    await expect(
      setActiveSlidePluginHandler({ slideId: "missing" }, ctx)
    ).rejects.toThrow(/not found/i);
  });
});

describe("getSlidePluginHandler", () => {
  it("returns structured summary for the slide", async () => {
    const ctx = slidesCtx();
    const a = await ctx.figma.createSlide({ name: "Intro" });
    await ctx.figma.setSlideTransition({
      slideId: a.id,
      style: "DISSOLVE",
      durationSec: 0.5,
    });
    const out = await getSlidePluginHandler({ slideId: a.id }, ctx);
    expect(out.nodeId).toBe(a.id);
    expect(out.name).toBe("Intro");
    expect(out.isSkipped).toBe(false);
    expect(out.transition.style).toBe("DISSOLVE");
    expect(out.transition.durationSec).toBe(0.5);
    expect(out.isFirst).toBe(true);
  });

  it("flags isFirst correctly when the slide is not the first", async () => {
    const ctx = slidesCtx();
    await ctx.figma.createSlide({});
    const b = await ctx.figma.createSlide({});
    const out = await getSlidePluginHandler({ slideId: b.id }, ctx);
    expect(out.isFirst).toBe(false);
  });

  it("rejects unknown slideId", async () => {
    const ctx = slidesCtx();
    await expect(
      getSlidePluginHandler({ slideId: "missing" }, ctx)
    ).rejects.toThrow(/not found/i);
  });
});

describe("setSlidesViewPluginHandler", () => {
  it("sets the viewport mode", async () => {
    const ctx = slidesCtx();
    await setSlidesViewPluginHandler({ view: "single-slide" }, ctx);
    expect(await ctx.figma.getSlidesView()).toBe("single-slide");
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      setSlidesViewPluginHandler({ view: "grid" }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("getSlideGridPluginHandler", () => {
  it("returns the 2D grid of slide ids", async () => {
    const ctx = slidesCtx();
    await ctx.figma.createSlideRow({});
    const a = await ctx.figma.createSlide({ rowIndex: 0 });
    const out = await getSlideGridPluginHandler({}, ctx);
    expect(out.grid.flat()).toContain(a.id);
  });
});
```

### Step 3: Implement schemas — append to `tools.ts`

```ts
const SlideTransitionSummary = z.object({
  style: SlideTransitionStyleEnum,
  durationSec: NonNegativeNumber,
  curve: SlideTransitionCurveEnum,
});

export const ListSlides = defineTool({
  name: "list_slides",
  description:
    "Slides-only. Enumerate slide ids. With no rowIndex, returns every slide; with a rowIndex, returns just that row's slides.",
  streaming: false,
  input: z
    .object({
      rowIndex: NonNegativeInt.optional(),
    })
    .strict(),
  output: z.object({
    nodeIds: z.array(z.string()),
    count: NonNegativeInt,
  }),
});

export const ListSlideRows = defineTool({
  name: "list_slide_rows",
  description: "Slides-only. Enumerate slide row ids in grid order.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({
    rowIds: z.array(z.string()),
    count: NonNegativeInt,
  }),
});

export const SetActiveSlide = defineTool({
  name: "set_active_slide",
  description:
    "Slides-only. Focus a slide (writes figma.currentPage.focusedSlide). Note: the plugin API has no scrollAndZoomIntoSlide; assigning focusedSlide is the only way to programmatically focus a slide.",
  streaming: false,
  input: z.object({ slideId: z.string().min(1) }).strict(),
  output: z.object({ slideId: z.string() }),
});

export const GetSlide = defineTool({
  name: "get_slide",
  description:
    "Slides-only. Return a structured summary of a slide: name, isSkipped, transition, isFirst.",
  streaming: false,
  input: z.object({ slideId: z.string().min(1) }).strict(),
  output: z.object({
    nodeId: z.string(),
    type: z.literal("SLIDE"),
    name: z.string(),
    isSkipped: z.boolean(),
    isFirst: z.boolean(),
    transition: SlideTransitionSummary,
  }),
});

export const SetSlidesView = defineTool({
  name: "set_slides_view",
  description:
    "Slides-only. Toggle the editor viewport mode. 'grid' shows the whole grid; 'single-slide' zooms in on the focused slide.",
  streaming: false,
  input: z
    .object({
      view: z.enum(["grid", "single-slide"]),
    })
    .strict(),
  output: z.object({ view: z.enum(["grid", "single-slide"]) }),
});

export const GetSlideGrid = defineTool({
  name: "get_slide_grid",
  description:
    "Slides-only. Return the full slide grid as a 2D array of slide ids (outer index = row).",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({
    grid: z.array(z.array(z.string())),
  }),
});
```

### Step 4: Implement handlers — append to `plugin-handlers.ts`

```ts
import type {
  GetSlide, GetSlideGrid, ListSlideRows, ListSlides,
  SetActiveSlide, SetSlidesView,
} from "./tools";

export const listSlidesPluginHandler: PluginHandler<typeof ListSlides> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: list_slides requires editorType=slides (got ${figma.editorType})`);
  }
  const nodeIds = await figma.listSlides({ rowIndex: args.rowIndex });
  return { nodeIds: [...nodeIds], count: nodeIds.length };
};

export const listSlideRowsPluginHandler: PluginHandler<typeof ListSlideRows> = async (
  _args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: list_slide_rows requires editorType=slides (got ${figma.editorType})`);
  }
  const rowIds = await figma.listSlideRows();
  return { rowIds: [...rowIds], count: rowIds.length };
};

export const setActiveSlidePluginHandler: PluginHandler<typeof SetActiveSlide> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: set_active_slide requires editorType=slides (got ${figma.editorType})`);
  }
  await figma.setActiveSlide({ slideId: args.slideId });
  return { slideId: args.slideId };
};

export const getSlidePluginHandler: PluginHandler<typeof GetSlide> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: get_slide requires editorType=slides (got ${figma.editorType})`);
  }
  const node = await figma.getNodeById({ nodeId: args.slideId });
  if (!node || node.type !== "SLIDE") {
    throw new Error(`expected SLIDE node: ${args.slideId}`);
  }
  const transition = await figma.getSlideTransition({ slideId: args.slideId });
  const grid = await figma.getSlideGrid();
  const isFirst = grid[0]?.[0] === args.slideId;
  return {
    nodeId: args.slideId,
    type: "SLIDE",
    name: (node as { name?: string }).name ?? "",
    isSkipped: (node as { isSkipped?: boolean }).isSkipped ?? false,
    isFirst,
    transition: {
      style: transition.style,
      durationSec: transition.duration,
      curve: transition.curve,
    },
  };
};

export const setSlidesViewPluginHandler: PluginHandler<typeof SetSlidesView> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: set_slides_view requires editorType=slides (got ${figma.editorType})`);
  }
  await figma.setSlidesView({ view: args.view });
  return { view: args.view };
};

export const getSlideGridPluginHandler: PluginHandler<typeof GetSlideGrid> = async (
  _args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: get_slide_grid requires editorType=slides (got ${figma.editorType})`);
  }
  const grid = await figma.getSlideGrid();
  return { grid: grid.map((row) => [...row]) };
};
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/tools-slides test
git add packages/tools-slides/src
git commit -m "feat(tools-slides): list/get/active/view/grid query tools"
```

---

## Task 12.8: Editor-type guard helper + handler refactor

**Goal:** Lift the `figma.editorType !== "slides"` check into a single `requireSlides()` helper. Each handler in `plugin-handlers.ts` calls `requireSlides(figma, "<tool_name>")` instead of inlining the check. The helper is independently unit-tested. Refactor leaves behavior unchanged — the existing handler tests (12.3–12.7) pass without modification.

**Why now (and not in 12.3 first)?** Each task lands as a self-contained, reviewable unit; introducing the helper at 12.8 means the prior tasks' handler diffs read top-to-bottom (no forward references). The refactor here is mechanical. **Implementer judgment:** if a sub-agent decides to land the helper at 12.3 and reuse it across 12.4–12.7, that's also valid — keep the discipline of "every handler uses the same pattern." The Phase 10 figjam pack landed it at 10.8; we mirror that.

**Files:**

- Create: `packages/tools-slides/src/guard.ts`
- Create: `packages/tools-slides/src/__tests__/guard.test.ts`
- Modify: `packages/tools-slides/src/plugin-handlers.ts` (replace inline checks)
- Modify: `packages/tools-slides/src/index.ts` (re-export)

### Step 1: Failing tests for the guard — `packages/tools-slides/src/__tests__/guard.test.ts`

```ts
import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import { requireSlides, E_FIGMA_EDITOR_TYPE_MISMATCH } from "../guard";

describe("requireSlides", () => {
  it("returns the adapter when editorType is slides", () => {
    const figma = new FigmaFake({ editorType: "slides" });
    expect(requireSlides(figma, "tool_x")).toBe(figma);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on figma editor", () => {
    const figma = new FigmaFake({ editorType: "figma" });
    expect(() => requireSlides(figma, "tool_x")).toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });

  it("throws on figjam editor", () => {
    const figma = new FigmaFake({ editorType: "figjam" });
    expect(() => requireSlides(figma, "tool_x")).toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });

  it("includes the tool name and the offending editor type in the error message", () => {
    const figma = new FigmaFake({ editorType: "figjam" });
    try {
      requireSlides(figma, "create_slide");
      expect.fail("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("create_slide");
      expect(message).toContain("slides");
      expect(message).toContain("figjam");
    }
  });

  it("exposes the error code as a module constant", () => {
    expect(E_FIGMA_EDITOR_TYPE_MISMATCH).toBe("E_FIGMA_EDITOR_TYPE_MISMATCH");
  });
});
```

### Step 2: Implement the guard — `packages/tools-slides/src/guard.ts`

```ts
import type { FigmaAdapter } from "@repo/figma-adapter";

export const E_FIGMA_EDITOR_TYPE_MISMATCH = "E_FIGMA_EDITOR_TYPE_MISMATCH";

/**
 * Editor-type discriminator guard. Every Slides tool handler calls
 * `requireSlides(figma, "<tool_name>")` before touching the API.
 *
 * On mismatch, throws an Error whose `message` starts with
 * `E_FIGMA_EDITOR_TYPE_MISMATCH:` so the daemon's protocol-error
 * mapper surfaces it as the corresponding wire error code.
 *
 * The literal error code is identical to the FigJam guard's
 * (`@repo/tools-figjam`'s `requireFigJam`); the daemon and shim do
 * not distinguish "wrong editor" between the FigJam and Slides
 * packs — both surface E_FIGMA_EDITOR_TYPE_MISMATCH on the wire.
 */
export function requireSlides(figma: FigmaAdapter, toolName: string): FigmaAdapter {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_FIGMA_EDITOR_TYPE_MISMATCH}: ${toolName} requires editorType=slides (got ${figma.editorType})`
    );
  }
  return figma;
}
```

### Step 3: Refactor handlers — `packages/tools-slides/src/plugin-handlers.ts`

Replace each inline check with a call to `requireSlides`. The body shrinks from 4 lines (declare local error code, branch, throw) to 1 line. Example:

```ts
// before:
export const createSlidePluginHandler: PluginHandler<typeof CreateSlide> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(`${E_MISMATCH}: create_slide requires editorType=slides (got ${figma.editorType})`);
  }
  const node = await figma.createSlide(args);
  return { nodeId: node.id, type: "SLIDE" };
};

// after:
import { requireSlides } from "./guard";

export const createSlidePluginHandler: PluginHandler<typeof CreateSlide> = async (
  args,
  { figma }
) => {
  const sl = requireSlides(figma, "create_slide");
  const node = await sl.createSlide(args);
  return { nodeId: node.id, type: "SLIDE" };
};
```

Repeat for all 15 handlers. Drop the local `E_MISMATCH` constant — `requireSlides` owns the literal.

### Step 4: Re-export the guard — append to `packages/tools-slides/src/index.ts`

```ts
export * from "./tools";
export * from "./plugin-handlers";
export { requireSlides, E_FIGMA_EDITOR_TYPE_MISMATCH } from "./guard";
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/tools-slides test
git add packages/tools-slides/src
git commit -m "feat(tools-slides): requireSlides guard helper + handler refactor"
```

> The pre-existing handler tests (every "throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor" case from 12.3–12.7) continue to pass — the matched substring `E_FIGMA_EDITOR_TYPE_MISMATCH` is identical.

---

## Task 12.9: Wire `tools-slides` into mcp-server + bridge-plugin + e2e catalog test

**Goal:** Both `apps/mcp-server` and `apps/bridge-plugin` register the new pack. An e2e catalog test asserts the 15 wire names exist.

**Files:**

- Modify: `apps/mcp-server/package.json` (add `@repo/tools-slides`)
- Modify: `apps/mcp-server/src/main.ts` (register the pack + extend the shim's `tools` list)
- Modify: `apps/bridge-plugin/package.json` (add `@repo/tools-slides`)
- Modify: `apps/bridge-plugin/src/plugin.ts` (register all 15 handlers)
- Create: `apps/mcp-server/src/__tests__/e2e-phase12-catalog.test.ts`
- Modify: `bun.lock` (via `bun install`)

### Step 1: Failing test — `apps/mcp-server/src/__tests__/e2e-phase12-catalog.test.ts`

```ts
import {
  CreateSlide,
  CreateSlideRow,
  DeleteSlide,
  DuplicateSlide,
  GetSlide,
  GetSlideGrid,
  ListSlideRows,
  ListSlides,
  MoveSlide,
  SetActiveSlide,
  SetSlideBackground,
  SetSlideName,
  SetSlideSkipped,
  SetSlideTransition,
  SetSlidesView,
} from "@repo/tools-slides";
import { describe, expect, it } from "vitest";

describe("Phase 12 tool catalog", () => {
  it("exposes 15 slides tools with the expected names", () => {
    const names = [
      CreateSlide.name,
      CreateSlideRow.name,
      SetSlideName.name,
      SetSlideSkipped.name,
      SetSlideTransition.name,
      SetSlideBackground.name,
      MoveSlide.name,
      DuplicateSlide.name,
      DeleteSlide.name,
      ListSlides.name,
      ListSlideRows.name,
      SetActiveSlide.name,
      GetSlide.name,
      SetSlidesView.name,
      GetSlideGrid.name,
    ];
    expect(new Set(names).size).toBe(15);
    expect(names).toEqual([
      "create_slide",
      "create_slide_row",
      "set_slide_name",
      "set_slide_skipped",
      "set_slide_transition",
      "set_slide_background",
      "move_slide",
      "duplicate_slide",
      "delete_slide",
      "list_slides",
      "list_slide_rows",
      "set_active_slide",
      "get_slide",
      "set_slides_view",
      "get_slide_grid",
    ]);
  });

  it("every tool's input schema rejects extraneous keys (strict)", () => {
    const tools = [
      CreateSlide, CreateSlideRow, SetSlideName, SetSlideSkipped,
      SetSlideTransition, SetSlideBackground, MoveSlide, DuplicateSlide,
      DeleteSlide, ListSlides, ListSlideRows, SetActiveSlide,
      GetSlide, SetSlidesView, GetSlideGrid,
    ];
    for (const tool of tools) {
      const r = tool.input.safeParse({ __unexpected: 1 });
      // strict() rejects unknown keys; either parse fails outright or known
      // required keys are missing — both produce success: false.
      expect(r.success).toBe(false);
    }
  });
});
```

### Step 2: Add deps

```jsonc
// apps/mcp-server/package.json
"@repo/tools-slides": "workspace:*"

// apps/bridge-plugin/package.json
"@repo/tools-slides": "workspace:*"
```

Run `bun install`.

### Step 3: Wire into `main.ts` — extend imports + the `packs: [...]` array

```ts
import {
  CreateSlide, createSlidePluginHandler,
  CreateSlideRow, createSlideRowPluginHandler,
  DeleteSlide, deleteSlidePluginHandler,
  DuplicateSlide, duplicateSlidePluginHandler,
  GetSlide, getSlidePluginHandler,
  GetSlideGrid, getSlideGridPluginHandler,
  ListSlideRows, listSlideRowsPluginHandler,
  ListSlides, listSlidesPluginHandler,
  MoveSlide, moveSlidePluginHandler,
  SetActiveSlide, setActiveSlidePluginHandler,
  SetSlideBackground, setSlideBackgroundPluginHandler,
  SetSlideName, setSlideNamePluginHandler,
  SetSlideSkipped, setSlideSkippedPluginHandler,
  SetSlideTransition, setSlideTransitionPluginHandler,
  SetSlidesView, setSlidesViewPluginHandler,
} from "@repo/tools-slides";

// inside Daemon.start({ packs: [...] }), after the tools-figjam (and tools-rest, if present) entries:
{
  name: "tools-slides",
  tools: [
    CreateSlide, CreateSlideRow,
    SetSlideName, SetSlideSkipped,
    SetSlideTransition, SetSlideBackground,
    MoveSlide, DuplicateSlide, DeleteSlide,
    ListSlides, ListSlideRows, SetActiveSlide,
    GetSlide, SetSlidesView, GetSlideGrid,
  ],
  registerPlugin: (reg) => {
    reg.register(CreateSlide, createSlidePluginHandler);
    reg.register(CreateSlideRow, createSlideRowPluginHandler);
    reg.register(SetSlideName, setSlideNamePluginHandler);
    reg.register(SetSlideSkipped, setSlideSkippedPluginHandler);
    reg.register(SetSlideTransition, setSlideTransitionPluginHandler);
    reg.register(SetSlideBackground, setSlideBackgroundPluginHandler);
    reg.register(MoveSlide, moveSlidePluginHandler);
    reg.register(DuplicateSlide, duplicateSlidePluginHandler);
    reg.register(DeleteSlide, deleteSlidePluginHandler);
    reg.register(ListSlides, listSlidesPluginHandler);
    reg.register(ListSlideRows, listSlideRowsPluginHandler);
    reg.register(SetActiveSlide, setActiveSlidePluginHandler);
    reg.register(GetSlide, getSlidePluginHandler);
    reg.register(SetSlidesView, setSlidesViewPluginHandler);
    reg.register(GetSlideGrid, getSlideGridPluginHandler);
  },
},
```

Extend the shim's `tools: [...]` list:

```ts
const shim = await createStdioShim({
  socketPath: startup.socketPath,
  sourceClientId: `shim-${process.pid}`,
  tools: [
    // …existing 53 tools (Phases 3, 5, 8, 10, 11)…
    CreateSlide,
    CreateSlideRow,
    SetSlideName,
    SetSlideSkipped,
    SetSlideTransition,
    SetSlideBackground,
    MoveSlide,
    DuplicateSlide,
    DeleteSlide,
    ListSlides,
    ListSlideRows,
    SetActiveSlide,
    GetSlide,
    SetSlidesView,
    GetSlideGrid,
  ],
  mcpServerInfo: { name: "figma-mcp", version: VERSION },
});
```

### Step 4: Wire into the bridge plugin — `apps/bridge-plugin/src/plugin.ts`

```ts
import {
  CreateSlide, createSlidePluginHandler,
  CreateSlideRow, createSlideRowPluginHandler,
  DeleteSlide, deleteSlidePluginHandler,
  DuplicateSlide, duplicateSlidePluginHandler,
  GetSlide, getSlidePluginHandler,
  GetSlideGrid, getSlideGridPluginHandler,
  ListSlideRows, listSlideRowsPluginHandler,
  ListSlides, listSlidesPluginHandler,
  MoveSlide, moveSlidePluginHandler,
  SetActiveSlide, setActiveSlidePluginHandler,
  SetSlideBackground, setSlideBackgroundPluginHandler,
  SetSlideName, setSlideNamePluginHandler,
  SetSlideSkipped, setSlideSkippedPluginHandler,
  SetSlideTransition, setSlideTransitionPluginHandler,
  SetSlidesView, setSlidesViewPluginHandler,
} from "@repo/tools-slides";

// inside start(), after the tools-figjam register() calls:
runtime.register(CreateSlide, createSlidePluginHandler);
runtime.register(CreateSlideRow, createSlideRowPluginHandler);
runtime.register(SetSlideName, setSlideNamePluginHandler);
runtime.register(SetSlideSkipped, setSlideSkippedPluginHandler);
runtime.register(SetSlideTransition, setSlideTransitionPluginHandler);
runtime.register(SetSlideBackground, setSlideBackgroundPluginHandler);
runtime.register(MoveSlide, moveSlidePluginHandler);
runtime.register(DuplicateSlide, duplicateSlidePluginHandler);
runtime.register(DeleteSlide, deleteSlidePluginHandler);
runtime.register(ListSlides, listSlidesPluginHandler);
runtime.register(ListSlideRows, listSlideRowsPluginHandler);
runtime.register(SetActiveSlide, setActiveSlidePluginHandler);
runtime.register(GetSlide, getSlidePluginHandler);
runtime.register(SetSlidesView, setSlidesViewPluginHandler);
runtime.register(GetSlideGrid, getSlideGridPluginHandler);
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/mcp-server test e2e-phase12-catalog
bun run --filter @repo/mcp-server test
bun run --filter @repo/bridge-plugin test
git add apps/mcp-server/src/main.ts apps/mcp-server/src/__tests__/e2e-phase12-catalog.test.ts apps/mcp-server/package.json apps/bridge-plugin/src/plugin.ts apps/bridge-plugin/package.json bun.lock
git commit -m "feat(mcp-server): register tools-slides pack"
```

---

## Task 12.10: Editor-type-mismatch wire-level e2e test

**Goal:** A focused wire-level test that proves the discriminator works end-to-end. The bridge plugin reports `editorType === "figma"`; calling a slides tool from the MCP shim returns `E_FIGMA_EDITOR_TYPE_MISMATCH` from the plugin handler. Mirrors Phase 10.11.

**Files:**

- Create: `apps/mcp-server/src/__tests__/e2e-slides-mismatch.test.ts`

### Step 1: Implement the test

Pattern matches `e2e.test.ts` and Phase 10.11 — spawn a daemon + shim with an in-memory `FigmaFake({editorType: "figma"})`, register the slides pack, send a `tools/call` for `create_slide`, assert the error message contains the discriminator code.

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import {
  CreateSlide,
  createSlidePluginHandler,
} from "@repo/tools-slides";
import { describe, expect, it } from "vitest";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";

describe("Slides editor-type mismatch", () => {
  it("returns E_FIGMA_EDITOR_TYPE_MISMATCH when called on a Figma editor", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-sl-"));
    const socketPath = join(dir, "daemon.sock");

    const figma = new FigmaFake({ editorType: "figma" });

    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0,
      version: "0.0.0",
      figma,
      packs: [
        {
          name: "tools-slides",
          tools: [CreateSlide],
          registerPlugin: (reg) => {
            reg.register(CreateSlide, createSlidePluginHandler);
          },
        },
      ],
    });

    try {
      const shim = await createStdioShim({
        socketPath,
        sourceClientId: "shim-sl-test",
        tools: [CreateSlide],
        mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
      });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await shim.connectMcp(serverTransport);
      const client = new Client({ name: "test-client", version: "0.0.0" });
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "create_slide",
        arguments: { name: "this should fail" },
      });

      // The shim returns the handler's error wrapped as a tool-call result
      // with isError: true. The structured content (or text content) carries
      // the discriminator string verbatim.
      expect(result.isError).toBe(true);
      const text =
        Array.isArray(result.content) && result.content[0]?.type === "text"
          ? (result.content[0] as { text: string }).text
          : JSON.stringify(result);
      expect(text).toContain("E_FIGMA_EDITOR_TYPE_MISMATCH");
      expect(text).toContain("create_slide");
    } finally {
      await daemon.stop();
    }
  });
});
```

### Step 2: Verify, commit

```bash
bun run --filter @repo/mcp-server test e2e-slides-mismatch
git add apps/mcp-server/src/__tests__/e2e-slides-mismatch.test.ts
git commit -m "test(mcp-server): wire-level slides editor-type mismatch e2e"
```

> If the existing daemon plumbing doesn't surface the underlying error message verbatim (e.g. it wraps everything in a generic `E_FIGMA_UNKNOWN`), update the test to assert against the wrapper code AND check the structured `error.data` payload for the inner message. The point is to prove the discriminator reaches the wire — the exact serialization is implementation-detail.

---

## Task 12.11: Real-Figma slides fixture stub (skipped by default)

**Goal:** Track the gap. Phase 9's `real-figma.golden.test.ts` round-trips a Design file via `/v1/files/<key>?depth=1` against a recorded fixture. Slides files DO appear in the REST API but with a less-documented schema than Design files; the practical value of round-tripping `SLIDE` / `SLIDE_ROW` / `SLIDE_GRID` nodes via REST is low because every Slides write tool runs plugin-side anyway.

We ship a **skipped** golden test now so:

1. The shape of a future Slides smoke harness is documented inline.
2. CI does not fail on Phase 12 merge (the test is `it.skip`).
3. A follow-up phase can either (a) record against `/v1/files/<key>/nodes?ids=<slide-id>` for individual slides, (b) introduce a plugin-driven recorder that captures Slides state via a side channel, or (c) accept that Slides plugin tooling is exercised entirely through unit tests against `FigmaFake`.

Same posture as Phase 10.10 — skipped, with TODO documenting why.

**Files:**

- Create: `apps/mcp-server/src/__tests__/real-figma-slides.golden.test.ts`

### Step 1: Implement the stub

```ts
// apps/mcp-server/src/__tests__/real-figma-slides.golden.test.ts
import { describe, it } from "vitest";

// TODO(phase 12+): Promote this to an active golden test once we settle
// on a Slides read strategy. Options:
//
//   A) /v1/files/<key>/nodes?ids=<slide-id> — works for individual slides
//      but requires us to know the ids in advance, defeating the
//      "structural roundtrip" purpose Phase 9 used for design files.
//
//   B) Plugin-driven recorder — the bridge plugin captures the Slides
//      file's grid via figma.getSlideGrid() and serializes
//      to a fixture. Requires a paired daemon+plugin during recording.
//
//   C) Accept that Slides coverage is FigmaFake-only. The 12.3-12.7 unit
//      tests + the 12.10 mismatch e2e test cover correctness; the
//      manual smoke is "open the bridge plugin in a real Slides file
//      and verify nothing throws."
//
// FIGMA_API_KEY is not relevant here yet — kept skipped unconditionally.
describe.skip("real-figma slides golden", () => {
  it("recorded slide grid + transitions round-trip", () => {
    // Placeholder. See TODO above.
  });
});
```

### Step 2: Verify, commit

```bash
bun run --filter @repo/mcp-server test real-figma-slides.golden
# → "0 tests, 1 skipped" — passes vacuously.
git add apps/mcp-server/src/__tests__/real-figma-slides.golden.test.ts
git commit -m "test(mcp-server): add skipped real-figma slides golden stub"
```

> Documenting why this is NOT a hard requirement is part of the task. The "Notes on Execution" section reiterates this and the changeset (Task 12.12) calls it out as out-of-scope-but-tracked.

---

## Task 12.12: Coverage gate + Phase 12 changeset + acceptance

**Files:**

- Verify `packages/tools-slides/vitest.config.ts` thresholds (≥90/85/90/90)
- Verify `packages/figma-adapter/vitest.config.ts` thresholds (≥90/85/90/90)
- Create: `.changeset/phase-12-tools-slides.md`

### Step 1: Per-pack coverage

```bash
bun run --filter @repo/tools-slides test --coverage
bun run --filter @repo/figma-adapter test --coverage
```

Each command must pass with no threshold violations. If a sub-area dips below the bar, add table-driven tests for the missing branches. Do NOT lower thresholds.

### Step 2: Root acceptance

```bash
bun run lint
bun run types
bun run test
```

All green.

### Step 3: Changeset — `.changeset/phase-12-tools-slides.md`

```markdown
---
"@bromso/figma-mcp": minor
"@repo/tools-slides": minor
"@repo/figma-adapter": minor
---

Phase 12: tools-slides pack.

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
```

### Step 4: Commit

```bash
git add .changeset/phase-12-tools-slides.md
git commit -m "chore(changeset): record Phase 12 tools-slides"
```

### Step 5: Final acceptance pass

```bash
bun run lint && bun run types && bun run test
git log master..HEAD --oneline
```

**Phase 12 done.** The Slides tool pack is wired through both runtimes; the registry now exposes ~68 tools; editor-type mismatches surface a clear discriminator on the wire.

---

## Notes on Execution

**Why the editor-type discriminator lives in the tool handler, not the adapter.** Adapter methods are the testable seam — keeping them editor-agnostic means a unit test of `FigmaFake.createSlide()` works regardless of whether the surrounding `editorType` is `"slides"` or unset. If the adapter itself enforced the discriminator, every adapter test would need to first call `__setEditorType("slides")`, and downstream callers (e.g. a hypothetical `tools-cross-edit` pack that might want to read FigJam content from a Slides surface under specific circumstances) would have no escape hatch. The discriminator's job is "is this tool callable in the current editor?"; that's a tool-level concern, not an adapter-level one. The Phase 10 figjam pack landed the same posture; we mirror it verbatim here.

**Why the Slides plugin API surface is narrower than wishful thinking.** The `@figma/plugin-typings` package exposes the Slides factories (`figma.createSlide`, `figma.createSlideRow`, `figma.getSlideGrid`, `figma.setSlideGrid`, `figma.viewport.slidesView`, `figma.currentPage.focusedSlide`, plus per-slide methods `getSlideTransition` / `setSlideTransition` and the `isSkippedSlide` property + `clone()`). It does NOT expose: layout templates (no `slideType` arg on `createSlide`), speaker notes, thumbnail tints, presentation-mode start/stop, audience-pointer / cursor chat, or interactive-slide-element creation. The Phase 12 tool list is the maximally-covered subset that maps to actual plugin API capability. Wishlist items that don't map are documented in the "Plugin API verification" section above; each was either dropped or swapped for a tool that does map (e.g. `set_speaker_notes` → `set_slide_skipped`).

**Why `figma.setSlideGrid` is the canonical write path for `move_slide` and `duplicate_slide` placement.** The Slides API enforces that the entire grid round-trips through `setSlideGrid` — partial mutations (e.g. assigning a single slide to a row's children) are not exposed. Both `move_slide` and `duplicate_slide` therefore read the current grid via `figma.getSlideGrid()`, mutate the 2D array in memory, and write the whole thing back. This is fine for slide counts up to a few hundred (the typical real-world deck size); the operation is O(n) in slide count.

**Why slide titles are written via `slide.name` rather than a separate "title placeholder" tool.** A `SlideNode` extends `BaseFrameMixin`. The slide's title field, plugin-API-wise, is the slide node's `name`. There is no plugin API to address the title's text run inside the slide's child layer tree; if a user wants to set the title text inside a TITLE-layout slide's text frame, they can already do that via Phase 8's `set_text_characters` once they have the node id. The `set_slide_name` tool is therefore "the title surface" as far as the plugin API is concerned, and it doubles as the tool that names the slide for navigation purposes.

**Why we expose `set_slide_skipped` instead of `set_speaker_notes`.** `slide.notes` does NOT exist in `@figma/plugin-typings`. The closest slide-level metadata flag the API exposes is `slide.isSkippedSlide: boolean` — which lets a plugin programmatically mark a slide as skipped during presentation playback. This is the plugin-API-supported analog to "edit the speaker notes pane" (which is a product UI feature not exposed to plugins). If a follow-up phase finds the `notes` API documented (Figma occasionally publishes new plugin API surface area), `set_speaker_notes` becomes a 1-line addition.

**Why we don't expose programmatic presentation mode.** There is no `figma.startPresentation()` / `figma.stopPresentation()`. The plugin runtime can mark slides as skipped, set transitions, focus a slide, and toggle the editor's grid/single-slide viewport — that's the maximum the plugin API permits. Triggering the actual presentation overlay is product UX, not plugin-reachable.

**Why we don't expose `InteractiveSlideElementNode` creation.** The type exists (POLL, EMBED, FACEPILE, ALIGNMENT, YOUTUBE) but `figma.createInteractiveSlideElement(...)` does not. These nodes are read-only via `slide.children` traversal — the plugin API can inspect them but cannot author them.

**Why tests use `new FigmaFake({editorType: "slides"})`.** The default editor type for `FigmaFake` is `"figma"` (set at construction). Slides tool tests therefore have to pass the option explicitly; this is intentional — accidentally testing on the default would mean every test passes the discriminator guard for the wrong reason. The `slidesCtx()` / `figmaCtx()` / `figJamCtx()` helpers in the handler tests make the contrast explicit.

**Why the Slides plugin API uses methods (`getSlideTransition` / `setSlideTransition`) instead of a `transition` property.** This is a quirk of the typings — most slide metadata is exposed as direct properties (`name`, `isSkippedSlide`), but transitions are accessed through methods. Our adapter contract normalizes this: `setSlideTransition({slideId, ...})` and `getSlideTransition({slideId})`. The `RealFigmaAdapter` does the runtime call; the `FigmaFake` stores the transition object directly on the mutable slide.

**Why slide rows aren't directly reorderable.** `figma.setSlideGrid(grid)` accepts a 2D `SlideNode[][]`, not a `SlideRowNode[]`. To reorder rows, the adapter would have to (a) read the current grid, (b) reorder its outer dimension, and (c) write back. We didn't ship a `move_slide_row` tool because (a) it's plugin-API-reachable but rarely needed (LLM workflows almost always want to move individual slides, not whole rows), and (b) it can be implemented as a follow-up by composing `getSlideGrid` + `setSlideGrid`. If a future phase ships it, the adapter method naturally extends.

**Why the FigmaFake's grid model uses `string[][]`.** The plugin API's `getSlideGrid()` returns `SlideNode[][]`. Our `getSlideGrid()` returns `string[][]` (slide ids) for two reasons: (1) the wire serialization is id-based — clients can't carry node references across an IPC boundary; (2) callers can resolve ids → snapshots via `getNodeById`. The `RealFigmaAdapter`'s `getSlideGrid()` runs the id-mapping locally before returning.

**Why `set_active_slide` writes `figma.currentPage.focusedSlide` instead of calling a `scrollAndZoomIntoSlide` method.** The Slides plugin API does not expose a viewport-zoom method analogous to `figma.viewport.scrollAndZoomIntoView(nodes)` for slides specifically. The canonical way to focus a slide programmatically is to assign `figma.currentPage.focusedSlide = slide`. The Slides editor responds to this assignment by entering single-slide view (or, if already in single-slide view, switching to the assigned slide). Our `set_slides_view` tool can be combined with `set_active_slide` for the full "focus + zoom" effect.

**Why `set_slide_thumbnail_color` is dropped.** No plugin API surface. Slide thumbnails in the editor's grid view are auto-generated from slide content — the plugin runtime cannot tint them. We swap in `set_slides_view` instead, which is the closest plugin-API-reachable "viewport indicator" tool.

**Why we skip the real-figma slides golden test.** Phase 9's golden harness fetched `/v1/files/<key>?depth=1` and asserted the document name + page list. The same endpoint on a Slides file returns a tree where `SLIDE`, `SLIDE_ROW`, `SLIDE_GRID` nodes are present, but the canonical schema's stability for transitions and `isSkippedSlide` round-tripping is not documented as a public REST contract. Recording a stable fixture that survives re-runs is harder for Slides than for Design — and the value is lower because the Slides tools all run plugin-side anyway. Task 12.11's stub documents the gap; a follow-up phase can promote it once we've built either a plugin-driven recorder or accepted REST-side limitations.

**Why Phase 12's test count is healthy without server-side handlers.** No tool in this pack has a server-handler — every operation requires the Slides plugin runtime. A future server-side fallback would be a REST-API-backed read tool (e.g. `list_slides_rest` that fetches via `/v1/files/<key>/nodes` and returns a digest). That's a follow-up to `@repo/tools-rest` (Phase 11) territory, not Phase 12.

**Why the changeset bumps three packages, not five.** `@repo/mcp-server` and `@repo/bridge-plugin` are private workspace packages — they don't get versioned and shipped externally. Their changes are absorbed under the `@bromso/figma-mcp` distribution. (Phase 8's changeset bumped them all because `@repo/tools-console` and `@repo/tools-design` were both freshly published; here only `@repo/tools-slides` is new.) **Verify:** if the repo's changeset config (`.changeset/config.json`) ignores private packages, drop the explicit bumps; otherwise keep them. The acceptance criteria's "minor for `@bromso/figma-mcp`, `@repo/tools-slides`, `@repo/figma-adapter`" reflects the public-published surface.

**Coverage thresholds.** Both affected packages (`figma-adapter`, `tools-slides`) use the same per-pack bar from the master plan: lines/functions/statements ≥90, branches ≥85. Adding 17 methods to `figma-adapter` will push branch coverage if the new error paths aren't all exercised — Task 12.1's failing-test set covers each `not found`, `not slide`, `out of range` branch. If branch coverage dips, add a table-driven test for the missing case rather than lowering the gate.

**Order-of-execution dependency.** Tasks 12.3–12.7 depend on Task 12.1 (the adapter methods must exist). Task 12.8 depends on 12.3–12.7 (refactor target). Task 12.9 depends on 12.8 (the handlers it imports must be in their final shape). Tasks 12.10 + 12.11 depend on 12.9 (the wire registration is in place). Task 12.12 is last. The task numbering reflects this order.

**No `server-handlers.ts` for this pack.** As with Phase 8's tools-console + tools-design and Phase 10's tools-figjam, the Slides pack is plugin-side only — there's no REST-API-backed alternative implementation, and no server-state for the server side to report. If a follow-up phase needs a server-side fallback (e.g. cloud-mode Slides read via the REST API), that's where `server-handlers.ts` lands.

**Editor-type discriminator semantics, recap.** Phase 10 introduced `E_FIGMA_EDITOR_TYPE_MISMATCH` for FigJam; Phase 12 reuses the same wire code for Slides. The handler-thrown error string format is identical (`E_FIGMA_EDITOR_TYPE_MISMATCH: <tool_name> requires editorType=<expected> (got <actual>)`); the only difference is the `expected` token (`figjam` vs `slides`). The daemon's protocol-error mapper does not need to grow a new branch — the existing branch that recognizes the prefix already routes both pack mismatches to the same wire code. If a follow-up phase ships `@repo/tools-a11y` (any-editor), it skips the discriminator entirely.

---

## Out of scope

- `@repo/tools-a11y` — audit / lint / annotation tools. Separate phase.
- Programmatic presentation mode (`figma.startPresentation()` / `stopPresentation()`). Not in plugin API.
- Audience pointer, cursor chat, audience analytics. Not in plugin API.
- AI-assisted slide generation. Not a plugin API capability.
- Slide layout templates (TITLE / SECTION / CONTENT enum on `createSlide`). Not in plugin API.
- Speaker notes (`slide.notes`). Not in plugin API.
- Slide thumbnail tinting. Not in plugin API.
- `InteractiveSlideElementNode` creation (POLL / EMBED / FACEPILE / ALIGNMENT / YOUTUBE). The type exists for read; no factory to create.
- `SlotNode` template-slot manipulation. Read-only via traversal.
- Smart-animate inter-frame layer matching configuration beyond passing the `SMART_ANIMATE` style.
- `SlideGridNode` direct mutation. `figma.setSlideGrid` is the only write path.
- `slidesviewchange` event subscription. Out-of-band from request/response.
- `move_slide_row` (reorder whole rows). Plugin-API-reachable but deferred — typical workflows move individual slides.
- A `delete_slide_row` tool — currently rows are implicitly created/deleted via grid mutation; an explicit row-delete is a follow-up.
- Real-figma golden coverage for Slides files (deferred; Task 12.11 ships a skipped stub).
- The deferred Phase 7 Windows IPC fix (named-pipe path resolution under `\\.\pipe\` on Windows). Tracked separately in `docs/plans/2026-05-06-figma-mcp-phase-7.md`'s "Out of scope".
- The deferred Phase 8 `query_console` regex DoS hardening (catastrophic backtracking guard / size limit on input). Tracked in Phase 8's "Out of scope".
- The deferred Phase 11 doctor `figma-api-key` check. Tracked in Phase 11's "Out of scope".
- Telemetry on tool usage / per-tool error rates.
- Tool versioning / deprecation channels. Nothing is removed or renamed in Phase 12.
- Cross-pack integration tests beyond the catalog assertion + the mismatch e2e.

---

## References

- Phase 10 plan (canonical pack pattern; this plan mirrors its structure verbatim): `docs/plans/2026-05-06-figma-mcp-phase-10.md`
- Phase 11 plan (server-handler / REST pack pattern): `docs/plans/2026-05-06-figma-mcp-phase-11.md`
- Phase 9 plan (real-figma harness): `docs/plans/2026-05-06-figma-mcp-phase-9.md`
- Phase 8 plan (canonical pack pattern, two packs): `docs/plans/2026-05-06-figma-mcp-phase-8.md`
- Phase 7 plan (CLI + diagnostics, Windows IPC follow-up): `docs/plans/2026-05-06-figma-mcp-phase-7.md`
- Phase 3 plan (canonical extract pack): `docs/plans/2026-05-06-figma-mcp-phase-3.md`
- Phase 2 plan (transport + figma-adapter): `docs/plans/2026-05-06-figma-mcp-phase-2.md`
- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md`
- Roadmap: `docs/plans/2026-05-06-figma-mcp-rewrite-plan.md` (Phase 12 high-level scope)
- Canonical Slides-mirror pack: `packages/tools-figjam/src/{tools,plugin-handlers,guard,index}.ts`
- Adapter contract: `packages/figma-adapter/src/adapter.ts`
- In-memory test double: `packages/figma-adapter/src/figma-fake.ts`
- Production adapter: `packages/figma-adapter/src/real-figma-adapter.ts`
- Bridge plugin runtime: `apps/bridge-plugin/src/runtime.ts`
- Bridge plugin entry: `apps/bridge-plugin/src/plugin.ts`
- mcp-server entry: `apps/mcp-server/src/main.ts`
- Protocol primitives: `packages/protocol/src/tools.ts` (`defineTool`, `PluginHandler`, `Pack`)
- Figma plugin API for slides: <https://www.figma.com/plugin-docs/api/figma-slides/> (`SlideNode`, `SlideRowNode`, `SlideGridNode`, `SlideTransition`, `figma.createSlide`, `figma.createSlideRow`, `figma.getSlideGrid`, `figma.setSlideGrid`, `figma.viewport.slidesView`, `figma.currentPage.focusedSlide` reference)
- `@figma/plugin-typings` 1.125.0 — `plugin-api.d.ts` lines 1204–1240 (factories), 3148–3175 (slidesView), 9341–9354 (focusedSlide), 10861–10960 (SlideNode + SlideRowNode + SlideGridNode + SlideTransition).
