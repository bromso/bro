# Phase 13: tools-a11y pack

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ship `@repo/tools-a11y` — 13 tools for accessibility audits and annotations: WCAG contrast checks, alt-text annotations, target-size audits, color-blindness simulation results. Brings the registry from ~68 to ~81 tools.

**Architecture:** Mirrors prior plugin-side packs (Phase 8 design, Phase 10 figjam, Phase 12 slides). Adapter extensions on `FigmaAdapter` for annotation read/write + a few helpers (computed contrast, computed bounding box). Tools are NOT editor-type-gated — accessibility concerns apply to Figma Design AND FigJam files (annotations work on either). Tools-rest can later add a server-side variant.

**Tech Stack:** Existing — Bun + Vitest + Zod. New utility code: WCAG 2.1 contrast formula (pure function). No new runtime deps.

---

## Plugin API verification (locked tool list)

The wishful list in the brief was reconciled against `@figma/plugin-typings@1.125.0`'s `plugin-api.d.ts`. The Figma plugin API surface that's actually reachable for accessibility tooling:

**Confirmed plugin API surface (any editor):**

- **Plugin data namespace.** Every `BaseNode` exposes `setPluginData(key, value): void` and `getPluginData(key): string`. The empty string is the canonical "absent" return value (the plugin API does not distinguish "missing" from "empty"). Plugin data is namespaced per plugin id; our tools use the same plugin id as the bridge plugin, so the writes are visible to other Bromso tools but not to other plugins. We pick the `a11y/<attr>` key prefix as a forward-compatible namespace.
- **Annotations API.** Most `SceneNode`s expose `annotations: readonly Annotation[]` as a read-write property (the plugin API is "assign a new array" — partial mutation isn't allowed). The `Annotation` interface is `{ label?: string, labelMarkdown?: string, properties?: AnnotationProperty[], categoryId?: string }`. Each `AnnotationProperty` is `{ type: AnnotationPropertyType }` where `AnnotationPropertyType ∈ {"width","height","minWidth","maxWidth","minHeight","maxHeight","fills","strokes","effects","textStyleId","textAlignHorizontal","textAlignVertical","fontName","fontSize","fontWeight","lineHeight","letterSpacing","itemSpacing","padding","layoutMode","opacity","mainComponent","cornerRadius"}`. Annotations are global to the file's annotation panel and round-trip with `figma.annotations.getAsync()` / `figma.annotations.setAsync()` — the canonical write path is `node.annotations = newArray` (read) and the global category list is `figma.annotations.categories: readonly AnnotationCategory[]` (each with `id`, `label`, `color`).
- **Annotation indices.** Per-node annotations are addressed by **array index** in the `node.annotations` list. The plugin API does not expose stable per-annotation ids (only category ids). Our tools therefore use the array index as the addressing scheme; this is documented in the tool descriptions and "Notes on Execution".
- **Fills/strokes.** Already accessible via the Phase 8 adapter (`SolidPaint` type). Contrast calculation is a pure function over `SolidPaint.color: {r,g,b}` (Figma's normalized [0,1] channel space).
- **Bounding boxes.** Every `SceneNode` (other than the page/document) exposes `absoluteBoundingBox: Rect | null` (`{x, y, width, height}`). For `audit_target_size` we read this directly. The value is already in absolute (page-space) CSS pixels at 1:1 zoom; no transformation needed.
- **Parent walking.** Every `SceneNode` exposes `parent: BaseNode & ChildrenMixin | null`. We walk up to find the first ancestor with a non-empty solid fill — that's the "background" for contrast purposes.
- **Editor-type independence.** All of the above APIs are available in `editorType: "figma"` AND `editorType: "figjam"`. (Slides also exposes them, but the bridge plugin is not yet published to the Slides editor — see Out of Scope.) The Phase 13 pack therefore does NOT install an editor-type guard; the tools are universal.

**Wishlist items that DO NOT map to plugin API (and how Phase 13 handles them):**

| Wishlist tool                          | Plugin API status                                                                                            | Phase 13 swap                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `simulate_color_blindness({nodeId})`   | NOT a plugin API capability. Figma does not render simulated views.                                          | We compute the **simulated hex color** in pure JS (Brettel et al. matrices) — no node mutation. The tool takes `({hex, type})` not `({nodeId, type})` and returns the simulated color. The LLM uses the result to decide whether to surface a warning. |
| `run_native_a11y_audit({nodeId})`      | NOT in plugin API.                                                                                           | We expose `audit_a11y_summary` (Task 13.9) — a composite that walks the node tree and aggregates contrast / target-size / alt-text / aria-label coverage from primitives we DO have. |
| `simulate_screen_reader({nodeId})`     | NOT in plugin API. Figma has no screen-reader output.                                                        | Out of scope. Documented in "Out of scope".                                            |
| `infer_aria_role({nodeId})`            | NOT a plugin API capability. Figma has no semantic-tag concept.                                              | Out of scope. We expose `set_landmark_role`/`get_landmark_role` for explicit author-supplied roles, but no inference. |
| `set_alt_text` via Figma's design-tab "alternative text" field | The official "alt text" input on Figma's design panel is product UI, NOT plugin-API-exposed. There is no `node.altText` property. | We write to `pluginData("a11y/altText")` AND attach a categoryless `Annotation` whose `label` is the alt text. The annotation gives the alt text a visible surface in the file's annotation panel. |
| `add_annotation` with rich properties  | The `properties` field is a typed enum (`width`, `fills`, etc.) — not free-form a11y metadata.               | Our `add_annotation` accepts `label` and an optional `categoryId`; we don't expose the typed `properties` array (it's a designer-facing surface, not a11y-metadata-friendly). |

**Locked tool list (13 tools, all plugin-API-backed or pure utility):**

1. `audit_contrast({nodeId})` — Compute the WCAG 2.x contrast ratio between a node's text fill and its resolved background (walks up the parent chain to the first solid fill).
2. `audit_target_size({nodeId})` — Check `absoluteBoundingBox` against WCAG 2.5.5 (24×24 minimum, 44×44 enhanced).
3. `simulate_color_blindness({hex, type})` — Pure utility. Returns simulated hex for protanopia/deuteranopia/tritanopia/achromatopsia.
4. `set_alt_text({nodeId, text})` — Writes `node.setPluginData("a11y/altText", text)` AND attaches an `Annotation`.
5. `get_alt_text({nodeId})` — Reads `node.getPluginData("a11y/altText")` (with annotation fallback).
6. `set_aria_label({nodeId, label})` — Writes `node.setPluginData("a11y/ariaLabel", label)`.
7. `get_aria_label({nodeId})` — Reads `node.getPluginData("a11y/ariaLabel")`.
8. `set_landmark_role({nodeId, role})` — Zod enum write to `a11y/landmarkRole`.
9. `get_landmark_role({nodeId})` — Read.
10. `list_annotations({nodeId})` — Returns the node's annotation list with array-index addressing.
11. `add_annotation({nodeId, label, categoryId?})` — Appends to `node.annotations`.
12. `remove_annotation({nodeId, annotationIndex})` — Drops the Nth annotation.
13. `audit_a11y_summary({nodeId, recursive?})` — Composite read: walks the node (and optionally children), aggregates contrast / target-size / alt-text / aria-label coverage. The marquee tool.

This is the full set Tasks 13.3–13.9 implement.

---

## Out of scope (call-out so the executor doesn't drift)

- **Editor-type guard.** Unlike `tools-figjam` (Phase 10) and `tools-slides` (Phase 12), the a11y pack does NOT install an editor-type discriminator. Plugin data + annotations + bounding boxes + fills are universal across `editorType: "figma"` and `editorType: "figjam"`. Task 13.11 ships a wire-level test asserting both editors work.
- **Native Figma a11y audit.** No `figma.runAccessibilityAudit()` exists. `audit_a11y_summary` is our own walker.
- **Screen-reader simulation.** Not a plugin API capability and not in scope. A future server-side tool could feed the file's structure into a model that synthesizes screen-reader output, but that's a different layer.
- **ARIA role / state inference.** Figma has no semantic-tag concept. We expose `set_landmark_role` / `get_landmark_role` for author-supplied data; we do NOT infer roles from layer names, fills, or layout patterns.
- **Auto-fix tools.** "Fix the contrast on this button" is a reasonable Phase 14+ tool but is out of scope here. Phase 13 ships AUDIT and ANNOTATION tools only — no mutators that change the design itself based on audit output. (Mutators that write metadata — `set_alt_text` etc. — are in scope; mutators that change visual properties — auto-darkening a button — are not.)
- **WCAG 2.0 mode toggle.** WCAG 2.0 and 2.1 share identical contrast thresholds; 2.2 added target-size. We hardcode the 2.2 thresholds and document the version inline.
- **APCA contrast formula.** WCAG 3.0's APCA formula is still in W3C draft as of writing. We ship the WCAG 2.x luminance formula; APCA is a follow-up.
- **Cross-component "design system contrast scan."** A multi-node composite that walks every text node in the page is a useful tool but is `audit_a11y_summary({recursive: true})` on the page node — covered.
- **Real-Figma golden coverage.** Phase 9's golden harness does not extend to a11y data (annotations / pluginData are not exposed via the REST `/v1/files` endpoint). Task 13.12 does not ship a golden test. Documented in "Out of scope".
- **Figma's design-tab "Alternative text" field.** This product-UI input is NOT plugin-API-exposed. Our `set_alt_text` writes to pluginData + an annotation as a forward-compatible substitute.
- **Localization of a11y annotations.** The annotation `label` is a single string. Multi-locale alt text is out of scope.
- **Image-as-text contrast detection.** `audit_contrast` requires a TEXT node. A button labeled with an image (a sin against a11y) is flagged as "no text fill" by `audit_a11y_summary` but not auto-graded.
- **Rich text run-level contrast.** A TEXT node with mixed colors per character has `fills: figma.mixed`. We surface "mixed fills, cannot evaluate" in the contrast result; we do NOT iterate text segments. Documented inline.
- **Gradient backgrounds.** A non-solid background fill cannot be auto-graded for contrast (gradient endpoints might pass but mid-gradient might fail). We return `passesAA: null, foreground: hex, background: "GRADIENT"` and let the AI decide.
- **Tool versioning / deprecation.** Tools are added in Phase 13; nothing is removed or renamed.
- **Cross-pack integration tests.** Each pack's tests are isolated against `FigmaFake`. The Task 13.10 e2e catalog test asserts only registration.
- **Per-tool telemetry.** No analytics, no opt-in flow.
- **Deferred items inherited:** Phase 7 Windows IPC fix; Phase 8 `query_console` regex DoS hardening; Phase 11 doctor `figma-api-key` check.

---

## Acceptance Criteria

- `packages/tools-a11y/` exists with 13 tool definitions (`audit_contrast`, `audit_target_size`, `simulate_color_blindness`, `set_alt_text`, `get_alt_text`, `set_aria_label`, `get_aria_label`, `set_landmark_role`, `get_landmark_role`, `list_annotations`, `add_annotation`, `remove_annotation`, `audit_a11y_summary`) and per-tool plugin handlers.
- Plugin handlers do NOT install an editor-type guard. Calling any a11y tool on `editorType: "figma"` or `editorType: "figjam"` is supported and tested. (Slides editor is also supported as an upper bound but isn't exercised in CI; the bridge plugin is currently Figma + FigJam.)
- `FigmaAdapter` interface in `packages/figma-adapter/src/adapter.ts` extends with the 7 new methods listed in Task 13.1; an `Annotation` type is added; `FigmaFake` mirrors them with deterministic in-memory storage; `RealFigmaAdapter` wraps the corresponding `figma.*` calls (`getNodeByIdAsync`, `setPluginData`/`getPluginData`, `node.annotations`, `node.absoluteBoundingBox`).
- `packages/tools-a11y/src/utils.ts` exports pure utility functions: `wcagContrastRatio`, `passesWCAG_AA`, `passesWCAG_AAA`, `simulateColorBlindness`, plus helper `hexToRgb`/`rgbToHex` and luminance computation. All have heavy unit-test coverage including known-good fixtures (black-on-white = 21:1, etc.).
- `apps/mcp-server/src/main.ts` registers `tools-a11y` alongside the existing 7 packs (`tools-extract`, `tools-variables`, `tools-console`, `tools-design`, `tools-figjam`, `tools-rest`, `tools-slides`). The shim's `tools` array is extended with all 13 new tool schemas.
- `apps/bridge-plugin/src/plugin.ts` registers the 13 plugin handlers on the runtime.
- An end-to-end catalog test asserts every Phase 13 tool name appears in the daemon's catalog (mirrors Phase 12's `e2e-phase12-catalog.test.ts`).
- A wire-level cross-editor test asserts `audit_contrast` works against BOTH `editorType: "figma"` AND `editorType: "figjam"` (single test, ~30 lines).
- Per-pack coverage ≥90/85/90/90 (lines/branches/functions/statements). `packages/figma-adapter` retains its existing bar.
- Phase 13 changeset under `.changeset/phase-13-tools-a11y.md`. The changeset bumps `@bromso/figma-mcp`, `@repo/tools-a11y`, and `@repo/figma-adapter` (all minor).
- Commit hygiene: each task ends with one conventional-commit-formatted commit. No multi-task commits. No `git add -A`.

---

## Task Map

| #     | Task                                                                                  | Package / App         | Type        |
| ----- | ------------------------------------------------------------------------------------- | --------------------- | ----------- |
| 13.1  | Adapter extensions (Annotation type, 7 methods, fake + real)                          | figma-adapter         | code        |
| 13.2  | `@repo/tools-a11y` package scaffold                                                   | tools-a11y (new)      | infra       |
| 13.3  | Pure utility module: WCAG contrast + target-size + color-blindness simulation         | tools-a11y            | code        |
| 13.4  | `tools-a11y`: `audit_contrast`, `audit_target_size`                                   | tools-a11y            | code        |
| 13.5  | `tools-a11y`: `simulate_color_blindness`                                              | tools-a11y            | code        |
| 13.6  | `tools-a11y`: alt-text + ARIA label set/get (4 tools)                                 | tools-a11y            | code        |
| 13.7  | `tools-a11y`: landmark role set/get (2 tools)                                         | tools-a11y            | code        |
| 13.8  | `tools-a11y`: annotation CRUD (3 tools)                                               | tools-a11y            | code        |
| 13.9  | `tools-a11y`: composite `audit_a11y_summary`                                          | tools-a11y            | code        |
| 13.10 | Wire `tools-a11y` into mcp-server + bridge-plugin + e2e catalog test                  | mcp-server + bridge   | code/tests  |
| 13.11 | Cross-editor wire-level e2e test                                                      | mcp-server            | tests       |
| 13.12 | Coverage gate + Phase 13 changeset + acceptance                                       | repo                  | infra       |

---

## Task 13.1: Adapter extensions for a11y tools

**Goal:** Extend `FigmaAdapter` with the 7 methods that the a11y tools depend on. Add an `Annotation` type. Mirror in `FigmaFake` (deterministic in-memory storage for pluginData and per-node annotation arrays) and in `RealFigmaAdapter` (wraps `figma.getNodeByIdAsync` + the existing plugin API). The new methods do NOT enforce any editor-type discriminator — accessibility concerns apply to every editor.

**Files:**

- Modify: `packages/figma-adapter/src/adapter.ts` (add `Annotation` type + 7 method signatures)
- Modify: `packages/figma-adapter/src/figma-fake.ts` (implement methods + add seeders)
- Modify: `packages/figma-adapter/src/real-figma-adapter.ts` (wrap `figma.*`)
- Modify: `packages/figma-adapter/src/index.ts` (re-export new types)
- Modify: `packages/figma-adapter/src/__tests__/figma-fake.test.ts` (extend)
- Modify: `packages/figma-adapter/src/__tests__/real-figma-adapter.test.ts` (extend)

### Step 1: Failing tests for `FigmaFake` — append to `figma-fake.test.ts`

```ts
describe("FigmaFake.getNodeA11yMeta + setNodeA11yMeta", () => {
  it("returns an empty object when no a11y data is set", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const frame = await fake.createFrame({ width: 100, height: 40 });
    const meta = await fake.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta).toEqual({});
  });

  it("round-trips altText / ariaLabel / landmarkRole", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const frame = await fake.createFrame({ width: 100, height: 40 });
    await fake.setNodeA11yMeta({ nodeId: frame.id, key: "altText", value: "Hero image" });
    await fake.setNodeA11yMeta({ nodeId: frame.id, key: "ariaLabel", value: "Submit form" });
    await fake.setNodeA11yMeta({ nodeId: frame.id, key: "landmarkRole", value: "main" });
    const meta = await fake.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta).toEqual({
      altText: "Hero image",
      ariaLabel: "Submit form",
      landmarkRole: "main",
    });
  });

  it("clears a key when value is null", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const frame = await fake.createFrame({ width: 100, height: 40 });
    await fake.setNodeA11yMeta({ nodeId: frame.id, key: "altText", value: "old" });
    await fake.setNodeA11yMeta({ nodeId: frame.id, key: "altText", value: null });
    const meta = await fake.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta.altText).toBeUndefined();
  });

  it("rejects unknown nodeId", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    await expect(
      fake.getNodeA11yMeta({ nodeId: "missing" })
    ).rejects.toThrow(/not found/i);
    await expect(
      fake.setNodeA11yMeta({ nodeId: "missing", key: "altText", value: "x" })
    ).rejects.toThrow(/not found/i);
  });

  it("rejects unknown key", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const frame = await fake.createFrame({ width: 100, height: 40 });
    await expect(
      fake.setNodeA11yMeta({
        nodeId: frame.id,
        key: "bogus" as never,
        value: "x",
      })
    ).rejects.toThrow(/key/i);
  });
});

describe("FigmaFake.getNodeAnnotations + setNodeAnnotations", () => {
  it("returns an empty array when no annotations are set", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const frame = await fake.createFrame({ width: 100, height: 40 });
    const list = await fake.getNodeAnnotations({ nodeId: frame.id });
    expect(list).toEqual([]);
  });

  it("round-trips annotations via setNodeAnnotations", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const frame = await fake.createFrame({ width: 100, height: 40 });
    await fake.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [
        { label: "Hero" },
        { label: "Variant", categoryId: "design-review" },
      ],
    });
    const list = await fake.getNodeAnnotations({ nodeId: frame.id });
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ label: "Hero" });
    expect(list[1]).toMatchObject({ label: "Variant", categoryId: "design-review" });
  });

  it("returned array is a fresh copy (mutations don't leak)", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const frame = await fake.createFrame({ width: 100, height: 40 });
    await fake.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [{ label: "Hero" }],
    });
    const list = (await fake.getNodeAnnotations({ nodeId: frame.id })) as Annotation[];
    list.push({ label: "Mutated" });
    const fresh = await fake.getNodeAnnotations({ nodeId: frame.id });
    expect(fresh).toHaveLength(1);
  });

  it("rejects unknown nodeId", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    await expect(
      fake.getNodeAnnotations({ nodeId: "missing" })
    ).rejects.toThrow(/not found/i);
    await expect(
      fake.setNodeAnnotations({
        nodeId: "missing",
        annotations: [{ label: "x" }],
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.getResolvedTextFill", () => {
  it("returns null for a node without a fills array", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const frame = await fake.createFrame({ width: 100, height: 40 });
    expect(await fake.getResolvedTextFill({ nodeId: frame.id })).toBeNull();
  });

  it("returns the first SOLID paint as {hex, opacity}", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const text = await fake.createText({ content: "hello" });
    await fake.setNodeFill({
      nodeId: text.id,
      paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 },
    });
    const fill = await fake.getResolvedTextFill({ nodeId: text.id });
    expect(fill).toEqual({ hex: "#000000", opacity: 1 });
  });

  it("rejects unknown nodeId", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    await expect(
      fake.getResolvedTextFill({ nodeId: "missing" })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.getResolvedBackground", () => {
  it("walks up parents to find the first solid fill", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const outer = await fake.createFrame({ width: 200, height: 100 });
    await fake.setNodeFill({
      nodeId: outer.id,
      paint: { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 },
    });
    const child = await fake.createTextInFrame({
      parentId: outer.id,
      content: "hi",
    });
    const bg = await fake.getResolvedBackground({ nodeId: child.id });
    expect(bg).toEqual({ hex: "#FFFFFF", opacity: 1 });
  });

  it("returns null when no ancestor has a solid fill", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const text = await fake.createText({ content: "hi" });
    expect(await fake.getResolvedBackground({ nodeId: text.id })).toBeNull();
  });
});

describe("FigmaFake.getNodeBoundingBox", () => {
  it("returns the node's bounding box", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const frame = await fake.createFrame({ width: 200, height: 80, x: 10, y: 20 });
    const box = await fake.getNodeBoundingBox({ nodeId: frame.id });
    expect(box).toEqual({ x: 10, y: 20, width: 200, height: 80 });
  });

  it("returns null when the node has no positional dimensions", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    // pages, documents, and similar parent containers have no bbox
    const text = await fake.createText({ content: "hi" });
    // text has a bbox in our model — synthesize a bbox-less node for the null branch
    await fake.__seedBboxlessNode("bbox1");
    const box = await fake.getNodeBoundingBox({ nodeId: "bbox1" });
    expect(box).toBeNull();
  });
});
```

> The `__seedBboxlessNode` test helper is added to `FigmaFake` for this test only — we need a node type that lacks `width`/`height` to exercise the "null bbox" branch. The seeder is non-public (`__` prefix); it's exported from `@repo/figma-adapter/testing` for use in adapter tests but is not part of the production interface.

Run: `bun run --filter @repo/figma-adapter test figma-fake` → FAIL.

### Step 2: Extend the interface — `packages/figma-adapter/src/adapter.ts`

Append (after the Slides additions from Phase 12):

```ts
/**
 * A node-level annotation as exposed by the Figma plugin API.
 * `label` is the displayed text; `categoryId` ties the annotation
 * to a category from `figma.annotations.categories`.
 *
 * Plugin API note: per-annotation stable ids are not exposed.
 * Our tools address annotations by array index in `node.annotations`.
 */
export interface Annotation {
  readonly label?: string;
  readonly categoryId?: string;
}

export type A11yMetaKey = "altText" | "ariaLabel" | "landmarkRole";

export interface NodeA11yMeta {
  readonly altText?: string;
  readonly ariaLabel?: string;
  readonly landmarkRole?: string;
}

export interface ResolvedFill {
  readonly hex: string;
  readonly opacity: number;
}

export interface NodeBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
```

Extend the `FigmaAdapter` interface with the 7 new methods:

```ts
export interface FigmaAdapter {
  // …existing members (Phase 2/8/10/12)…

  // ---- Phase 13: Accessibility metadata + computed properties ----

  /** Read all `a11y/*` plugin-data keys for a node. */
  getNodeA11yMeta(args: { nodeId: string }): Promise<NodeA11yMeta>;

  /**
   * Write a single `a11y/<key>` plugin-data entry. Pass `value: null`
   * to delete the key (writes the empty string under the hood — Figma's
   * plugin-data API uses "" as the absent value).
   */
  setNodeA11yMeta(args: {
    nodeId: string;
    key: A11yMetaKey;
    value: string | null;
  }): Promise<void>;

  /** Read the current annotation array for a node. */
  getNodeAnnotations(args: { nodeId: string }): Promise<readonly Annotation[]>;

  /** Replace the annotation array for a node. */
  setNodeAnnotations(args: {
    nodeId: string;
    annotations: readonly Annotation[];
  }): Promise<void>;

  /**
   * Return the first SOLID paint on the node as `{hex, opacity}`,
   * or `null` if the node has no solid fill (or fills are mixed /
   * not solid). For text contrast, callers want the text node's
   * own fill — not its ancestors'. (Use `getResolvedBackground`
   * for the ancestor walk.)
   */
  getResolvedTextFill(args: { nodeId: string }): Promise<ResolvedFill | null>;

  /**
   * Walk up the parent chain to the first ancestor with a SOLID
   * paint, returning `{hex, opacity}`. Returns `null` if no
   * ancestor has a solid fill. Skips nodes whose fills are
   * gradients / images / mixed (those can't be auto-graded for
   * contrast).
   */
  getResolvedBackground(args: { nodeId: string }): Promise<ResolvedFill | null>;

  /**
   * Return the node's `absoluteBoundingBox` in page-space CSS pixels.
   * Returns `null` when the node has no positional dimensions
   * (e.g. the document / page node).
   */
  getNodeBoundingBox(args: { nodeId: string }): Promise<NodeBoundingBox | null>;
}
```

> **Method count note:** the brief calls for "7 methods". The list above adds 7 (3 mutators, 4 readers). Coverage of all 7 is exercised by Step 1's failing-test set.

### Step 3: Implement on `FigmaFake` — `packages/figma-adapter/src/figma-fake.ts`

Add internal mutable shapes:

```ts
// Top of file, alongside the existing mutable maps:
private a11yMeta = new Map<string, Map<A11yMetaKey, string>>();
private nodeAnnotations = new Map<string, Annotation[]>();
private bboxlessNodes = new Set<string>();
```

Method bodies:

```ts
async getNodeA11yMeta(args: { nodeId: string }): Promise<NodeA11yMeta> {
  const node = this.allNodes.get(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  const map = this.a11yMeta.get(args.nodeId);
  if (!map) return {};
  const out: { altText?: string; ariaLabel?: string; landmarkRole?: string } = {};
  const altText = map.get("altText");
  if (altText) out.altText = altText;
  const ariaLabel = map.get("ariaLabel");
  if (ariaLabel) out.ariaLabel = ariaLabel;
  const landmarkRole = map.get("landmarkRole");
  if (landmarkRole) out.landmarkRole = landmarkRole;
  return out;
}

async setNodeA11yMeta(args: {
  nodeId: string;
  key: A11yMetaKey;
  value: string | null;
}): Promise<void> {
  const node = this.allNodes.get(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  if (
    args.key !== "altText" &&
    args.key !== "ariaLabel" &&
    args.key !== "landmarkRole"
  ) {
    throw new Error(`unknown a11y key: ${args.key}`);
  }
  let map = this.a11yMeta.get(args.nodeId);
  if (!map) {
    map = new Map();
    this.a11yMeta.set(args.nodeId, map);
  }
  if (args.value === null) {
    map.delete(args.key);
  } else {
    map.set(args.key, args.value);
  }
}

async getNodeAnnotations(args: { nodeId: string }): Promise<readonly Annotation[]> {
  const node = this.allNodes.get(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  const list = this.nodeAnnotations.get(args.nodeId) ?? [];
  // Return a fresh copy so callers can't mutate our internal state.
  return list.map((a) => ({ ...a }));
}

async setNodeAnnotations(args: {
  nodeId: string;
  annotations: readonly Annotation[];
}): Promise<void> {
  const node = this.allNodes.get(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  this.nodeAnnotations.set(
    args.nodeId,
    args.annotations.map((a) => ({ ...a }))
  );
}

async getResolvedTextFill(args: { nodeId: string }): Promise<ResolvedFill | null> {
  const node = this.allNodes.get(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  const fills = (node as { fills?: ReadonlyArray<SolidPaint> }).fills;
  if (!fills || fills.length === 0) return null;
  const solid = fills.find((p) => p.type === "SOLID");
  if (!solid) return null;
  return {
    hex: solidColorToHex(solid.color),
    opacity: solid.opacity ?? 1,
  };
}

async getResolvedBackground(args: { nodeId: string }): Promise<ResolvedFill | null> {
  const node = this.allNodes.get(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  let cursor: { id: string; parentId?: string } | undefined =
    node as { id: string; parentId?: string };
  while (cursor && cursor.parentId) {
    const parent = this.allNodes.get(cursor.parentId);
    if (!parent) break;
    const fills = (parent as { fills?: ReadonlyArray<SolidPaint> }).fills;
    const solid = fills?.find((p) => p.type === "SOLID");
    if (solid) {
      return {
        hex: solidColorToHex(solid.color),
        opacity: solid.opacity ?? 1,
      };
    }
    cursor = parent as { id: string; parentId?: string };
  }
  return null;
}

async getNodeBoundingBox(args: { nodeId: string }): Promise<NodeBoundingBox | null> {
  const node = this.allNodes.get(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  if (this.bboxlessNodes.has(args.nodeId)) return null;
  const w = (node as { width?: number }).width;
  const h = (node as { height?: number }).height;
  const x = (node as { x?: number }).x ?? 0;
  const y = (node as { y?: number }).y ?? 0;
  if (typeof w !== "number" || typeof h !== "number") return null;
  return { x, y, width: w, height: h };
}

/** Test-only seeder for nodes without a positional dimension. */
__seedBboxlessNode(id: string): void {
  this.allNodes.set(id, { id, type: "PAGE" } as never);
  this.bboxlessNodes.add(id);
}
```

> **`solidColorToHex` helper.** A small private utility — `Math.round((c ?? 0) * 255)` for each channel, then format as `#RRGGBB`. Already used by Phase 8's variable-mode path; lift it into a shared private function in `figma-fake.ts` if not already present.

> **Parent walking against `FigmaFake`.** Phase 8's frame-creation paths already track `parentId` on every child node when `createTextInFrame` / `createRectangleInFrame` insert into a parent frame. If a node was created without a parent (e.g. `createText` with no frame), `parentId` is undefined and the loop terminates immediately. The matching tests in Step 1 (the "no ancestor with solid fill" case) cover this.

### Step 4: Implement on `RealFigmaAdapter` — `packages/figma-adapter/src/real-figma-adapter.ts`

Mechanical translation. Each method calls `figma.getNodeByIdAsync` then reads/writes via the existing plugin API.

```ts
async getNodeA11yMeta(args: { nodeId: string }): Promise<NodeA11yMeta> {
  const node = await figma.getNodeByIdAsync(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  const out: { altText?: string; ariaLabel?: string; landmarkRole?: string } = {};
  for (const key of ["altText", "ariaLabel", "landmarkRole"] as const) {
    const v = (node as { getPluginData: (k: string) => string }).getPluginData(`a11y/${key}`);
    if (v !== "") out[key] = v;
  }
  return out;
}

async setNodeA11yMeta(args: {
  nodeId: string;
  key: A11yMetaKey;
  value: string | null;
}): Promise<void> {
  const node = await figma.getNodeByIdAsync(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  if (
    args.key !== "altText" &&
    args.key !== "ariaLabel" &&
    args.key !== "landmarkRole"
  ) {
    throw new Error(`unknown a11y key: ${args.key}`);
  }
  // Figma's setPluginData(value: "") clears the entry.
  const stored = args.value ?? "";
  (node as { setPluginData: (k: string, v: string) => void })
    .setPluginData(`a11y/${args.key}`, stored);
}

async getNodeAnnotations(args: { nodeId: string }): Promise<readonly Annotation[]> {
  const node = await figma.getNodeByIdAsync(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  const list = (node as { annotations?: readonly { label?: string; categoryId?: string }[] }).annotations ?? [];
  return list.map((a) => ({
    label: a.label,
    categoryId: a.categoryId,
  }));
}

async setNodeAnnotations(args: {
  nodeId: string;
  annotations: readonly Annotation[];
}): Promise<void> {
  const node = await figma.getNodeByIdAsync(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  (node as { annotations: readonly Annotation[] }).annotations = args.annotations.map((a) => ({
    label: a.label,
    categoryId: a.categoryId,
  }));
}

async getResolvedTextFill(args: { nodeId: string }): Promise<ResolvedFill | null> {
  const node = await figma.getNodeByIdAsync(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  const fills = (node as { fills?: ReadonlyArray<{ type: string; color?: { r: number; g: number; b: number }; opacity?: number }> }).fills;
  if (!fills || fills.length === 0) return null;
  const solid = fills.find((p) => p.type === "SOLID");
  if (!solid?.color) return null;
  return {
    hex: rgbToHex(solid.color),
    opacity: solid.opacity ?? 1,
  };
}

async getResolvedBackground(args: { nodeId: string }): Promise<ResolvedFill | null> {
  let cursor = await figma.getNodeByIdAsync(args.nodeId);
  if (!cursor) throw new Error(`node not found: ${args.nodeId}`);
  while (cursor) {
    const parent = (cursor as { parent?: unknown }).parent as
      | { fills?: ReadonlyArray<{ type: string; color?: { r: number; g: number; b: number }; opacity?: number }> }
      | undefined;
    if (!parent) break;
    const fills = parent.fills;
    const solid = fills?.find((p) => p.type === "SOLID");
    if (solid?.color) {
      return {
        hex: rgbToHex(solid.color),
        opacity: solid.opacity ?? 1,
      };
    }
    cursor = parent as never;
  }
  return null;
}

async getNodeBoundingBox(args: { nodeId: string }): Promise<NodeBoundingBox | null> {
  const node = await figma.getNodeByIdAsync(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  const bbox = (node as { absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null }).absoluteBoundingBox;
  if (!bbox) return null;
  return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
}
```

> **Why `figma.getNodeByIdAsync` for every call.** Phase 8's pattern; the plugin API used to be sync (`figma.getNodeById`) but the async version is required for cross-page nodes in the Figma editor. We follow the established convention.

> **Why we map plugin annotations through `{label, categoryId}` instead of returning the raw runtime objects.** The plugin runtime returns frozen objects whose extra fields (`labelMarkdown`, `properties`) we don't surface. Spreading is forbidden on the readonly arrays — we map explicitly.

### Step 5: Failing tests for `RealFigmaAdapter` — append to `real-figma-adapter.test.ts`

Pattern: stub `figma.getNodeByIdAsync`, assert the returned node's `getPluginData` / `setPluginData` / `annotations` get called with the right args.

```ts
describe("RealFigmaAdapter.setNodeA11yMeta", () => {
  it("calls setPluginData with the a11y/<key> namespace", async () => {
    const setPluginData = vi.fn();
    const node = { id: "n1", getPluginData: vi.fn().mockReturnValue(""), setPluginData };
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue(node),
    }));
    await new RealFigmaAdapter().setNodeA11yMeta({
      nodeId: "n1",
      key: "altText",
      value: "Hero image",
    });
    expect(setPluginData).toHaveBeenCalledWith("a11y/altText", "Hero image");
  });

  it("clears the entry when value is null", async () => {
    const setPluginData = vi.fn();
    const node = { id: "n1", getPluginData: vi.fn(), setPluginData };
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue(node),
    }));
    await new RealFigmaAdapter().setNodeA11yMeta({
      nodeId: "n1",
      key: "altText",
      value: null,
    });
    expect(setPluginData).toHaveBeenCalledWith("a11y/altText", "");
  });

  it("rejects unknown nodeId", async () => {
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue(null),
    }));
    await expect(
      new RealFigmaAdapter().setNodeA11yMeta({
        nodeId: "missing",
        key: "altText",
        value: "x",
      })
    ).rejects.toThrow(/not found/i);
  });

  it("rejects unknown key", async () => {
    const node = { id: "n1", getPluginData: vi.fn(), setPluginData: vi.fn() };
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue(node),
    }));
    await expect(
      new RealFigmaAdapter().setNodeA11yMeta({
        nodeId: "n1",
        key: "bogus" as never,
        value: "x",
      })
    ).rejects.toThrow(/key/i);
  });
});

describe("RealFigmaAdapter.getNodeA11yMeta", () => {
  it("reads each a11y/<key> via getPluginData and skips empty strings", async () => {
    const getPluginData = vi.fn((k: string) => {
      if (k === "a11y/altText") return "Hero";
      if (k === "a11y/ariaLabel") return "";
      if (k === "a11y/landmarkRole") return "main";
      return "";
    });
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue({ id: "n1", getPluginData }),
    }));
    const meta = await new RealFigmaAdapter().getNodeA11yMeta({ nodeId: "n1" });
    expect(meta).toEqual({ altText: "Hero", landmarkRole: "main" });
  });
});

describe("RealFigmaAdapter.setNodeAnnotations", () => {
  it("assigns node.annotations as a fresh mapped array", async () => {
    const node: { id: string; annotations?: readonly Annotation[] } = { id: "n1" };
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue(node),
    }));
    await new RealFigmaAdapter().setNodeAnnotations({
      nodeId: "n1",
      annotations: [{ label: "Hero", categoryId: "design-review" }],
    });
    expect(node.annotations).toEqual([{ label: "Hero", categoryId: "design-review" }]);
  });
});

describe("RealFigmaAdapter.getResolvedBackground", () => {
  it("walks up the parent chain to the first solid fill", async () => {
    const grandparent = {
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
    };
    const parent = { parent: grandparent, fills: [] };
    const node = { parent, fills: [] };
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue(node),
    }));
    const bg = await new RealFigmaAdapter().getResolvedBackground({ nodeId: "n1" });
    expect(bg).toEqual({ hex: "#FFFFFF", opacity: 1 });
  });

  it("returns null when no ancestor has a solid fill", async () => {
    const node = { parent: null };
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue(node),
    }));
    expect(
      await new RealFigmaAdapter().getResolvedBackground({ nodeId: "n1" })
    ).toBeNull();
  });
});

describe("RealFigmaAdapter.getNodeBoundingBox", () => {
  it("reads node.absoluteBoundingBox", async () => {
    const node = {
      absoluteBoundingBox: { x: 10, y: 20, width: 200, height: 80 },
    };
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue(node),
    }));
    expect(
      await new RealFigmaAdapter().getNodeBoundingBox({ nodeId: "n1" })
    ).toEqual({ x: 10, y: 20, width: 200, height: 80 });
  });

  it("returns null when absoluteBoundingBox is null", async () => {
    const node = { absoluteBoundingBox: null };
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockResolvedValue(node),
    }));
    expect(
      await new RealFigmaAdapter().getNodeBoundingBox({ nodeId: "n1" })
    ).toBeNull();
  });
});
```

### Step 6: Re-export new types — `packages/figma-adapter/src/index.ts`

```ts
export type {
  // …existing exports…
  // Phase 13 (a11y):
  Annotation, A11yMetaKey, NodeA11yMeta, ResolvedFill, NodeBoundingBox,
} from "./adapter";
```

### Step 7: Verify, commit

```bash
bun run --filter @repo/figma-adapter test
git add packages/figma-adapter/src packages/figma-adapter/src/__tests__
git commit -m "feat(figma-adapter): a11y metadata + annotation + computed-property methods"
```

---

## Task 13.2: `@repo/tools-a11y` package scaffold

**Goal:** A green-light scaffold so Tasks 13.3–13.9 land cleanly. NO tools yet — just the directory, `package.json`, empty `index.ts`, empty `tools.ts`, empty `plugin-handlers.ts`, and a `__tests__/` directory.

**Files:**

- Create: `packages/tools-a11y/package.json`
- Create: `packages/tools-a11y/tsconfig.json`
- Create: `packages/tools-a11y/vitest.config.ts`
- Create: `packages/tools-a11y/src/index.ts`
- Create: `packages/tools-a11y/src/tools.ts`
- Create: `packages/tools-a11y/src/plugin-handlers.ts`
- Create: `packages/tools-a11y/src/__tests__/.gitkeep`
- Modify: `bun.lock` (via `bun install`)

### Step 1: `package.json` — same shape as `@repo/tools-slides`

```json
{
  "name": "@repo/tools-a11y",
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

Copy verbatim from `tools-slides`. Coverage thresholds `lines: 90, branches: 85, functions: 90, statements: 90`.

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/index.ts"],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
      },
    },
  },
});
```

### Step 3: Empty source stubs

```ts
// src/tools.ts
// Phase 13.3-13.9 add 13 tool definitions here.
export {};

// src/plugin-handlers.ts
// Phase 13.3-13.9 add the per-tool handlers here.
// No editor-type guard — accessibility tools work on every editor.
export {};

// src/index.ts
/**
 * @repo/tools-a11y — accessibility audit + annotation tools.
 *
 * Unlike @repo/tools-figjam (Phase 10) and @repo/tools-slides (Phase 12),
 * this pack does NOT install an editor-type guard. WCAG audits, alt-text,
 * ARIA labels, landmark roles, and annotations are universal across
 * Figma Design and FigJam files (and, where the bridge plugin is
 * available, Figma Slides too).
 */
export * from "./tools";
export * from "./plugin-handlers";
export * from "./utils";
```

### Step 4: Install + verify

```bash
bun install
bun run --filter @repo/tools-a11y test
```

`vitest run --passWithNoTests` should exit 0.

### Step 5: Commit

```bash
git add packages/tools-a11y bun.lock
git commit -m "feat(tools-a11y): package scaffold (no tools yet)"
```

---

## Task 13.3: Pure utility module — WCAG contrast + target-size + color-blindness simulation

**Goal:** Ship `packages/tools-a11y/src/utils.ts` — a pure-function module with no adapter or runtime dependencies. Heavy unit tests against known-good fixtures (black/white = 21:1; red/green color-blindness simulation matrices). This module is the foundation Tasks 13.4 + 13.5 + 13.9 build on.

**Why this is non-trivial pure logic:** the WCAG luminance formula is a piecewise function (`channel < 0.03928 ? channel/12.92 : ((channel + 0.055)/1.055)^2.4`) that's easy to misimplement; the color-blindness simulation matrices (Brettel et al. 1997) are 3×3 transforms over linear-sRGB that round-trip with named fixtures. We need exhaustive coverage of:

1. The luminance formula at boundary values (0, 1, 0.03928).
2. Contrast ratio symmetry (`contrast(a, b) === contrast(b, a)`).
3. WCAG AA / AAA threshold logic (4.5:1 normal / 3:1 large for AA; 7:1 normal / 4.5:1 large for AAA).
4. Hex-rgb round-trip with case-insensitive input.
5. Named color-blindness simulations against published reference values.

Coverage gate ≥90/85/90/90 — this module is 100% testable.

**Files:**

- Create: `packages/tools-a11y/src/utils.ts`
- Create: `packages/tools-a11y/src/__tests__/utils.test.ts`

### Step 1: Failing tests — `packages/tools-a11y/src/__tests__/utils.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  hexToRgb,
  rgbToHex,
  relativeLuminance,
  wcagContrastRatio,
  passesWCAG_AA,
  passesWCAG_AAA,
  simulateColorBlindness,
} from "../utils";

describe("hexToRgb", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("#FFFFFF")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb("#FF0000")).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("parses 3-digit hex (expands each channel)", () => {
    expect(hexToRgb("#FFF")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb("#000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("#F00")).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("is case-insensitive", () => {
    expect(hexToRgb("#aabbcc")).toEqual(hexToRgb("#AABBCC"));
  });

  it("accepts hex without leading #", () => {
    expect(hexToRgb("FFFFFF")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("rejects malformed input", () => {
    expect(() => hexToRgb("nope")).toThrow(/hex/i);
    expect(() => hexToRgb("#GGGGGG")).toThrow(/hex/i);
    expect(() => hexToRgb("#1234567")).toThrow(/hex/i);
    expect(() => hexToRgb("")).toThrow(/hex/i);
  });
});

describe("rgbToHex", () => {
  it("formats normalized [0,1] channels as #RRGGBB uppercase", () => {
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
    expect(rgbToHex({ r: 1, g: 1, b: 1 })).toBe("#FFFFFF");
    expect(rgbToHex({ r: 1, g: 0, b: 0 })).toBe("#FF0000");
  });

  it("clamps out-of-range values to [0,1]", () => {
    expect(rgbToHex({ r: 1.5, g: -0.2, b: 0.5 })).toBe("#FF0080");
  });

  it("rounds to nearest 8-bit value", () => {
    expect(rgbToHex({ r: 0.5, g: 0.5, b: 0.5 })).toBe("#808080");
  });
});

describe("relativeLuminance", () => {
  it("returns 0 for pure black", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
  });

  it("returns 1 for pure white", () => {
    expect(relativeLuminance({ r: 1, g: 1, b: 1 })).toBeCloseTo(1, 6);
  });

  it("uses the piecewise sRGB linearization", () => {
    // Below the 0.03928 threshold, channel is divided by 12.92.
    const small = relativeLuminance({ r: 0.03, g: 0.03, b: 0.03 });
    const expected =
      0.2126 * (0.03 / 12.92) +
      0.7152 * (0.03 / 12.92) +
      0.0722 * (0.03 / 12.92);
    expect(small).toBeCloseTo(expected, 8);
  });

  it("matches the standard 0.2126 / 0.7152 / 0.0722 weights", () => {
    // Pure red:
    const red = relativeLuminance({ r: 1, g: 0, b: 0 });
    expect(red).toBeCloseTo(0.2126, 4);
    // Pure green:
    const green = relativeLuminance({ r: 0, g: 1, b: 0 });
    expect(green).toBeCloseTo(0.7152, 4);
    // Pure blue:
    const blue = relativeLuminance({ r: 0, g: 0, b: 1 });
    expect(blue).toBeCloseTo(0.0722, 4);
  });
});

describe("wcagContrastRatio", () => {
  it("black on white = 21:1", () => {
    const r = wcagContrastRatio(
      { r: 0, g: 0, b: 0 },
      { r: 1, g: 1, b: 1 }
    );
    expect(r).toBeCloseTo(21, 1);
  });

  it("is symmetric: contrast(a,b) === contrast(b,a)", () => {
    const a = { r: 0.2, g: 0.4, b: 0.6 };
    const b = { r: 0.9, g: 0.8, b: 0.1 };
    expect(wcagContrastRatio(a, b)).toBeCloseTo(wcagContrastRatio(b, a), 8);
  });

  it("identical colors = 1:1", () => {
    expect(
      wcagContrastRatio({ r: 0.5, g: 0.5, b: 0.5 }, { r: 0.5, g: 0.5, b: 0.5 })
    ).toBeCloseTo(1, 6);
  });

  it("Material Design's reference pair (#FFFFFF on #6200EE) ≈ 5.93:1", () => {
    const r = wcagContrastRatio(
      hexToRgb("#FFFFFF"),
      hexToRgb("#6200EE")
    );
    expect(r).toBeGreaterThan(5.5);
    expect(r).toBeLessThan(6.5);
  });

  it("WCAG-2 example: #777 on #FFF ≈ 4.48:1 (just fails AA normal)", () => {
    const r = wcagContrastRatio(hexToRgb("#777"), hexToRgb("#FFF"));
    expect(r).toBeGreaterThan(4.4);
    expect(r).toBeLessThan(4.6);
  });
});

describe("passesWCAG_AA", () => {
  it("4.5:1 passes AA for normal text", () => {
    expect(passesWCAG_AA(4.5, false)).toBe(true);
    expect(passesWCAG_AA(4.49, false)).toBe(false);
  });

  it("3:1 passes AA for large text", () => {
    expect(passesWCAG_AA(3, true)).toBe(true);
    expect(passesWCAG_AA(2.99, true)).toBe(false);
  });

  it("normal text needs 4.5:1, large text only 3:1", () => {
    expect(passesWCAG_AA(4, false)).toBe(false);
    expect(passesWCAG_AA(4, true)).toBe(true);
  });
});

describe("passesWCAG_AAA", () => {
  it("7:1 passes AAA for normal text", () => {
    expect(passesWCAG_AAA(7, false)).toBe(true);
    expect(passesWCAG_AAA(6.99, false)).toBe(false);
  });

  it("4.5:1 passes AAA for large text", () => {
    expect(passesWCAG_AAA(4.5, true)).toBe(true);
    expect(passesWCAG_AAA(4.49, true)).toBe(false);
  });
});

describe("simulateColorBlindness", () => {
  it("achromatopsia → greyscale of equal luminance", () => {
    const grey = simulateColorBlindness("#FF0000", "achromatopsia");
    // Pure red has luminance 0.2126 ≈ 54/255 ≈ 0x36
    const rgb = hexToRgb(grey);
    expect(rgb.r).toBeCloseTo(rgb.g, 2);
    expect(rgb.g).toBeCloseTo(rgb.b, 2);
  });

  it("protanopia maps red to a yellowish hue (red-blind)", () => {
    const out = simulateColorBlindness("#FF0000", "protanopia");
    const rgb = hexToRgb(out);
    // Protanopia removes the red channel's distinguishability;
    // the simulated red collapses toward the yellow-green axis.
    expect(rgb.r).toBeLessThan(0.7);
  });

  it("deuteranopia maps green similarly toward yellow", () => {
    const out = simulateColorBlindness("#00FF00", "deuteranopia");
    const rgb = hexToRgb(out);
    expect(rgb.g).toBeGreaterThan(0.5);
    // green still strong but red component creeps up
    expect(rgb.r).toBeGreaterThan(0.3);
  });

  it("tritanopia distorts blue", () => {
    const out = simulateColorBlindness("#0000FF", "tritanopia");
    const rgb = hexToRgb(out);
    // tritanopia (blue-blind) collapses blue toward cyan/teal
    expect(rgb.b).toBeLessThan(0.95);
  });

  it("identity for greyscale input under any type", () => {
    for (const type of [
      "protanopia", "deuteranopia", "tritanopia", "achromatopsia",
    ] as const) {
      const out = simulateColorBlindness("#808080", type);
      const rgb = hexToRgb(out);
      expect(rgb.r).toBeCloseTo(rgb.g, 1);
      expect(rgb.g).toBeCloseTo(rgb.b, 1);
    }
  });

  it("rejects unknown type", () => {
    expect(() =>
      simulateColorBlindness("#FF0000", "unknown" as never)
    ).toThrow(/type/i);
  });

  it("rejects malformed hex", () => {
    expect(() =>
      simulateColorBlindness("nope", "protanopia")
    ).toThrow(/hex/i);
  });
});
```

Run: `bun run --filter @repo/tools-a11y test utils` → FAIL.

### Step 2: Implement the utility module — `packages/tools-a11y/src/utils.ts`

```ts
/**
 * Pure utility functions for accessibility computations.
 *
 * No runtime dependencies — every function operates on plain
 * `{r, g, b}` triplets in [0, 1] (Figma's normalized colorspace) or
 * `#RRGGBB` hex strings. The module is fully tree-shakeable.
 *
 * Sources:
 * - WCAG 2.1: https://www.w3.org/TR/WCAG21/#contrast-minimum
 * - WCAG 2.2: https://www.w3.org/TR/WCAG22/ (target size additions)
 * - Brettel et al. 1997: "Computerized simulation of color appearance
 *   for dichromats" (color-blindness simulation matrices). The
 *   transformations below use the published 3×3 RGB matrices as
 *   approximated for sRGB inputs by Machado et al. 2009. The
 *   coefficients are an industry-standard approximation (a11y
 *   reviewers will recognize them from `colorblind.js`,
 *   `colorblindness.js`, and Chromium DevTools).
 */

export interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX6_RE = /^#?[0-9a-fA-F]{6}$/;
const HEX3_RE = /^#?[0-9a-fA-F]{3}$/;

/**
 * Parse `#RRGGBB`, `#RGB`, `RRGGBB`, or `RGB` into a normalized
 * `{r, g, b}` triplet in [0, 1]. Throws on anything else.
 */
export function hexToRgb(hex: string): RGB {
  if (typeof hex !== "string") {
    throw new Error(`invalid hex: ${String(hex)}`);
  }
  let body: string;
  if (HEX6_RE.test(hex)) {
    body = hex.startsWith("#") ? hex.slice(1) : hex;
  } else if (HEX3_RE.test(hex)) {
    const s = hex.startsWith("#") ? hex.slice(1) : hex;
    body = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  } else {
    throw new Error(`invalid hex: ${hex}`);
  }
  const r = parseInt(body.slice(0, 2), 16) / 255;
  const g = parseInt(body.slice(2, 4), 16) / 255;
  const b = parseInt(body.slice(4, 6), 16) / 255;
  return { r, g, b };
}

/**
 * Format a normalized `{r, g, b}` triplet as `#RRGGBB` (uppercase).
 * Channels outside [0, 1] are clamped before rounding.
 */
export function rgbToHex(rgb: RGB): string {
  const clamp = (c: number) => Math.max(0, Math.min(1, c));
  const b8 = (c: number) =>
    Math.round(clamp(c) * 255)
      .toString(16)
      .toUpperCase()
      .padStart(2, "0");
  return `#${b8(rgb.r)}${b8(rgb.g)}${b8(rgb.b)}`;
}

/**
 * Linearize a single sRGB channel for luminance computation
 * (WCAG 2.x piecewise gamma).
 */
function linearize(c: number): number {
  if (c <= 0.03928) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Relative luminance of an sRGB color (WCAG 2.x).
 * Range: [0, 1]; pure black = 0, pure white = 1.
 */
export function relativeLuminance(rgb: RGB): number {
  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.x contrast ratio between two colors.
 * Range: [1, 21]. 1 = identical luminance, 21 = black on white.
 *
 * Symmetric: `wcagContrastRatio(a, b) === wcagContrastRatio(b, a)`.
 */
export function wcagContrastRatio(fg: RGB, bg: RGB): number {
  const Lfg = relativeLuminance(fg);
  const Lbg = relativeLuminance(bg);
  const L1 = Math.max(Lfg, Lbg);
  const L2 = Math.min(Lfg, Lbg);
  return (L1 + 0.05) / (L2 + 0.05);
}

/**
 * WCAG 2.x AA contrast threshold:
 * - 4.5:1 for normal text
 * - 3:1 for large text (≥18pt regular or ≥14pt bold)
 */
export function passesWCAG_AA(ratio: number, isLargeText: boolean): boolean {
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

/**
 * WCAG 2.x AAA contrast threshold:
 * - 7:1 for normal text
 * - 4.5:1 for large text
 */
export function passesWCAG_AAA(ratio: number, isLargeText: boolean): boolean {
  return isLargeText ? ratio >= 4.5 : ratio >= 7;
}

/**
 * WCAG 2.2 target-size minimum (Success Criterion 2.5.5):
 * 24×24 CSS pixels minimum, 44×44 enhanced.
 */
export const WCAG_TARGET_SIZE_MIN = 24;
export const WCAG_TARGET_SIZE_ENHANCED = 44;

export type ColorBlindnessType =
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "achromatopsia";

/**
 * Brettel-Machado simulation matrices for sRGB inputs.
 *
 * Each 3×3 matrix transforms an sRGB triplet to its simulated
 * dichromat appearance. Coefficients from Machado et al. (2009)
 * "A Physiologically-based Model for Simulation of Color Vision
 * Deficiency", Table 1 (severity 1.0 = full dichromacy).
 *
 * Note: These act on gamma-encoded sRGB directly (not linear-sRGB).
 * The error vs. a fully physically-correct simulation is small at
 * the resolutions we care about (per-pixel hex output) and the
 * approximation is what every public a11y tool uses.
 */
const SIMULATION_MATRICES: Record<ColorBlindnessType, readonly number[]> = {
  protanopia: [
    0.152286, 1.052583, -0.204868,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047413,
    -0.011820, 0.042940, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779,
    -0.078411, 0.930809, 0.147602,
    0.004733, 0.691367, 0.303900,
  ],
  // Achromatopsia (full color blindness) — Rec. 709 luma weights.
  achromatopsia: [
    0.2126, 0.7152, 0.0722,
    0.2126, 0.7152, 0.0722,
    0.2126, 0.7152, 0.0722,
  ],
};

/**
 * Simulate how a hex color appears under a given color-vision
 * deficiency. Returns the simulated color as `#RRGGBB` (uppercase).
 *
 * The result is not exact — the matrices are the standard sRGB
 * approximations used by `colorblindness.js`, Chrome DevTools,
 * and most a11y tools. The use case is "would this color survive
 * the deficiency at all?" — for that, the approximation is fine.
 */
export function simulateColorBlindness(
  hex: string,
  type: ColorBlindnessType
): string {
  const matrix = SIMULATION_MATRICES[type];
  if (!matrix) {
    throw new Error(`unknown color-blindness type: ${type}`);
  }
  const rgb = hexToRgb(hex);
  const r = matrix[0] * rgb.r + matrix[1] * rgb.g + matrix[2] * rgb.b;
  const g = matrix[3] * rgb.r + matrix[4] * rgb.g + matrix[5] * rgb.b;
  const b = matrix[6] * rgb.r + matrix[7] * rgb.g + matrix[8] * rgb.b;
  return rgbToHex({ r, g, b });
}
```

### Step 3: Verify, commit

```bash
bun run --filter @repo/tools-a11y test utils
git add packages/tools-a11y/src/utils.ts packages/tools-a11y/src/__tests__/utils.test.ts
git commit -m "feat(tools-a11y): WCAG contrast + color-blindness utility module"
```

> The utility module is fully self-contained — Tasks 13.4, 13.5, and 13.9 all import from `./utils`. Coverage on the module should land at 100% lines/functions/statements.

---

## Task 13.4: `tools-a11y` — `audit_contrast`, `audit_target_size`

**Goal:** First two audit tools. Both compose adapter reads with the Task 13.3 utility module. `audit_contrast` reads the node's resolved text fill + the resolved background, computes the WCAG ratio, and returns the AA / AAA pass/fail flags. `audit_target_size` reads the bounding box and compares against the WCAG 2.2 thresholds. Tests run against `new FigmaFake({ editorType: "figma" })`.

**Files:**

- Modify: `packages/tools-a11y/src/tools.ts`
- Modify: `packages/tools-a11y/src/plugin-handlers.ts`
- Create: `packages/tools-a11y/src/__tests__/tools.test.ts`
- Create: `packages/tools-a11y/src/__tests__/plugin-handlers.test.ts`

### Step 1: Failing tests — `tools.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { AuditContrast, AuditTargetSize } from "../tools";

describe("AuditContrast schema", () => {
  it("requires nodeId", () => {
    expect(AuditContrast.input.safeParse({ nodeId: "n1" }).success).toBe(true);
    expect(AuditContrast.input.safeParse({}).success).toBe(false);
  });

  it("rejects empty nodeId", () => {
    expect(AuditContrast.input.safeParse({ nodeId: "" }).success).toBe(false);
  });

  it("output captures ratio + AA/AAA flags + foreground/background hex", () => {
    expect(
      AuditContrast.output.safeParse({
        nodeId: "n1",
        ratio: 21,
        passesAA: true,
        passesAAA: true,
        isLargeText: false,
        foreground: "#000000",
        background: "#FFFFFF",
      }).success
    ).toBe(true);
  });

  it("output allows null background (no resolvable solid fill)", () => {
    expect(
      AuditContrast.output.safeParse({
        nodeId: "n1",
        ratio: null,
        passesAA: null,
        passesAAA: null,
        isLargeText: false,
        foreground: "#000000",
        background: null,
        reason: "no resolvable background fill",
      }).success
    ).toBe(true);
  });
});

describe("AuditTargetSize schema", () => {
  it("requires nodeId", () => {
    expect(AuditTargetSize.input.safeParse({ nodeId: "n1" }).success).toBe(true);
    expect(AuditTargetSize.input.safeParse({}).success).toBe(false);
  });

  it("output captures width/height + threshold flags", () => {
    expect(
      AuditTargetSize.output.safeParse({
        nodeId: "n1",
        width: 44,
        height: 44,
        passesMinimum: true,
        passesEnhanced: true,
      }).success
    ).toBe(true);
  });

  it("output allows null bbox (no measurable target)", () => {
    expect(
      AuditTargetSize.output.safeParse({
        nodeId: "n1",
        width: null,
        height: null,
        passesMinimum: null,
        passesEnhanced: null,
        reason: "node has no bounding box",
      }).success
    ).toBe(true);
  });
});
```

### Step 2: Failing tests — `plugin-handlers.test.ts`

```ts
import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  auditContrastPluginHandler,
  auditTargetSizePluginHandler,
} from "../plugin-handlers";

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const designCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "figma" }),
});
const figJamCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "figjam" }),
});

describe("auditContrastPluginHandler", () => {
  it("returns 21:1 ratio + AA/AAA pass for black text on white background", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 200, height: 100 });
    await ctx.figma.setNodeFill({
      nodeId: frame.id,
      paint: { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 },
    });
    const text = await ctx.figma.createTextInFrame({
      parentId: frame.id,
      content: "Hello",
    });
    await ctx.figma.setNodeFill({
      nodeId: text.id,
      paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 },
    });
    const out = await auditContrastPluginHandler(
      { nodeId: text.id },
      ctx
    );
    expect(out.ratio).toBeCloseTo(21, 1);
    expect(out.passesAA).toBe(true);
    expect(out.passesAAA).toBe(true);
    expect(out.foreground).toBe("#000000");
    expect(out.background).toBe("#FFFFFF");
  });

  it("returns null ratio when there is no resolvable background", async () => {
    const ctx = designCtx();
    const text = await ctx.figma.createText({ content: "orphan" });
    await ctx.figma.setNodeFill({
      nodeId: text.id,
      paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 },
    });
    const out = await auditContrastPluginHandler(
      { nodeId: text.id },
      ctx
    );
    expect(out.ratio).toBeNull();
    expect(out.passesAA).toBeNull();
    expect(out.background).toBeNull();
    expect(out.reason).toMatch(/background/i);
  });

  it("returns null ratio when there is no text fill", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 200, height: 100 });
    await ctx.figma.setNodeFill({
      nodeId: frame.id,
      paint: { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 },
    });
    const text = await ctx.figma.createTextInFrame({
      parentId: frame.id,
      content: "no fill",
    });
    const out = await auditContrastPluginHandler(
      { nodeId: text.id },
      ctx
    );
    expect(out.ratio).toBeNull();
    expect(out.foreground).toBeNull();
  });

  it("works on a FigJam editor (no editor-type guard)", async () => {
    const ctx = figJamCtx();
    const sticky = await ctx.figma.createSticky({
      content: "label",
    });
    // FigJam stickies have a default fill; assertion is just "doesn't throw"
    const out = await auditContrastPluginHandler(
      { nodeId: sticky.id },
      ctx
    );
    expect(out.nodeId).toBe(sticky.id);
  });

  it("rejects unknown nodeId", async () => {
    const ctx = designCtx();
    await expect(
      auditContrastPluginHandler({ nodeId: "missing" }, ctx)
    ).rejects.toThrow(/not found/i);
  });
});

describe("auditTargetSizePluginHandler", () => {
  it("44×44 passes both minimum (24) and enhanced (44)", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 44, height: 44 });
    const out = await auditTargetSizePluginHandler(
      { nodeId: frame.id },
      ctx
    );
    expect(out).toMatchObject({
      width: 44,
      height: 44,
      passesMinimum: true,
      passesEnhanced: true,
    });
  });

  it("24×24 passes minimum but fails enhanced", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 24, height: 24 });
    const out = await auditTargetSizePluginHandler(
      { nodeId: frame.id },
      ctx
    );
    expect(out.passesMinimum).toBe(true);
    expect(out.passesEnhanced).toBe(false);
  });

  it("23×24 fails minimum (uses min(width, height))", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 23, height: 24 });
    const out = await auditTargetSizePluginHandler(
      { nodeId: frame.id },
      ctx
    );
    expect(out.passesMinimum).toBe(false);
  });

  it("returns null bbox info when the node has no bounding box", async () => {
    const ctx = designCtx();
    ctx.figma.__seedBboxlessNode("bbox1");
    const out = await auditTargetSizePluginHandler(
      { nodeId: "bbox1" },
      ctx
    );
    expect(out.width).toBeNull();
    expect(out.passesMinimum).toBeNull();
    expect(out.reason).toMatch(/bounding box/i);
  });

  it("works on a FigJam editor", async () => {
    const ctx = figJamCtx();
    const sticky = await ctx.figma.createSticky({ content: "x" });
    const out = await auditTargetSizePluginHandler(
      { nodeId: sticky.id },
      ctx
    );
    expect(out.nodeId).toBe(sticky.id);
  });
});
```

### Step 3: Implement schemas — `tools.ts`

```ts
import { defineTool } from "@repo/protocol";
import { z } from "zod";

const NodeId = z.string().min(1);
const HexColor = z.string().regex(/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/);

export const AuditContrast = defineTool({
  name: "audit_contrast",
  description:
    "WCAG 2.x contrast audit. Computes the contrast ratio between the node's first SOLID text fill and the first SOLID fill on its ancestors (resolved background). Returns AA / AAA pass/fail flags. Returns null ratio when fill or background is unresolvable (e.g. mixed fills, gradient background, no parent with a solid fill).",
  streaming: false,
  input: z.object({ nodeId: NodeId }).strict(),
  output: z.object({
    nodeId: z.string(),
    ratio: z.number().nullable(),
    passesAA: z.boolean().nullable(),
    passesAAA: z.boolean().nullable(),
    isLargeText: z.boolean(),
    foreground: HexColor.nullable(),
    background: HexColor.nullable(),
    reason: z.string().optional(),
  }),
});

export const AuditTargetSize = defineTool({
  name: "audit_target_size",
  description:
    "WCAG 2.2 target-size audit (Success Criterion 2.5.5). Reads node.absoluteBoundingBox and reports whether min(width, height) is ≥ 24 (passesMinimum) and ≥ 44 (passesEnhanced).",
  streaming: false,
  input: z.object({ nodeId: NodeId }).strict(),
  output: z.object({
    nodeId: z.string(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    passesMinimum: z.boolean().nullable(),
    passesEnhanced: z.boolean().nullable(),
    reason: z.string().optional(),
  }),
});
```

### Step 4: Implement handlers — `plugin-handlers.ts`

```ts
import type { PluginHandler } from "@repo/protocol";
import {
  passesWCAG_AA,
  passesWCAG_AAA,
  hexToRgb,
  wcagContrastRatio,
  WCAG_TARGET_SIZE_MIN,
  WCAG_TARGET_SIZE_ENHANCED,
} from "./utils";
import type { AuditContrast, AuditTargetSize } from "./tools";

export const auditContrastPluginHandler: PluginHandler<typeof AuditContrast> = async (
  args,
  { figma }
) => {
  // Validate the node exists; throws "not found" on bad id.
  const fg = await figma.getResolvedTextFill({ nodeId: args.nodeId });
  // We don't have a way to detect "large text" from the node alone yet
  // (would need fontSize + fontWeight). Default to false; future tools
  // can pass it in from the caller.
  const isLargeText = false;

  if (!fg) {
    return {
      nodeId: args.nodeId,
      ratio: null,
      passesAA: null,
      passesAAA: null,
      isLargeText,
      foreground: null,
      background: null,
      reason: "node has no SOLID text fill",
    };
  }

  const bg = await figma.getResolvedBackground({ nodeId: args.nodeId });
  if (!bg) {
    return {
      nodeId: args.nodeId,
      ratio: null,
      passesAA: null,
      passesAAA: null,
      isLargeText,
      foreground: fg.hex,
      background: null,
      reason: "no resolvable background fill on ancestors",
    };
  }

  const ratio = wcagContrastRatio(hexToRgb(fg.hex), hexToRgb(bg.hex));
  return {
    nodeId: args.nodeId,
    ratio,
    passesAA: passesWCAG_AA(ratio, isLargeText),
    passesAAA: passesWCAG_AAA(ratio, isLargeText),
    isLargeText,
    foreground: fg.hex,
    background: bg.hex,
  };
};

export const auditTargetSizePluginHandler: PluginHandler<typeof AuditTargetSize> = async (
  args,
  { figma }
) => {
  const bbox = await figma.getNodeBoundingBox({ nodeId: args.nodeId });
  if (!bbox) {
    return {
      nodeId: args.nodeId,
      width: null,
      height: null,
      passesMinimum: null,
      passesEnhanced: null,
      reason: "node has no bounding box",
    };
  }
  const min = Math.min(bbox.width, bbox.height);
  return {
    nodeId: args.nodeId,
    width: bbox.width,
    height: bbox.height,
    passesMinimum: min >= WCAG_TARGET_SIZE_MIN,
    passesEnhanced: min >= WCAG_TARGET_SIZE_ENHANCED,
  };
};
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/tools-a11y test
git add packages/tools-a11y/src
git commit -m "feat(tools-a11y): audit_contrast, audit_target_size"
```

---

## Task 13.5: `tools-a11y` — `simulate_color_blindness`

**Goal:** A pure-utility tool. Takes `({hex, type})`, returns `{simulatedHex, type}`. No adapter access; the handler is a thin wrapper over `simulateColorBlindness` from `./utils`. The reason it's a tool at all (rather than a client-side helper) is consistency: every a11y-related computation an LLM might want is exposed through the same wire surface.

**Files:**

- Modify: `packages/tools-a11y/src/tools.ts`
- Modify: `packages/tools-a11y/src/plugin-handlers.ts`
- Modify: `packages/tools-a11y/src/__tests__/tools.test.ts`
- Modify: `packages/tools-a11y/src/__tests__/plugin-handlers.test.ts`

### Step 1: Failing tests — append to `tools.test.ts`

```ts
import { SimulateColorBlindness } from "../tools";

describe("SimulateColorBlindness schema", () => {
  it("accepts every documented type", () => {
    for (const type of [
      "protanopia", "deuteranopia", "tritanopia", "achromatopsia",
    ]) {
      expect(
        SimulateColorBlindness.input.safeParse({
          hex: "#FF0000",
          type,
        }).success
      ).toBe(true);
    }
  });

  it("rejects unknown type", () => {
    expect(
      SimulateColorBlindness.input.safeParse({
        hex: "#FF0000",
        type: "rainbow",
      }).success
    ).toBe(false);
  });

  it("rejects malformed hex", () => {
    expect(
      SimulateColorBlindness.input.safeParse({
        hex: "nope",
        type: "protanopia",
      }).success
    ).toBe(false);
  });

  it("output is {simulatedHex, type}", () => {
    expect(
      SimulateColorBlindness.output.safeParse({
        simulatedHex: "#808080",
        type: "achromatopsia",
        sourceHex: "#FF0000",
      }).success
    ).toBe(true);
  });
});
```

### Step 2: Failing tests — append to `plugin-handlers.test.ts`

```ts
import { simulateColorBlindnessPluginHandler } from "../plugin-handlers";

describe("simulateColorBlindnessPluginHandler", () => {
  it("returns the simulated hex for achromatopsia (greyscale)", async () => {
    const ctx = designCtx();
    const out = await simulateColorBlindnessPluginHandler(
      { hex: "#FF0000", type: "achromatopsia" },
      ctx
    );
    expect(out.type).toBe("achromatopsia");
    expect(out.sourceHex).toBe("#FF0000");
    // Achromatopsia: red has luminance ≈ 0.2126 → channels equal.
    const hex = out.simulatedHex;
    expect(hex).toMatch(/^#([0-9A-F]{2})\1\1$/);
  });

  it("works the same on every editor type (no guard)", async () => {
    const out1 = await simulateColorBlindnessPluginHandler(
      { hex: "#FF0000", type: "protanopia" },
      designCtx()
    );
    const out2 = await simulateColorBlindnessPluginHandler(
      { hex: "#FF0000", type: "protanopia" },
      figJamCtx()
    );
    expect(out1.simulatedHex).toBe(out2.simulatedHex);
  });
});
```

### Step 3: Implement schema — append to `tools.ts`

```ts
const ColorBlindnessType = z.enum([
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "achromatopsia",
]);

export const SimulateColorBlindness = defineTool({
  name: "simulate_color_blindness",
  description:
    "Simulate how a hex color appears to a viewer with the named color-vision deficiency. Pure computation — does not touch the design. Useful for the LLM to check whether a brand color survives the deficiency before accepting it.",
  streaming: false,
  input: z
    .object({
      hex: z.string().regex(/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/),
      type: ColorBlindnessType,
    })
    .strict(),
  output: z.object({
    sourceHex: z.string(),
    simulatedHex: z.string(),
    type: ColorBlindnessType,
  }),
});
```

### Step 4: Implement handler — append to `plugin-handlers.ts`

```ts
import { simulateColorBlindness } from "./utils";
import type { SimulateColorBlindness } from "./tools";

export const simulateColorBlindnessPluginHandler: PluginHandler<typeof SimulateColorBlindness> = async (
  args,
  _ctx
) => {
  const sourceHex = args.hex.startsWith("#") ? args.hex.toUpperCase() : `#${args.hex.toUpperCase()}`;
  const simulatedHex = simulateColorBlindness(args.hex, args.type);
  return {
    sourceHex,
    simulatedHex,
    type: args.type,
  };
};
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/tools-a11y test
git add packages/tools-a11y/src
git commit -m "feat(tools-a11y): simulate_color_blindness"
```

---

## Task 13.6: `tools-a11y` — alt-text + ARIA label set/get (4 tools)

**Goal:** Four metadata tools backed by the adapter's `setNodeA11yMeta` / `getNodeA11yMeta` seam from Task 13.1. `set_alt_text` ALSO appends a categoryless annotation to the node's annotation list (gives the alt text a visible surface in Figma's annotation panel). The other three are plain pluginData read/writes.

**Files:**

- Modify: `packages/tools-a11y/src/tools.ts`
- Modify: `packages/tools-a11y/src/plugin-handlers.ts`
- Modify: `packages/tools-a11y/src/__tests__/tools.test.ts`
- Modify: `packages/tools-a11y/src/__tests__/plugin-handlers.test.ts`

### Step 1: Failing tests — append to `tools.test.ts`

```ts
import {
  GetAltText,
  GetAriaLabel,
  SetAltText,
  SetAriaLabel,
} from "../tools";

describe("SetAltText schema", () => {
  it("requires nodeId + text", () => {
    expect(
      SetAltText.input.safeParse({ nodeId: "n1", text: "Hero" }).success
    ).toBe(true);
    expect(SetAltText.input.safeParse({ nodeId: "n1" }).success).toBe(false);
  });

  it("rejects empty text (use clear_alt_text in a follow-up if you need that)", () => {
    expect(
      SetAltText.input.safeParse({ nodeId: "n1", text: "" }).success
    ).toBe(false);
  });

  it("output reports nodeId + the stored text", () => {
    expect(
      SetAltText.output.safeParse({ nodeId: "n1", text: "Hero" }).success
    ).toBe(true);
  });
});

describe("GetAltText schema", () => {
  it("requires nodeId", () => {
    expect(GetAltText.input.safeParse({ nodeId: "n1" }).success).toBe(true);
  });

  it("output allows null text", () => {
    expect(
      GetAltText.output.safeParse({ nodeId: "n1", text: null }).success
    ).toBe(true);
    expect(
      GetAltText.output.safeParse({ nodeId: "n1", text: "Hero" }).success
    ).toBe(true);
  });
});

describe("SetAriaLabel schema", () => {
  it("requires nodeId + label", () => {
    expect(
      SetAriaLabel.input.safeParse({ nodeId: "n1", label: "Submit" }).success
    ).toBe(true);
    expect(SetAriaLabel.input.safeParse({ nodeId: "n1" }).success).toBe(false);
  });
});

describe("GetAriaLabel schema", () => {
  it("requires nodeId", () => {
    expect(GetAriaLabel.input.safeParse({ nodeId: "n1" }).success).toBe(true);
  });

  it("output allows null label", () => {
    expect(
      GetAriaLabel.output.safeParse({ nodeId: "n1", label: null }).success
    ).toBe(true);
  });
});
```

### Step 2: Failing tests — append to `plugin-handlers.test.ts`

```ts
import {
  getAltTextPluginHandler,
  getAriaLabelPluginHandler,
  setAltTextPluginHandler,
  setAriaLabelPluginHandler,
} from "../plugin-handlers";

describe("setAltTextPluginHandler", () => {
  it("writes the alt text to pluginData", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await setAltTextPluginHandler(
      { nodeId: frame.id, text: "Hero image" },
      ctx
    );
    const meta = await ctx.figma.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta.altText).toBe("Hero image");
  });

  it("ALSO appends an annotation with the same label", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await setAltTextPluginHandler(
      { nodeId: frame.id, text: "Hero image" },
      ctx
    );
    const annotations = await ctx.figma.getNodeAnnotations({ nodeId: frame.id });
    expect(annotations.some((a) => a.label === "Hero image")).toBe(true);
  });

  it("overwrites existing alt text on a second call (idempotent)", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await setAltTextPluginHandler({ nodeId: frame.id, text: "Old" }, ctx);
    await setAltTextPluginHandler({ nodeId: frame.id, text: "New" }, ctx);
    const meta = await ctx.figma.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta.altText).toBe("New");
  });

  it("works on a FigJam editor", async () => {
    const ctx = figJamCtx();
    const sticky = await ctx.figma.createSticky({ content: "x" });
    await setAltTextPluginHandler(
      { nodeId: sticky.id, text: "A sticky note" },
      ctx
    );
    const meta = await ctx.figma.getNodeA11yMeta({ nodeId: sticky.id });
    expect(meta.altText).toBe("A sticky note");
  });

  it("rejects unknown nodeId", async () => {
    const ctx = designCtx();
    await expect(
      setAltTextPluginHandler({ nodeId: "missing", text: "x" }, ctx)
    ).rejects.toThrow(/not found/i);
  });
});

describe("getAltTextPluginHandler", () => {
  it("reads pluginData", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeA11yMeta({
      nodeId: frame.id,
      key: "altText",
      value: "Stored alt",
    });
    const out = await getAltTextPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.text).toBe("Stored alt");
  });

  it("falls back to scanning annotations when pluginData is empty", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [{ label: "Annotation-only alt" }],
    });
    const out = await getAltTextPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.text).toBe("Annotation-only alt");
  });

  it("returns null when no alt text is set anywhere", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await getAltTextPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.text).toBeNull();
  });
});

describe("setAriaLabelPluginHandler", () => {
  it("writes the aria label to pluginData (no annotation)", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await setAriaLabelPluginHandler(
      { nodeId: frame.id, label: "Submit form" },
      ctx
    );
    const meta = await ctx.figma.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta.ariaLabel).toBe("Submit form");
    // ariaLabel does NOT also write an annotation — just pluginData.
    const annotations = await ctx.figma.getNodeAnnotations({ nodeId: frame.id });
    expect(annotations).toEqual([]);
  });
});

describe("getAriaLabelPluginHandler", () => {
  it("reads pluginData", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeA11yMeta({
      nodeId: frame.id,
      key: "ariaLabel",
      value: "Stored label",
    });
    const out = await getAriaLabelPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.label).toBe("Stored label");
  });

  it("returns null when not set", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await getAriaLabelPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.label).toBeNull();
  });
});
```

### Step 3: Implement schemas — append to `tools.ts`

```ts
export const SetAltText = defineTool({
  name: "set_alt_text",
  description:
    "Write alt text for a node. Stored in pluginData under `a11y/altText` AND attached as an annotation (categoryless) so the alt text is visible in Figma's annotation panel. Overwrites any existing alt text. Idempotent — calling again with a new value replaces both the pluginData entry and the existing annotation.",
  streaming: false,
  input: z
    .object({
      nodeId: NodeId,
      text: z.string().min(1),
    })
    .strict(),
  output: z.object({
    nodeId: z.string(),
    text: z.string(),
  }),
});

export const GetAltText = defineTool({
  name: "get_alt_text",
  description:
    "Read alt text for a node. First checks pluginData (`a11y/altText`); if absent, falls back to the first annotation whose category is the alt-text category (or, in this implementation, the first categoryless annotation). Returns null if neither source has a value.",
  streaming: false,
  input: z.object({ nodeId: NodeId }).strict(),
  output: z.object({
    nodeId: z.string(),
    text: z.string().nullable(),
  }),
});

export const SetAriaLabel = defineTool({
  name: "set_aria_label",
  description:
    "Write an ARIA label for a node. Stored in pluginData under `a11y/ariaLabel`. Does NOT attach an annotation (ARIA labels are usually shorter than alt text and clutter the annotation panel; designers can still surface them via `audit_a11y_summary`).",
  streaming: false,
  input: z
    .object({
      nodeId: NodeId,
      label: z.string().min(1),
    })
    .strict(),
  output: z.object({
    nodeId: z.string(),
    label: z.string(),
  }),
});

export const GetAriaLabel = defineTool({
  name: "get_aria_label",
  description:
    "Read the ARIA label for a node. Returns null if not set.",
  streaming: false,
  input: z.object({ nodeId: NodeId }).strict(),
  output: z.object({
    nodeId: z.string(),
    label: z.string().nullable(),
  }),
});
```

### Step 4: Implement handlers — append to `plugin-handlers.ts`

```ts
import type {
  GetAltText, GetAriaLabel, SetAltText, SetAriaLabel,
} from "./tools";

export const setAltTextPluginHandler: PluginHandler<typeof SetAltText> = async (
  args,
  { figma }
) => {
  await figma.setNodeA11yMeta({
    nodeId: args.nodeId,
    key: "altText",
    value: args.text,
  });
  // Drop any existing categoryless annotations whose label matches a previous
  // alt text (best-effort idempotence — annotations are array-indexed, no
  // stable ids), then append the new one.
  const existing = await figma.getNodeAnnotations({ nodeId: args.nodeId });
  const filtered = existing.filter((a) => a.categoryId !== undefined);
  await figma.setNodeAnnotations({
    nodeId: args.nodeId,
    annotations: [...filtered, { label: args.text }],
  });
  return { nodeId: args.nodeId, text: args.text };
};

export const getAltTextPluginHandler: PluginHandler<typeof GetAltText> = async (
  args,
  { figma }
) => {
  const meta = await figma.getNodeA11yMeta({ nodeId: args.nodeId });
  if (meta.altText !== undefined) {
    return { nodeId: args.nodeId, text: meta.altText };
  }
  // Fallback: scan annotations for a categoryless entry.
  const annotations = await figma.getNodeAnnotations({ nodeId: args.nodeId });
  const categoryless = annotations.find(
    (a) => a.categoryId === undefined && typeof a.label === "string"
  );
  if (categoryless?.label) {
    return { nodeId: args.nodeId, text: categoryless.label };
  }
  return { nodeId: args.nodeId, text: null };
};

export const setAriaLabelPluginHandler: PluginHandler<typeof SetAriaLabel> = async (
  args,
  { figma }
) => {
  await figma.setNodeA11yMeta({
    nodeId: args.nodeId,
    key: "ariaLabel",
    value: args.label,
  });
  return { nodeId: args.nodeId, label: args.label };
};

export const getAriaLabelPluginHandler: PluginHandler<typeof GetAriaLabel> = async (
  args,
  { figma }
) => {
  const meta = await figma.getNodeA11yMeta({ nodeId: args.nodeId });
  return {
    nodeId: args.nodeId,
    label: meta.ariaLabel ?? null,
  };
};
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/tools-a11y test
git add packages/tools-a11y/src
git commit -m "feat(tools-a11y): set/get alt_text + aria_label"
```

---

## Task 13.7: `tools-a11y` — landmark role set/get (2 tools)

**Goal:** Two metadata tools — `set_landmark_role` writes a Zod-validated landmark role to `a11y/landmarkRole`; `get_landmark_role` reads it. Roles match the WAI-ARIA landmark roles: `banner` | `navigation` | `main` | `complementary` | `contentinfo` | `search` | `form` | `region`.

**Files:**

- Modify: `packages/tools-a11y/src/tools.ts`
- Modify: `packages/tools-a11y/src/plugin-handlers.ts`
- Modify: `packages/tools-a11y/src/__tests__/tools.test.ts`
- Modify: `packages/tools-a11y/src/__tests__/plugin-handlers.test.ts`

### Step 1: Failing tests — append to `tools.test.ts`

```ts
import { GetLandmarkRole, SetLandmarkRole } from "../tools";

describe("SetLandmarkRole schema", () => {
  it("accepts every WAI-ARIA landmark role", () => {
    for (const role of [
      "banner", "navigation", "main", "complementary",
      "contentinfo", "search", "form", "region",
    ]) {
      expect(
        SetLandmarkRole.input.safeParse({ nodeId: "n1", role }).success
      ).toBe(true);
    }
  });

  it("rejects unknown role", () => {
    expect(
      SetLandmarkRole.input.safeParse({ nodeId: "n1", role: "header" }).success
    ).toBe(false);
  });

  it("requires nodeId + role", () => {
    expect(SetLandmarkRole.input.safeParse({ nodeId: "n1" }).success).toBe(false);
    expect(SetLandmarkRole.input.safeParse({ role: "main" }).success).toBe(false);
  });
});

describe("GetLandmarkRole schema", () => {
  it("output allows null role", () => {
    expect(
      GetLandmarkRole.output.safeParse({ nodeId: "n1", role: null }).success
    ).toBe(true);
    expect(
      GetLandmarkRole.output.safeParse({ nodeId: "n1", role: "main" }).success
    ).toBe(true);
  });
});
```

### Step 2: Failing tests — append to `plugin-handlers.test.ts`

```ts
import {
  getLandmarkRolePluginHandler,
  setLandmarkRolePluginHandler,
} from "../plugin-handlers";

describe("setLandmarkRolePluginHandler", () => {
  it("writes the role to pluginData", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await setLandmarkRolePluginHandler(
      { nodeId: frame.id, role: "main" },
      ctx
    );
    const meta = await ctx.figma.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta.landmarkRole).toBe("main");
  });

  it("overwrites a prior role", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await setLandmarkRolePluginHandler(
      { nodeId: frame.id, role: "banner" },
      ctx
    );
    await setLandmarkRolePluginHandler(
      { nodeId: frame.id, role: "main" },
      ctx
    );
    const meta = await ctx.figma.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta.landmarkRole).toBe("main");
  });
});

describe("getLandmarkRolePluginHandler", () => {
  it("returns the stored role", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeA11yMeta({
      nodeId: frame.id,
      key: "landmarkRole",
      value: "navigation",
    });
    const out = await getLandmarkRolePluginHandler(
      { nodeId: frame.id },
      ctx
    );
    expect(out.role).toBe("navigation");
  });

  it("returns null when not set", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await getLandmarkRolePluginHandler(
      { nodeId: frame.id },
      ctx
    );
    expect(out.role).toBeNull();
  });
});
```

### Step 3: Implement schemas — append to `tools.ts`

```ts
const LandmarkRole = z.enum([
  "banner",
  "navigation",
  "main",
  "complementary",
  "contentinfo",
  "search",
  "form",
  "region",
]);

export const SetLandmarkRole = defineTool({
  name: "set_landmark_role",
  description:
    "Tag a node with a WAI-ARIA landmark role. Writes pluginData under `a11y/landmarkRole`. Use to mark headers (`banner`), nav menus (`navigation`), main content regions (`main`), sidebars (`complementary`), footers (`contentinfo`), search forms (`search`), generic forms (`form`), or generic regions (`region`).",
  streaming: false,
  input: z
    .object({
      nodeId: NodeId,
      role: LandmarkRole,
    })
    .strict(),
  output: z.object({
    nodeId: z.string(),
    role: LandmarkRole,
  }),
});

export const GetLandmarkRole = defineTool({
  name: "get_landmark_role",
  description: "Read the WAI-ARIA landmark role tag for a node. Returns null if not set.",
  streaming: false,
  input: z.object({ nodeId: NodeId }).strict(),
  output: z.object({
    nodeId: z.string(),
    role: LandmarkRole.nullable(),
  }),
});
```

### Step 4: Implement handlers — append to `plugin-handlers.ts`

```ts
import type { GetLandmarkRole, SetLandmarkRole } from "./tools";
import type { A11yMetaKey } from "@repo/figma-adapter";

export const setLandmarkRolePluginHandler: PluginHandler<typeof SetLandmarkRole> = async (
  args,
  { figma }
) => {
  await figma.setNodeA11yMeta({
    nodeId: args.nodeId,
    key: "landmarkRole" satisfies A11yMetaKey,
    value: args.role,
  });
  return { nodeId: args.nodeId, role: args.role };
};

export const getLandmarkRolePluginHandler: PluginHandler<typeof GetLandmarkRole> = async (
  args,
  { figma }
) => {
  const meta = await figma.getNodeA11yMeta({ nodeId: args.nodeId });
  // Validate the stored value against the enum — pluginData is freeform,
  // so a previous tool version (or a different plugin) might have written
  // a different string. Treat unrecognized values as null.
  const role = meta.landmarkRole;
  const allowed = [
    "banner", "navigation", "main", "complementary",
    "contentinfo", "search", "form", "region",
  ] as const;
  const normalized = (allowed as readonly string[]).includes(role ?? "")
    ? (role as typeof allowed[number])
    : null;
  return { nodeId: args.nodeId, role: normalized };
};
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/tools-a11y test
git add packages/tools-a11y/src
git commit -m "feat(tools-a11y): set/get landmark_role"
```

---

## Task 13.8: `tools-a11y` — annotation CRUD (3 tools)

**Goal:** Three tools for direct annotation manipulation. `list_annotations` returns the node's annotation list with each entry's array index (the addressing scheme — annotations have no stable ids in the plugin API). `add_annotation` appends to the array. `remove_annotation` drops the Nth entry. All three are thin wrappers over `getNodeAnnotations` / `setNodeAnnotations`.

**Files:**

- Modify: `packages/tools-a11y/src/tools.ts`
- Modify: `packages/tools-a11y/src/plugin-handlers.ts`
- Modify: `packages/tools-a11y/src/__tests__/tools.test.ts`
- Modify: `packages/tools-a11y/src/__tests__/plugin-handlers.test.ts`

### Step 1: Failing tests — append to `tools.test.ts`

```ts
import {
  AddAnnotation,
  ListAnnotations,
  RemoveAnnotation,
} from "../tools";

describe("ListAnnotations schema", () => {
  it("requires nodeId", () => {
    expect(ListAnnotations.input.safeParse({ nodeId: "n1" }).success).toBe(true);
    expect(ListAnnotations.input.safeParse({}).success).toBe(false);
  });

  it("output is annotations: [{index, label?, categoryId?}]", () => {
    expect(
      ListAnnotations.output.safeParse({
        nodeId: "n1",
        annotations: [
          { index: 0, label: "Hero" },
          { index: 1, label: "Variant", categoryId: "design-review" },
        ],
        count: 2,
      }).success
    ).toBe(true);
  });
});

describe("AddAnnotation schema", () => {
  it("requires nodeId + label; categoryId optional", () => {
    expect(
      AddAnnotation.input.safeParse({ nodeId: "n1", label: "Hero" }).success
    ).toBe(true);
    expect(
      AddAnnotation.input.safeParse({
        nodeId: "n1",
        label: "Hero",
        categoryId: "design-review",
      }).success
    ).toBe(true);
    expect(
      AddAnnotation.input.safeParse({ nodeId: "n1" }).success
    ).toBe(false);
  });

  it("rejects empty label", () => {
    expect(
      AddAnnotation.input.safeParse({ nodeId: "n1", label: "" }).success
    ).toBe(false);
  });

  it("output reports the new index + total count", () => {
    expect(
      AddAnnotation.output.safeParse({
        nodeId: "n1",
        index: 0,
        count: 1,
      }).success
    ).toBe(true);
  });
});

describe("RemoveAnnotation schema", () => {
  it("requires nodeId + annotationIndex", () => {
    expect(
      RemoveAnnotation.input.safeParse({
        nodeId: "n1",
        annotationIndex: 0,
      }).success
    ).toBe(true);
    expect(
      RemoveAnnotation.input.safeParse({ nodeId: "n1" }).success
    ).toBe(false);
  });

  it("rejects negative index", () => {
    expect(
      RemoveAnnotation.input.safeParse({
        nodeId: "n1",
        annotationIndex: -1,
      }).success
    ).toBe(false);
  });

  it("rejects non-integer index", () => {
    expect(
      RemoveAnnotation.input.safeParse({
        nodeId: "n1",
        annotationIndex: 1.5,
      }).success
    ).toBe(false);
  });
});
```

### Step 2: Failing tests — append to `plugin-handlers.test.ts`

```ts
import {
  addAnnotationPluginHandler,
  listAnnotationsPluginHandler,
  removeAnnotationPluginHandler,
} from "../plugin-handlers";

describe("listAnnotationsPluginHandler", () => {
  it("returns an empty array when no annotations are set", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await listAnnotationsPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.annotations).toEqual([]);
    expect(out.count).toBe(0);
  });

  it("returns each annotation with its index", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [
        { label: "Hero" },
        { label: "Variant", categoryId: "design-review" },
      ],
    });
    const out = await listAnnotationsPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.annotations).toEqual([
      { index: 0, label: "Hero" },
      { index: 1, label: "Variant", categoryId: "design-review" },
    ]);
    expect(out.count).toBe(2);
  });
});

describe("addAnnotationPluginHandler", () => {
  it("appends a new annotation and returns its index", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await addAnnotationPluginHandler(
      { nodeId: frame.id, label: "Hero" },
      ctx
    );
    expect(out.index).toBe(0);
    expect(out.count).toBe(1);
    const list = await ctx.figma.getNodeAnnotations({ nodeId: frame.id });
    expect(list[0]).toEqual({ label: "Hero" });
  });

  it("appends with a categoryId when supplied", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await addAnnotationPluginHandler(
      {
        nodeId: frame.id,
        label: "Reviewed",
        categoryId: "design-review",
      },
      ctx
    );
    const list = await ctx.figma.getNodeAnnotations({ nodeId: frame.id });
    expect(list[0]).toEqual({ label: "Reviewed", categoryId: "design-review" });
  });

  it("preserves prior annotations", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [{ label: "First" }],
    });
    const out = await addAnnotationPluginHandler(
      { nodeId: frame.id, label: "Second" },
      ctx
    );
    expect(out.index).toBe(1);
    expect(out.count).toBe(2);
    const list = await ctx.figma.getNodeAnnotations({ nodeId: frame.id });
    expect(list.map((a) => a.label)).toEqual(["First", "Second"]);
  });
});

describe("removeAnnotationPluginHandler", () => {
  it("drops the Nth annotation by index", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [
        { label: "First" },
        { label: "Second" },
        { label: "Third" },
      ],
    });
    const out = await removeAnnotationPluginHandler(
      { nodeId: frame.id, annotationIndex: 1 },
      ctx
    );
    expect(out.count).toBe(2);
    const list = await ctx.figma.getNodeAnnotations({ nodeId: frame.id });
    expect(list.map((a) => a.label)).toEqual(["First", "Third"]);
  });

  it("rejects out-of-range indices", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [{ label: "First" }],
    });
    await expect(
      removeAnnotationPluginHandler(
        { nodeId: frame.id, annotationIndex: 5 },
        ctx
      )
    ).rejects.toThrow(/index/i);
  });

  it("rejects when there are no annotations", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await expect(
      removeAnnotationPluginHandler(
        { nodeId: frame.id, annotationIndex: 0 },
        ctx
      )
    ).rejects.toThrow(/index/i);
  });
});
```

### Step 3: Implement schemas — append to `tools.ts`

```ts
const NonNegativeInt = z.number().int().nonnegative();

const AnnotationSummary = z.object({
  index: NonNegativeInt,
  label: z.string().optional(),
  categoryId: z.string().optional(),
});

export const ListAnnotations = defineTool({
  name: "list_annotations",
  description:
    "Return every annotation attached to a node, with each entry's array index (annotations have no stable ids in the plugin API; the index is the addressing scheme).",
  streaming: false,
  input: z.object({ nodeId: NodeId }).strict(),
  output: z.object({
    nodeId: z.string(),
    annotations: z.array(AnnotationSummary),
    count: NonNegativeInt,
  }),
});

export const AddAnnotation = defineTool({
  name: "add_annotation",
  description:
    "Append an annotation to a node. The annotation appears in Figma's annotation panel attached to the node. `categoryId` ties it to a category (see `figma.annotations.categories`); omit for a categoryless annotation. Returns the new entry's array index.",
  streaming: false,
  input: z
    .object({
      nodeId: NodeId,
      label: z.string().min(1),
      categoryId: z.string().min(1).optional(),
    })
    .strict(),
  output: z.object({
    nodeId: z.string(),
    index: NonNegativeInt,
    count: NonNegativeInt,
  }),
});

export const RemoveAnnotation = defineTool({
  name: "remove_annotation",
  description:
    "Remove the annotation at the given array index. Indices shift after removal — re-list before removing more than one. Throws if `annotationIndex` is out of range.",
  streaming: false,
  input: z
    .object({
      nodeId: NodeId,
      annotationIndex: NonNegativeInt,
    })
    .strict(),
  output: z.object({
    nodeId: z.string(),
    count: NonNegativeInt,
  }),
});
```

### Step 4: Implement handlers — append to `plugin-handlers.ts`

```ts
import type {
  AddAnnotation, ListAnnotations, RemoveAnnotation,
} from "./tools";

export const listAnnotationsPluginHandler: PluginHandler<typeof ListAnnotations> = async (
  args,
  { figma }
) => {
  const list = await figma.getNodeAnnotations({ nodeId: args.nodeId });
  return {
    nodeId: args.nodeId,
    annotations: list.map((a, index) => ({
      index,
      label: a.label,
      categoryId: a.categoryId,
    })),
    count: list.length,
  };
};

export const addAnnotationPluginHandler: PluginHandler<typeof AddAnnotation> = async (
  args,
  { figma }
) => {
  const existing = await figma.getNodeAnnotations({ nodeId: args.nodeId });
  const next = [
    ...existing,
    {
      label: args.label,
      ...(args.categoryId !== undefined ? { categoryId: args.categoryId } : {}),
    },
  ];
  await figma.setNodeAnnotations({
    nodeId: args.nodeId,
    annotations: next,
  });
  return {
    nodeId: args.nodeId,
    index: existing.length,
    count: next.length,
  };
};

export const removeAnnotationPluginHandler: PluginHandler<typeof RemoveAnnotation> = async (
  args,
  { figma }
) => {
  const existing = await figma.getNodeAnnotations({ nodeId: args.nodeId });
  if (args.annotationIndex >= existing.length) {
    throw new Error(
      `annotation index out of range: ${args.annotationIndex} (have ${existing.length})`
    );
  }
  const next = [
    ...existing.slice(0, args.annotationIndex),
    ...existing.slice(args.annotationIndex + 1),
  ];
  await figma.setNodeAnnotations({
    nodeId: args.nodeId,
    annotations: next,
  });
  return { nodeId: args.nodeId, count: next.length };
};
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/tools-a11y test
git add packages/tools-a11y/src
git commit -m "feat(tools-a11y): annotation CRUD (list/add/remove)"
```

---

## Task 13.9: `tools-a11y` — composite `audit_a11y_summary`

**Goal:** The marquee tool. Walks a node (and optionally children, recursively), aggregates contrast / target-size / alt-text / aria-label / landmark-role coverage, and returns a single structured `{checks: [{name, status, detail}]}` report. The shape is designed so an LLM can grade a frame's a11y posture in one call without orchestrating the primitives itself.

**Why this is denser than typical:** the recursive walk needs:

1. A way to enumerate a node's children (the adapter's existing `listSectionChildren` from Phase 10 only works for FigJam sections — we need a generic "list child node ids" method).
2. A worst-case aggregation: if any child fails AA contrast, the parent's `contrast` check is `error`. If any child has a missing alt text on an image-like node, that's `warn`. The exact rubric is documented inline.
3. Deduplication: the node itself counts once, and each descendant counts once.

To keep this task scoped, we introduce ONE new adapter method (`listNodeChildren`) at the top of the task — fold it into the Task 13.1 PR retroactively if it's still open, otherwise add it as a one-line extension here.

**Files:**

- Modify: `packages/figma-adapter/src/adapter.ts` (add `listNodeChildren`)
- Modify: `packages/figma-adapter/src/figma-fake.ts` (implement)
- Modify: `packages/figma-adapter/src/real-figma-adapter.ts` (implement)
- Modify: `packages/figma-adapter/src/__tests__/figma-fake.test.ts` (test it)
- Modify: `packages/tools-a11y/src/tools.ts`
- Modify: `packages/tools-a11y/src/plugin-handlers.ts`
- Modify: `packages/tools-a11y/src/__tests__/tools.test.ts`
- Modify: `packages/tools-a11y/src/__tests__/plugin-handlers.test.ts`

### Step 1: Adapter extension — `listNodeChildren`

Add to `FigmaAdapter`:

```ts
/**
 * Return the immediate child node ids for a node. Returns an empty
 * array for leaf nodes (text, rect, etc.). Throws if the node id
 * is unknown.
 */
listNodeChildren(args: { nodeId: string }): Promise<readonly string[]>;
```

Failing test in `figma-fake.test.ts`:

```ts
describe("FigmaFake.listNodeChildren", () => {
  it("returns the immediate children of a frame", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const frame = await fake.createFrame({ width: 200, height: 100 });
    const text = await fake.createTextInFrame({
      parentId: frame.id,
      content: "hi",
    });
    const children = await fake.listNodeChildren({ nodeId: frame.id });
    expect(children).toEqual([text.id]);
  });

  it("returns an empty array for a leaf node", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    const text = await fake.createText({ content: "hi" });
    expect(await fake.listNodeChildren({ nodeId: text.id })).toEqual([]);
  });

  it("rejects unknown nodeId", async () => {
    const fake = new FigmaFake({ editorType: "figma" });
    await expect(
      fake.listNodeChildren({ nodeId: "missing" })
    ).rejects.toThrow(/not found/i);
  });
});
```

`FigmaFake` implementation:

```ts
private nodeChildren = new Map<string, string[]>();

// In createTextInFrame / createRectangleInFrame / similar:
private appendChild(parentId: string, childId: string): void {
  let arr = this.nodeChildren.get(parentId);
  if (!arr) {
    arr = [];
    this.nodeChildren.set(parentId, arr);
  }
  arr.push(childId);
}

async listNodeChildren(args: { nodeId: string }): Promise<readonly string[]> {
  const node = this.allNodes.get(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  return this.nodeChildren.get(args.nodeId)?.slice() ?? [];
}
```

`RealFigmaAdapter` implementation:

```ts
async listNodeChildren(args: { nodeId: string }): Promise<readonly string[]> {
  const node = await figma.getNodeByIdAsync(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  const children = (node as { children?: ReadonlyArray<{ id: string }> }).children;
  if (!children) return [];
  return children.map((c) => c.id);
}
```

> **Why a separate adapter method instead of returning children from `getNodeById`.** Phase 8's `NodeSnapshot` is intentionally flat — adding a `children: string[]` field would force every node to materialize its descendant list, which is expensive and rarely wanted. A dedicated `listNodeChildren` method keeps `getNodeById` cheap and lets the recursive audit explicitly opt in.

### Step 2: Failing tests for the audit — `tools.test.ts`

```ts
import { AuditA11ySummary } from "../tools";

describe("AuditA11ySummary schema", () => {
  it("requires nodeId; recursive defaults to false", () => {
    expect(
      AuditA11ySummary.input.safeParse({ nodeId: "n1" }).success
    ).toBe(true);
    expect(
      AuditA11ySummary.input.safeParse({ nodeId: "n1", recursive: true }).success
    ).toBe(true);
  });

  it("output captures checks: [{name, status, detail}]", () => {
    expect(
      AuditA11ySummary.output.safeParse({
        nodeId: "n1",
        checks: [
          { name: "contrast", status: "ok", detail: "21:1 AAA pass" },
          { name: "target_size", status: "warn", detail: "30×24 — fails enhanced (44)" },
          { name: "alt_text", status: "error", detail: "no alt text on 1 image-like node" },
        ],
        nodesScanned: 3,
      }).success
    ).toBe(true);
  });

  it("status is one of ok | warn | error", () => {
    expect(
      AuditA11ySummary.output.safeParse({
        nodeId: "n1",
        checks: [{ name: "contrast", status: "info", detail: "bad" }],
        nodesScanned: 1,
      }).success
    ).toBe(false);
  });
});
```

### Step 3: Failing tests — `plugin-handlers.test.ts`

```ts
import { auditA11ySummaryPluginHandler } from "../plugin-handlers";

describe("auditA11ySummaryPluginHandler", () => {
  it("returns ok status when contrast/target-size pass and metadata is set", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 200, height: 100 });
    await ctx.figma.setNodeFill({
      nodeId: frame.id,
      paint: { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 },
    });
    await ctx.figma.setNodeA11yMeta({
      nodeId: frame.id,
      key: "altText",
      value: "Hero",
    });

    const text = await ctx.figma.createTextInFrame({
      parentId: frame.id,
      content: "Hello",
    });
    await ctx.figma.setNodeFill({
      nodeId: text.id,
      paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 },
    });

    const out = await auditA11ySummaryPluginHandler(
      { nodeId: frame.id, recursive: true },
      ctx
    );
    expect(out.checks.find((c) => c.name === "contrast")?.status).toBe("ok");
    expect(out.checks.find((c) => c.name === "target_size")?.status).toBe("ok");
    expect(out.nodesScanned).toBeGreaterThanOrEqual(2);
  });

  it("returns error status when contrast fails AA", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 200, height: 100 });
    await ctx.figma.setNodeFill({
      nodeId: frame.id,
      paint: { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 },
    });
    const text = await ctx.figma.createTextInFrame({
      parentId: frame.id,
      content: "low-contrast",
    });
    await ctx.figma.setNodeFill({
      nodeId: text.id,
      // light grey on white — fails AA
      paint: { type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 }, opacity: 1 },
    });

    const out = await auditA11ySummaryPluginHandler(
      { nodeId: frame.id, recursive: true },
      ctx
    );
    expect(out.checks.find((c) => c.name === "contrast")?.status).toBe("error");
  });

  it("flags target_size as warn when minimum passes but enhanced fails", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 30, height: 30 });
    const out = await auditA11ySummaryPluginHandler(
      { nodeId: frame.id },
      ctx
    );
    expect(out.checks.find((c) => c.name === "target_size")?.status).toBe("warn");
  });

  it("flags target_size as error when below minimum", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 20, height: 20 });
    const out = await auditA11ySummaryPluginHandler(
      { nodeId: frame.id },
      ctx
    );
    expect(out.checks.find((c) => c.name === "target_size")?.status).toBe("error");
  });

  it("flags alt_text as warn when not set on the root frame", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await auditA11ySummaryPluginHandler(
      { nodeId: frame.id },
      ctx
    );
    const altCheck = out.checks.find((c) => c.name === "alt_text");
    expect(altCheck?.status).toBe("warn");
    expect(altCheck?.detail).toMatch(/alt/i);
  });

  it("flags landmark_role as info when not set", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await auditA11ySummaryPluginHandler(
      { nodeId: frame.id },
      ctx
    );
    expect(out.checks.find((c) => c.name === "landmark_role")?.status).toMatch(
      /^(ok|warn)$/
    );
  });

  it("recursive: true walks the descendant tree", async () => {
    const ctx = designCtx();
    const root = await ctx.figma.createFrame({ width: 200, height: 200 });
    const child1 = await ctx.figma.createFrameInFrame({
      parentId: root.id,
      width: 50,
      height: 50,
    });
    await ctx.figma.createFrameInFrame({
      parentId: child1.id,
      width: 30,
      height: 30,
    });
    const out = await auditA11ySummaryPluginHandler(
      { nodeId: root.id, recursive: true },
      ctx
    );
    expect(out.nodesScanned).toBeGreaterThanOrEqual(3);
  });

  it("recursive: false scans only the root", async () => {
    const ctx = designCtx();
    const root = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.createFrameInFrame({
      parentId: root.id,
      width: 50,
      height: 50,
    });
    const out = await auditA11ySummaryPluginHandler(
      { nodeId: root.id, recursive: false },
      ctx
    );
    expect(out.nodesScanned).toBe(1);
  });

  it("works on a FigJam editor", async () => {
    const ctx = figJamCtx();
    const sticky = await ctx.figma.createSticky({ content: "x" });
    const out = await auditA11ySummaryPluginHandler(
      { nodeId: sticky.id },
      ctx
    );
    expect(out.nodeId).toBe(sticky.id);
  });
});
```

> **`createFrameInFrame` test helper.** A new test seeder on `FigmaFake` that creates a frame as a child of another frame (mirrors `createTextInFrame`). Keeps the recursive-walk test clean.

### Step 4: Implement schema — append to `tools.ts`

```ts
const A11yCheckStatus = z.enum(["ok", "warn", "error"]);

const A11yCheck = z.object({
  name: z.enum(["contrast", "target_size", "alt_text", "aria_label", "landmark_role"]),
  status: A11yCheckStatus,
  detail: z.string(),
});

export const AuditA11ySummary = defineTool({
  name: "audit_a11y_summary",
  description:
    "Walk a node (optionally recursively) and aggregate accessibility checks: contrast, target size, alt text, ARIA label, landmark role. Each check is graded `ok` / `warn` / `error` with a human-readable detail string. The most useful tool when an LLM wants to grade a frame's overall a11y posture in a single call.",
  streaming: false,
  input: z
    .object({
      nodeId: NodeId,
      recursive: z.boolean().optional().default(false),
    })
    .strict(),
  output: z.object({
    nodeId: z.string(),
    checks: z.array(A11yCheck),
    nodesScanned: NonNegativeInt,
  }),
});
```

### Step 5: Implement handler — append to `plugin-handlers.ts`

The handler's logic:

1. Walk the node tree (BFS) up to the recursion depth.
2. For each visited node, gather: `{contrast, targetSize, altText, ariaLabel, landmarkRole}` outcomes.
3. Aggregate worst-case status across all visited nodes per check.
4. Build the report.

Status rubric:

- **contrast**: `error` if any audited node has `passesAA === false`; `warn` if any node has unresolvable contrast (gradient bg, etc.) AND no node has `passesAA === false`; `ok` otherwise.
- **target_size**: `error` if any audited node has `passesMinimum === false`; `warn` if any node has `passesMinimum: true, passesEnhanced: false`; `ok` if every audited node passes enhanced (or has `null` bbox).
- **alt_text**: `warn` if the root has no alt text; `ok` otherwise. (We don't recursively warn — alt text is typically a top-level concern.)
- **aria_label**: `info`-equivalent — we report `ok` either way (`null` is acceptable for non-interactive nodes).
- **landmark_role**: `ok` either way (landmark roles are opt-in).

```ts
import type { AuditA11ySummary } from "./tools";

export const auditA11ySummaryPluginHandler: PluginHandler<typeof AuditA11ySummary> = async (
  args,
  { figma }
) => {
  // BFS walk.
  const queue: string[] = [args.nodeId];
  const visited = new Set<string>();
  const contrastResults: Array<{
    nodeId: string;
    ratio: number | null;
    passesAA: boolean | null;
    fg: string | null;
    bg: string | null;
  }> = [];
  const targetResults: Array<{
    nodeId: string;
    width: number | null;
    passesMinimum: boolean | null;
    passesEnhanced: boolean | null;
  }> = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    // Contrast (only meaningful when fg + bg both resolve)
    const fg = await figma.getResolvedTextFill({ nodeId: id });
    if (fg) {
      const bg = await figma.getResolvedBackground({ nodeId: id });
      if (bg) {
        const ratio = wcagContrastRatio(hexToRgb(fg.hex), hexToRgb(bg.hex));
        contrastResults.push({
          nodeId: id,
          ratio,
          passesAA: passesWCAG_AA(ratio, false),
          fg: fg.hex,
          bg: bg.hex,
        });
      } else {
        contrastResults.push({
          nodeId: id,
          ratio: null,
          passesAA: null,
          fg: fg.hex,
          bg: null,
        });
      }
    }

    // Target size
    const bbox = await figma.getNodeBoundingBox({ nodeId: id });
    if (bbox) {
      const min = Math.min(bbox.width, bbox.height);
      targetResults.push({
        nodeId: id,
        width: min,
        passesMinimum: min >= WCAG_TARGET_SIZE_MIN,
        passesEnhanced: min >= WCAG_TARGET_SIZE_ENHANCED,
      });
    }

    // Recurse
    if (args.recursive) {
      const children = await figma.listNodeChildren({ nodeId: id });
      for (const child of children) {
        queue.push(child);
      }
    }
  }

  // Root-level metadata (alt text / aria label / landmark role)
  const rootMeta = await figma.getNodeA11yMeta({ nodeId: args.nodeId });
  let rootAltText = rootMeta.altText;
  if (!rootAltText) {
    const annotations = await figma.getNodeAnnotations({ nodeId: args.nodeId });
    const fallback = annotations.find(
      (a) => a.categoryId === undefined && typeof a.label === "string"
    );
    if (fallback?.label) rootAltText = fallback.label;
  }

  // Aggregate
  const checks: Array<{ name: string; status: "ok" | "warn" | "error"; detail: string }> = [];

  // Contrast
  if (contrastResults.length === 0) {
    checks.push({
      name: "contrast",
      status: "ok",
      detail: "no text fills found in scanned nodes",
    });
  } else {
    const failures = contrastResults.filter((r) => r.passesAA === false);
    const unresolvable = contrastResults.filter((r) => r.passesAA === null);
    if (failures.length > 0) {
      const worst = failures.reduce(
        (acc, r) => (r.ratio !== null && (acc.ratio === null || r.ratio < acc.ratio) ? r : acc),
        failures[0]
      );
      checks.push({
        name: "contrast",
        status: "error",
        detail: `${failures.length}/${contrastResults.length} nodes fail WCAG AA (worst: ${(worst.ratio ?? 0).toFixed(2)}:1, ${worst.fg ?? "?"} on ${worst.bg ?? "?"})`,
      });
    } else if (unresolvable.length > 0) {
      checks.push({
        name: "contrast",
        status: "warn",
        detail: `${unresolvable.length}/${contrastResults.length} nodes have unresolvable backgrounds (gradient/transparent)`,
      });
    } else {
      checks.push({
        name: "contrast",
        status: "ok",
        detail: `${contrastResults.length}/${contrastResults.length} nodes pass WCAG AA`,
      });
    }
  }

  // Target size
  if (targetResults.length === 0) {
    checks.push({
      name: "target_size",
      status: "ok",
      detail: "no measurable nodes",
    });
  } else {
    const subMinimum = targetResults.filter((r) => r.passesMinimum === false);
    const subEnhanced = targetResults.filter((r) => r.passesEnhanced === false);
    if (subMinimum.length > 0) {
      checks.push({
        name: "target_size",
        status: "error",
        detail: `${subMinimum.length}/${targetResults.length} nodes fail WCAG 2.2 minimum (24×24)`,
      });
    } else if (subEnhanced.length > 0) {
      checks.push({
        name: "target_size",
        status: "warn",
        detail: `${subEnhanced.length}/${targetResults.length} nodes fail WCAG 2.2 enhanced (44×44)`,
      });
    } else {
      checks.push({
        name: "target_size",
        status: "ok",
        detail: `${targetResults.length}/${targetResults.length} nodes pass WCAG 2.2 enhanced`,
      });
    }
  }

  // Alt text (root only)
  if (rootAltText) {
    checks.push({
      name: "alt_text",
      status: "ok",
      detail: `alt text set: "${rootAltText.slice(0, 60)}${rootAltText.length > 60 ? "…" : ""}"`,
    });
  } else {
    checks.push({
      name: "alt_text",
      status: "warn",
      detail: "no alt text on root node",
    });
  }

  // ARIA label (root only)
  if (rootMeta.ariaLabel) {
    checks.push({
      name: "aria_label",
      status: "ok",
      detail: `aria label: "${rootMeta.ariaLabel.slice(0, 60)}"`,
    });
  } else {
    checks.push({
      name: "aria_label",
      status: "ok",
      detail: "no aria label (acceptable for non-interactive nodes)",
    });
  }

  // Landmark role (root only)
  if (rootMeta.landmarkRole) {
    checks.push({
      name: "landmark_role",
      status: "ok",
      detail: `landmark role: ${rootMeta.landmarkRole}`,
    });
  } else {
    checks.push({
      name: "landmark_role",
      status: "ok",
      detail: "no landmark role (only required on top-level page regions)",
    });
  }

  return {
    nodeId: args.nodeId,
    checks,
    nodesScanned: visited.size,
  };
};
```

### Step 6: Verify, commit

```bash
bun run --filter @repo/figma-adapter test
bun run --filter @repo/tools-a11y test
git add packages/figma-adapter/src packages/tools-a11y/src
git commit -m "feat(tools-a11y): audit_a11y_summary composite + listNodeChildren"
```

> **Why one commit covers both packages.** Task 13.9 is the one task where the audit composite logically requires the `listNodeChildren` adapter extension. Splitting it across two commits gives no review value (the adapter method is unused outside the audit). The conventional-commit message is scoped `feat(tools-a11y)` because that's the user-visible feature; the figma-adapter changes are mechanical.

---

## Task 13.10: Wire `tools-a11y` into mcp-server + bridge-plugin + e2e catalog test

**Goal:** Both `apps/mcp-server` and `apps/bridge-plugin` register the new pack. An e2e catalog test asserts the 13 wire names exist. Mirrors Phase 12.9.

**Files:**

- Modify: `apps/mcp-server/package.json` (add `@repo/tools-a11y`)
- Modify: `apps/mcp-server/src/main.ts` (register the pack + extend the shim's `tools` list)
- Modify: `apps/bridge-plugin/package.json` (add `@repo/tools-a11y`)
- Modify: `apps/bridge-plugin/src/plugin.ts` (register all 13 handlers)
- Create: `apps/mcp-server/src/__tests__/e2e-phase13-catalog.test.ts`
- Modify: `bun.lock` (via `bun install`)

### Step 1: Failing test — `apps/mcp-server/src/__tests__/e2e-phase13-catalog.test.ts`

```ts
import {
  AddAnnotation,
  AuditA11ySummary,
  AuditContrast,
  AuditTargetSize,
  GetAltText,
  GetAriaLabel,
  GetLandmarkRole,
  ListAnnotations,
  RemoveAnnotation,
  SetAltText,
  SetAriaLabel,
  SetLandmarkRole,
  SimulateColorBlindness,
} from "@repo/tools-a11y";
import { describe, expect, it } from "vitest";

describe("Phase 13 tool catalog", () => {
  it("exposes 13 a11y tools with the expected names", () => {
    const names = [
      AuditContrast.name,
      AuditTargetSize.name,
      SimulateColorBlindness.name,
      SetAltText.name,
      GetAltText.name,
      SetAriaLabel.name,
      GetAriaLabel.name,
      SetLandmarkRole.name,
      GetLandmarkRole.name,
      ListAnnotations.name,
      AddAnnotation.name,
      RemoveAnnotation.name,
      AuditA11ySummary.name,
    ];
    expect(new Set(names).size).toBe(13);
    expect(names).toEqual([
      "audit_contrast",
      "audit_target_size",
      "simulate_color_blindness",
      "set_alt_text",
      "get_alt_text",
      "set_aria_label",
      "get_aria_label",
      "set_landmark_role",
      "get_landmark_role",
      "list_annotations",
      "add_annotation",
      "remove_annotation",
      "audit_a11y_summary",
    ]);
  });

  it("every tool's input schema rejects extraneous keys (strict)", () => {
    const tools = [
      AuditContrast, AuditTargetSize, SimulateColorBlindness,
      SetAltText, GetAltText, SetAriaLabel, GetAriaLabel,
      SetLandmarkRole, GetLandmarkRole,
      ListAnnotations, AddAnnotation, RemoveAnnotation,
      AuditA11ySummary,
    ];
    for (const tool of tools) {
      const r = tool.input.safeParse({ __unexpected: 1 });
      expect(r.success).toBe(false);
    }
  });
});
```

### Step 2: Add deps

```jsonc
// apps/mcp-server/package.json
"@repo/tools-a11y": "workspace:*"

// apps/bridge-plugin/package.json
"@repo/tools-a11y": "workspace:*"
```

Run `bun install`.

### Step 3: Wire into `main.ts` — extend imports + the `packs: [...]` array

```ts
import {
  AddAnnotation, addAnnotationPluginHandler,
  AuditA11ySummary, auditA11ySummaryPluginHandler,
  AuditContrast, auditContrastPluginHandler,
  AuditTargetSize, auditTargetSizePluginHandler,
  GetAltText, getAltTextPluginHandler,
  GetAriaLabel, getAriaLabelPluginHandler,
  GetLandmarkRole, getLandmarkRolePluginHandler,
  ListAnnotations, listAnnotationsPluginHandler,
  RemoveAnnotation, removeAnnotationPluginHandler,
  SetAltText, setAltTextPluginHandler,
  SetAriaLabel, setAriaLabelPluginHandler,
  SetLandmarkRole, setLandmarkRolePluginHandler,
  SimulateColorBlindness, simulateColorBlindnessPluginHandler,
} from "@repo/tools-a11y";

// inside Daemon.start({ packs: [...] }), after the tools-slides entry:
{
  name: "tools-a11y",
  tools: [
    AuditContrast, AuditTargetSize, SimulateColorBlindness,
    SetAltText, GetAltText, SetAriaLabel, GetAriaLabel,
    SetLandmarkRole, GetLandmarkRole,
    ListAnnotations, AddAnnotation, RemoveAnnotation,
    AuditA11ySummary,
  ],
  registerPlugin: (reg) => {
    reg.register(AuditContrast, auditContrastPluginHandler);
    reg.register(AuditTargetSize, auditTargetSizePluginHandler);
    reg.register(SimulateColorBlindness, simulateColorBlindnessPluginHandler);
    reg.register(SetAltText, setAltTextPluginHandler);
    reg.register(GetAltText, getAltTextPluginHandler);
    reg.register(SetAriaLabel, setAriaLabelPluginHandler);
    reg.register(GetAriaLabel, getAriaLabelPluginHandler);
    reg.register(SetLandmarkRole, setLandmarkRolePluginHandler);
    reg.register(GetLandmarkRole, getLandmarkRolePluginHandler);
    reg.register(ListAnnotations, listAnnotationsPluginHandler);
    reg.register(AddAnnotation, addAnnotationPluginHandler);
    reg.register(RemoveAnnotation, removeAnnotationPluginHandler);
    reg.register(AuditA11ySummary, auditA11ySummaryPluginHandler);
  },
},
```

Extend the shim's `tools: [...]` list:

```ts
const shim = await createStdioShim({
  socketPath: startup.socketPath,
  sourceClientId: `shim-${process.pid}`,
  tools: [
    // …existing 68 tools (Phases 3, 5, 8, 10, 11, 12)…
    AuditContrast,
    AuditTargetSize,
    SimulateColorBlindness,
    SetAltText,
    GetAltText,
    SetAriaLabel,
    GetAriaLabel,
    SetLandmarkRole,
    GetLandmarkRole,
    ListAnnotations,
    AddAnnotation,
    RemoveAnnotation,
    AuditA11ySummary,
  ],
  mcpServerInfo: { name: "figma-mcp", version: VERSION },
});
```

### Step 4: Wire into the bridge plugin — `apps/bridge-plugin/src/plugin.ts`

```ts
import {
  AddAnnotation, addAnnotationPluginHandler,
  AuditA11ySummary, auditA11ySummaryPluginHandler,
  AuditContrast, auditContrastPluginHandler,
  AuditTargetSize, auditTargetSizePluginHandler,
  GetAltText, getAltTextPluginHandler,
  GetAriaLabel, getAriaLabelPluginHandler,
  GetLandmarkRole, getLandmarkRolePluginHandler,
  ListAnnotations, listAnnotationsPluginHandler,
  RemoveAnnotation, removeAnnotationPluginHandler,
  SetAltText, setAltTextPluginHandler,
  SetAriaLabel, setAriaLabelPluginHandler,
  SetLandmarkRole, setLandmarkRolePluginHandler,
  SimulateColorBlindness, simulateColorBlindnessPluginHandler,
} from "@repo/tools-a11y";

// inside start(), after the tools-slides register() calls:
runtime.register(AuditContrast, auditContrastPluginHandler);
runtime.register(AuditTargetSize, auditTargetSizePluginHandler);
runtime.register(SimulateColorBlindness, simulateColorBlindnessPluginHandler);
runtime.register(SetAltText, setAltTextPluginHandler);
runtime.register(GetAltText, getAltTextPluginHandler);
runtime.register(SetAriaLabel, setAriaLabelPluginHandler);
runtime.register(GetAriaLabel, getAriaLabelPluginHandler);
runtime.register(SetLandmarkRole, setLandmarkRolePluginHandler);
runtime.register(GetLandmarkRole, getLandmarkRolePluginHandler);
runtime.register(ListAnnotations, listAnnotationsPluginHandler);
runtime.register(AddAnnotation, addAnnotationPluginHandler);
runtime.register(RemoveAnnotation, removeAnnotationPluginHandler);
runtime.register(AuditA11ySummary, auditA11ySummaryPluginHandler);
```

### Step 5: Verify, commit

```bash
bun run --filter @repo/mcp-server test e2e-phase13-catalog
bun run --filter @repo/mcp-server test
bun run --filter @repo/bridge-plugin test
git add apps/mcp-server/src/main.ts apps/mcp-server/src/__tests__/e2e-phase13-catalog.test.ts apps/mcp-server/package.json apps/bridge-plugin/src/plugin.ts apps/bridge-plugin/package.json bun.lock
git commit -m "feat(mcp-server): register tools-a11y pack"
```

---

## Task 13.11: Cross-editor wire-level e2e test

**Goal:** A focused wire-level test that proves the a11y tools work on BOTH `editorType: "figma"` AND `editorType: "figjam"`. The test calls `audit_contrast` from a real MCP client against a daemon backed by `FigmaFake({editorType: "figma"})` AND a daemon backed by `FigmaFake({editorType: "figjam"})`. Both should succeed — there's no editor-type guard.

**Why this matters.** The other packs (Phase 10 figjam, Phase 12 slides) install a guard that a wire-level mismatch test exercises. The a11y pack's contract is the OPPOSITE — it works on every editor. We need a test that actively asserts that contract; otherwise a future regression that accidentally adds a guard would go unnoticed.

**Files:**

- Create: `apps/mcp-server/src/__tests__/e2e-a11y-cross-editor.test.ts`

### Step 1: Implement the test

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import {
  AuditContrast,
  auditContrastPluginHandler,
} from "@repo/tools-a11y";
import { describe, expect, it } from "vitest";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";

async function runAuditOn(editorType: "figma" | "figjam"): Promise<unknown> {
  const dir = await mkdtemp(join(tmpdir(), `mcp-a11y-${editorType}-`));
  const socketPath = join(dir, "daemon.sock");

  const figma = new FigmaFake({ editorType });
  // Seed a minimal text-on-frame composition so the audit has data.
  const frame = await figma.createFrame({ width: 200, height: 100 });
  await figma.setNodeFill({
    nodeId: frame.id,
    paint: { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 },
  });
  const text = await figma.createTextInFrame({
    parentId: frame.id,
    content: "Hello",
  });
  await figma.setNodeFill({
    nodeId: text.id,
    paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 },
  });

  const daemon = await Daemon.start({
    socketPath,
    wsPort: 0,
    version: "0.0.0",
    figma,
    packs: [
      {
        name: "tools-a11y",
        tools: [AuditContrast],
        registerPlugin: (reg) => {
          reg.register(AuditContrast, auditContrastPluginHandler);
        },
      },
    ],
  });

  try {
    const shim = await createStdioShim({
      socketPath,
      sourceClientId: `shim-${editorType}-test`,
      tools: [AuditContrast],
      mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await shim.connectMcp(serverTransport);
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: "audit_contrast",
      arguments: { nodeId: text.id },
    });

    return result;
  } finally {
    await daemon.stop();
  }
}

describe("a11y tools — cross-editor", () => {
  it("audit_contrast succeeds on editorType: 'figma'", async () => {
    const result = (await runAuditOn("figma")) as {
      isError?: boolean;
      content?: ReadonlyArray<{ type: string; text?: string }>;
    };
    expect(result.isError).toBeFalsy();
    const text =
      result.content && result.content[0]?.type === "text"
        ? result.content[0].text ?? ""
        : "";
    // 21:1 contrast for black on white
    expect(text).toMatch(/21|"ratio":\s?2[01]/);
  });

  it("audit_contrast succeeds on editorType: 'figjam' (no editor-type guard)", async () => {
    const result = (await runAuditOn("figjam")) as {
      isError?: boolean;
    };
    // The KEY assertion: no E_FIGMA_EDITOR_TYPE_MISMATCH on FigJam.
    expect(result.isError).toBeFalsy();
  });
});
```

### Step 2: Verify, commit

```bash
bun run --filter @repo/mcp-server test e2e-a11y-cross-editor
git add apps/mcp-server/src/__tests__/e2e-a11y-cross-editor.test.ts
git commit -m "test(mcp-server): a11y pack works on figma + figjam (no editor-type guard)"
```

> **If the test fails on FigJam.** The most likely cause is that an a11y handler accidentally calls a Phase 8 design-tools-only adapter method (e.g. `getLocalPaintStylesAsync` — which doesn't fail per se but is empty). The audit handler should ONLY use the Phase 13 adapter additions (`getResolvedTextFill`, `getResolvedBackground`, `getNodeBoundingBox`, plugin-data helpers, annotation helpers, `listNodeChildren`). All of those are editor-agnostic.

---

## Task 13.12: Coverage gate + Phase 13 changeset + acceptance

**Files:**

- Verify `packages/tools-a11y/vitest.config.ts` thresholds (≥90/85/90/90)
- Verify `packages/figma-adapter/vitest.config.ts` thresholds (≥90/85/90/90)
- Create: `.changeset/phase-13-tools-a11y.md`

### Step 1: Per-pack coverage

```bash
bun run --filter @repo/tools-a11y test --coverage
bun run --filter @repo/figma-adapter test --coverage
```

Each command must pass with no threshold violations. The utility module from Task 13.3 should land at 100% (it's pure code with table-driven fixtures); the plugin handlers cluster around 95% (the `audit_a11y_summary` aggregation has multiple branches per check and we exercise the worst-case per status). If a sub-area dips below the bar, add table-driven tests for the missing branches. Do NOT lower thresholds.

### Step 2: Root acceptance

```bash
bun run lint
bun run types
bun run test
```

All green.

### Step 3: Changeset — `.changeset/phase-13-tools-a11y.md`

```markdown
---
"@bromso/figma-mcp": minor
"@repo/tools-a11y": minor
"@repo/figma-adapter": minor
---

Phase 13: tools-a11y pack.

A new tool pack ships, bringing the registry from ~68 to ~81 tools.
This is the last pack from the original roadmap.

`@repo/tools-a11y` (new): 13 tools for accessibility audits and annotations.

- Audits: `audit_contrast`, `audit_target_size`, `audit_a11y_summary`.
- Pure utility: `simulate_color_blindness`.
- Metadata: `set_alt_text`, `get_alt_text`, `set_aria_label`, `get_aria_label`,
  `set_landmark_role`, `get_landmark_role`.
- Annotation CRUD: `list_annotations`, `add_annotation`, `remove_annotation`.

Unlike `@repo/tools-figjam` (Phase 10) and `@repo/tools-slides` (Phase 12),
the a11y pack is NOT editor-type-gated. WCAG audits, alt text, ARIA
labels, landmark roles, and annotations are universal across Figma
Design and FigJam files. A wire-level cross-editor test asserts both
editors succeed.

WCAG version: 2.2 thresholds. Contrast: 4.5:1 normal / 3:1 large for
AA; 7:1 normal / 4.5:1 large for AAA. Target size: 24×24 minimum,
44×44 enhanced (Success Criterion 2.5.5).

Color-blindness simulation: Brettel-Machado matrices for sRGB, with
greyscale (Rec. 709 luma) for achromatopsia. Approximation; matches
output of `colorblindness.js`, Chrome DevTools, and other industry
tools.

`@repo/figma-adapter` (extended): adds the `Annotation`, `A11yMetaKey`,
`NodeA11yMeta`, `ResolvedFill`, `NodeBoundingBox` types plus 8 new
methods (`getNodeA11yMeta`, `setNodeA11yMeta`, `getNodeAnnotations`,
`setNodeAnnotations`, `getResolvedTextFill`, `getResolvedBackground`,
`getNodeBoundingBox`, `listNodeChildren`). `FigmaFake` mirrors all
methods with deterministic in-memory storage; `RealFigmaAdapter`
wraps `figma.getNodeByIdAsync` plus `node.setPluginData`,
`node.getPluginData`, `node.annotations`, `node.absoluteBoundingBox`,
`node.parent`, and `node.children`.

The adapter methods do NOT enforce any editor-type discriminator —
the a11y pack is universal.

Out of scope: native Figma a11y audit (no plugin API); screen-reader
simulation; ARIA role/state inference; APCA contrast formula
(WCAG 3.0); auto-fix tools (Phase 14+). Real-figma golden coverage
is also out of scope (annotations + pluginData are not exposed via
the REST `/v1/files` endpoint).

Deferred: Phase 7 Windows IPC fix; Phase 8 query_console regex DoS
hardening; Phase 11 doctor figma-api-key check.
```

### Step 4: Commit

```bash
git add .changeset/phase-13-tools-a11y.md
git commit -m "chore(changeset): record Phase 13 tools-a11y"
```

### Step 5: Final acceptance pass

```bash
bun run lint && bun run types && bun run test
git log master..HEAD --oneline
```

**Phase 13 done.** The accessibility tool pack is wired through both runtimes; the registry now exposes ~81 tools; the a11y pack works on every editor without an editor-type guard.

---

## Notes on Execution

**Why no editor-type guard.** Plugin data, annotations, fills, parent walks, and bounding boxes are universal across Figma Design, FigJam, and Slides editors. WCAG and ARIA concerns apply identically to every editor — a low-contrast text-on-sticky in a FigJam file is just as inaccessible as a low-contrast text-on-frame in a Figma Design file. Installing a guard would falsely scope the tools and force separate `tools-a11y-figma` / `tools-a11y-figjam` packs that share 100% of their implementation. Phase 10 and Phase 12 installed guards because the underlying APIs (`figma.createSticky`, `figma.createSlide`) genuinely throw on the wrong editor; the a11y APIs do not.

**WCAG version.** We target WCAG 2.2 (the most recent published recommendation). 2.0 and 2.1 share identical contrast thresholds (the formula didn't change between the three versions); 2.2 added Success Criterion 2.5.5 (target size). Hardcoding 2.2 means our tools are forward-compatible — when 2.x lands a hypothetical 2.5.6, we add a new audit. We do NOT support WCAG 3.0 / APCA — that's still in W3C draft as of writing and the formula is genuinely different (no fixed thresholds; APCA returns "Lc" — lightness contrast — which the spec leaves to context).

**Background resolution heuristic.** `getResolvedBackground` walks up the parent chain to the first ancestor with a SOLID paint. Why "first solid" instead of "first non-transparent" or "composite of all ancestors"? Because (a) the plugin runtime exposes `fills: SolidPaint[]` and we'd have to alpha-composite ourselves to handle stacked semi-transparent fills (out of scope for Phase 13 — the WCAG formula isn't well-defined for translucent foregrounds anyway), and (b) gradient backgrounds can't be auto-graded — the contrast varies across the gradient. We stop at the first solid fill and report the result; if that's actually under a translucent overlay, the LLM gets enough information (`foreground: "#FFFFFF", background: "#000000"`) to know it's evaluating the wrong stack and ask the user. The alternative (skipping every translucent ancestor and continuing up) is wrong in different ways. We pick the simplest defensible heuristic and document it.

**Plugin-data namespace.** `a11y/altText`, `a11y/ariaLabel`, `a11y/landmarkRole`. Forward-compatible: future a11y tools can add `a11y/<new-attr>` without breaking existing data, and a future "all a11y metadata" tool can iterate the namespace. We do NOT use Figma's "shared plugin data" (which requires explicit cross-plugin handshakes) — the a11y data is plugin-private to the bridge plugin.

**Why `set_alt_text` writes both pluginData AND an annotation.** PluginData is the authoritative store (read by `get_alt_text`, written by `set_alt_text`). The annotation gives the alt text a visible surface in Figma's annotation panel — designers can see it at a glance. The two stores can drift if a designer manually edits the annotation panel; we don't try to keep them in sync (`set_alt_text` overwrites both; `get_alt_text` prefers pluginData but falls back to annotations). This is the simplest defensible policy; future tools that explicitly model alt-text-as-annotation can refine it.

**Why ARIA labels skip the annotation surface.** ARIA labels are usually short and would clutter the annotation panel. Designers who want them visible can use `add_annotation` explicitly. The asymmetry is documented in the tool descriptions.

**Annotation indices vs ids.** `@figma/plugin-typings` doesn't expose stable per-annotation ids — only the array index in `node.annotations`. We use the index as the addressing scheme and warn (in the tool description) that indices shift after removal. Future plugin API revisions might expose ids; if so, `remove_annotation_by_id` becomes a 1-line addition without breaking the index-based API.

**Why we use the Brettel-Machado simulation matrices.** The "right" answer for color-blindness simulation is to (a) convert sRGB → linear-sRGB → LMS color space, (b) project onto the dichromat plane, (c) convert back. The Brettel-Machado approximation does this with 3×3 matrices that operate directly on sRGB inputs — it's an O(1) transform per pixel that matches the full pipeline within ~3% of the LMS-correct output. Every public a11y tool (Chrome DevTools, `colorblindness.js`, Sim Daltonism) uses some flavor of these matrices. The error is well below "is this color reasonable?" tolerance for the LLM use case. Sources: Machado et al. 2009 "A Physiologically-based Model for Simulation of Color Vision Deficiency"; the matrices in our `utils.ts` are Table 1 at severity 1.0 (full dichromacy).

**Achromatopsia uses Rec. 709 luma weights.** Total color blindness collapses every color to its luminance — equivalent to a 0.2126 R + 0.7152 G + 0.0722 B greyscale. We use the same luma weights that the WCAG luminance formula uses; the result is internally consistent ("contrast survives achromatopsia" iff the contrast formula sees the same luminance difference). The Rec. 709 weights are the broadcast TV standard — close enough to perceptual luminance for our purposes.

**Why `audit_a11y_summary` is BFS, not DFS.** Either traversal order produces the same aggregation since the worst-case status across visited nodes is order-independent. BFS is implemented as a queue (`shift()`-from-head); for a few hundred nodes the perf difference vs. DFS is negligible. We pick BFS because it's the canonical "walk a tree breadth-first" pattern in plugin-side handlers and matches Phase 8's existing tree-walk patterns.

**Why the audit's `alt_text` check only flags the root.** Recursively flagging every node without alt text would generate noise — most layers (rectangles, paths, internal frames) genuinely don't need alt text, and the LLM doesn't have enough context to know which layers are "image-like" vs "decorative." Image-like detection requires either (a) author-supplied semantics (`set_landmark_role`) or (b) heuristics over layer names/types — both out of scope for Phase 13. The root-only policy is conservative and gives the LLM a single warn that's actionable.

**Coverage thresholds.** Both affected packages (`figma-adapter`, `tools-a11y`) use the same per-pack bar from the master plan: lines/functions/statements ≥90, branches ≥85. The utility module from Task 13.3 is 100% testable; the adapter additions exercise every error path; the audit composite (Task 13.9) has the densest branch graph but the table-driven tests for status combinations cover it.

**Order-of-execution dependency.** Tasks 13.4–13.9 depend on Task 13.1 (the adapter methods must exist). Task 13.3 (utility module) is consumed by 13.4 + 13.5 + 13.9. Task 13.9 retroactively extends Task 13.1 with `listNodeChildren` (folded into the 13.9 commit since the method is unused outside the audit). Task 13.10 depends on every prior task (the registrar imports every tool). Tasks 13.11 + 13.12 depend on 13.10. The task numbering reflects this order.

**No `server-handlers.ts` for this pack.** The a11y tools require plugin-side execution — there's no REST-API-backed alternative implementation. The `/v1/files` endpoint does not expose annotations or pluginData; computed properties like contrast and bounding-box would require fetching the full file tree and re-implementing every layout computation. A future server-side fallback could ship as part of `@repo/tools-rest` (Phase 11) once the REST contract for annotations stabilizes. Phase 13 does not block on it.

**Why a11y is the last pack from the original roadmap.** The original Phase 13 brief was "any high-value tooling that fits the request/response pack model." A11y won out over alternatives (animation pack, prototype pack, internationalization pack) because (a) it's universal across editors — a single pack covers Figma + FigJam without extra branching; (b) the WCAG primitives are well-specified — there's no design ambiguity to resolve; (c) LLM use cases for a11y are immediate and obvious — designers already think about contrast and target size. The other candidates either require runtime APIs that don't exist (animation) or are domain-specific enough to deserve their own followup phase (i18n). After Phase 13, the registry is at ~81 tools — comfortably past the "useful enough to ship" threshold.

**Cross-pack composition.** A power-user prompt might call `audit_a11y_summary({recursive: true})` against a frame, then for each `error`-status node, call `simulate_color_blindness({hex})` against the failing color, then `set_alt_text` to annotate the source of the warning. The pack is designed for that composition — every primitive is independently callable, the summary tool surfaces the inputs the others need, and the annotation tools let the LLM persist its findings. No new tools are needed to support that flow; it's emergent from the 13 tools we ship.

**Editor-type discriminator semantics, recap.** Phase 10 introduced `E_FIGMA_EDITOR_TYPE_MISMATCH` for FigJam; Phase 12 reused it for Slides. Phase 13 does NOT raise that error — every a11y tool is editor-agnostic. The daemon's protocol-error mapper does not need to grow a new branch; the existing branch that recognizes the prefix continues to handle FigJam and Slides packs only.

---

## Out of scope

- **Editor-type guard.** Tools work on every editor.
- **Native Figma a11y audit.** No `figma.runAccessibilityAudit()` exists.
- **Screen-reader simulation.** Not a plugin API capability.
- **ARIA role / state inference.** Figma has no semantic-tag concept; we don't infer roles from layer names.
- **Auto-fix tools.** `set_alt_text` writes metadata; we don't auto-darken a button to fix contrast. Phase 14+.
- **WCAG 3.0 / APCA.** Still in W3C draft; formula is genuinely different. We ship WCAG 2.2.
- **Image-as-text contrast detection.** A button labeled with an image is flagged "no text fill" by `audit_a11y_summary`, not auto-graded.
- **Rich-text run-level contrast.** Mixed fills surface as "mixed fills, cannot evaluate."
- **Gradient-background contrast.** Returns `null` ratio with `reason: "no resolvable background fill"`.
- **Multi-locale alt text.** `set_alt_text` accepts a single string.
- **`InteractiveSlideElementNode` a11y.** Slides interactive elements aren't authored by plugins (Phase 12 out of scope); their a11y attributes inherit from the wrapper slide.
- **Translucent fill compositing.** `getResolvedBackground` returns the first solid fill; semi-transparent overlays aren't alpha-composited.
- **Real-Figma golden coverage.** Annotations and pluginData are not exposed via REST `/v1/files`; the round-trip would only cover bounding-box-driven audits, and the value is low. No skipped stub ships in Phase 13.
- **Server-side fallback.** No `server-handlers.ts`. A future REST-backed implementation can land in `@repo/tools-rest` once the REST contract for annotations stabilizes.
- **Cross-pack integration tests beyond catalog assertion + cross-editor wire test.** Each pack's tests are isolated against `FigmaFake`.
- **Telemetry / per-tool error rates.** No analytics, no opt-in flow.
- **Tool versioning / deprecation channels.** Nothing is removed or renamed.
- **The deferred Phase 7 Windows IPC fix.** Tracked in Phase 7's "Out of scope".
- **The deferred Phase 8 `query_console` regex DoS hardening.** Tracked in Phase 8's "Out of scope".
- **The deferred Phase 11 doctor `figma-api-key` check.** Tracked in Phase 11's "Out of scope".

---

## References

- Phase 12 plan (canonical pack pattern; this plan mirrors its structure with the editor-type guard removed): `docs/plans/2026-05-06-figma-mcp-phase-12.md`
- Phase 11 plan (server-handler / REST pack pattern): `docs/plans/2026-05-06-figma-mcp-phase-11.md`
- Phase 10 plan (figjam pack — same plugin-side mechanics): `docs/plans/2026-05-06-figma-mcp-phase-10.md`
- Phase 9 plan (real-figma harness — out of scope here): `docs/plans/2026-05-06-figma-mcp-phase-9.md`
- Phase 8 plan (canonical pack pattern, two packs): `docs/plans/2026-05-06-figma-mcp-phase-8.md`
- Phase 3 plan (canonical extract pack): `docs/plans/2026-05-06-figma-mcp-phase-3.md`
- Phase 2 plan (transport + figma-adapter): `docs/plans/2026-05-06-figma-mcp-phase-2.md`
- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md`
- Roadmap: `docs/plans/2026-05-06-figma-mcp-rewrite-plan.md` (Phase 13 high-level scope)
- Adapter contract: `packages/figma-adapter/src/adapter.ts`
- In-memory test double: `packages/figma-adapter/src/figma-fake.ts`
- Production adapter: `packages/figma-adapter/src/real-figma-adapter.ts`
- Bridge plugin runtime: `apps/bridge-plugin/src/runtime.ts`
- Bridge plugin entry: `apps/bridge-plugin/src/plugin.ts`
- mcp-server entry: `apps/mcp-server/src/main.ts`
- Protocol primitives: `packages/protocol/src/tools.ts` (`defineTool`, `PluginHandler`, `Pack`)

### External references

- WCAG 2.1 Recommendation (contrast): <https://www.w3.org/TR/WCAG21/#contrast-minimum>
- WCAG 2.2 Recommendation (target size): <https://www.w3.org/TR/WCAG22/#target-size-minimum>
- W3C ARIA landmark roles: <https://www.w3.org/TR/wai-aria-1.2/#landmark_roles>
- Brettel et al. 1997, "Computerized simulation of color appearance for dichromats": <https://doi.org/10.1364/JOSAA.14.002647>
- Machado et al. 2009, "A Physiologically-based Model for Simulation of Color Vision Deficiency" (the matrices in `utils.ts`): <https://doi.org/10.1109/TVCG.2009.113>
- Figma Annotations API: <https://www.figma.com/plugin-docs/api/Annotation/>
- Figma `setPluginData` / `getPluginData`: <https://www.figma.com/plugin-docs/api/properties/nodes-setplugindata/>
- `@figma/plugin-typings` 1.125.0 — `plugin-api.d.ts` (Annotation, AnnotationProperty, AnnotationPropertyType, AnnotationCategory, BaseNode.getPluginData, BaseNode.setPluginData, SceneNode.absoluteBoundingBox, BaseNode.parent, ChildrenMixin.children).
