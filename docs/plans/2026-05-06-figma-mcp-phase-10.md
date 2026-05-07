# Phase 10: tools-figjam pack

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ship `@repo/tools-figjam` — 10 tools for FigJam files: sticky notes, sections, connectors, code blocks, shape-with-text, tables. Brings the registry from ~23 to ~33 tools.

**Architecture:** Mirrors the Phase 8 design pack: adapter extensions on `FigmaAdapter`, `FigmaFake` mirror, tool schemas + plugin handlers in `packages/tools-figjam/`. Editor-type discriminator guards every tool: when `figma.editorType !== "figjam"`, the handler throws `E_FIGMA_EDITOR_TYPE_MISMATCH` before touching any API.

**Tech Stack:** Existing — Bun + Vitest + Zod + the Phase 1–9 infrastructure. No new runtime deps.

---

## Out of scope (call-out so the executor doesn't drift)

- **`@repo/tools-slides`, `@repo/tools-a11y`, `@repo/tools-rest`.** Each remains an explicit follow-up phase. Do NOT scaffold or stub them here.
- **FigJam widgets.** `figma.createWidget()` and the entire widget runtime (props, syncedState, hooks) is its own surface. Phase 10 ships **node** primitives only.
- **FigJam timer / voting / cursor-chat / audio rooms.** Session-level features that don't fit the request/response pack model. Out of scope.
- **Multi-board support.** A FigJam file is conceptually one board; handlers operate on `figma.currentPage`. The `move_into_section` tool does not cross board boundaries (single-board assumption).
- **Connector geometry / waypoints / labels.** Phase 10 connectors carry `startNodeId` + `endNodeId` only. Magnet positions, custom paths, midpoint labels, arrow caps are deliberately deferred.
- **Sticky note styling beyond `content` and `authorName`.** Background color, `wideText`, `pinned` — all out of scope.
- **Code block syntax validation.** `language` is a free-form string with a default of `"plaintext"`; we do NOT enforce that it's a Figma-recognized language id.
- **Sticky/section/connector deletion or movement** beyond `move_into_section` and `list_section_children`. The Phase 8 `delete_node` tool handles deletion; the Phase 8 `clone_node` covers duplication. We do not re-implement those for FigJam.
- **Real-Figma smoke runs against a live FigJam file.** The Phase 9 harness fetched a Design file via `/v1/files/<key>?depth=1`. FigJam files lack a comparable read endpoint that exposes node-level structure. Task 10.10 ships a stubbed/skipped golden test with a TODO; full coverage is left to a follow-up phase that adds either (a) a plugin-driven recorder or (b) a curated `/v1/files/<key>/nodes` fetch.
- **Editor-type round-tripping in `e2e.test.ts`.** Task 10.11 adds one focused test; the broader e2e suite continues to assume `editorType: "figma"`.
- **Tool versioning / deprecation channels.** Tools are added; nothing is removed or renamed.
- **Telemetry on tool usage.** No analytics, no opt-in flow.
- **Cross-pack integration tests.** Each pack's tests are isolated against `FigmaFake({editorType: "figjam"})`. The Task 10.9 e2e catalog test asserts only registration.
- **Beyond the existing six error categories.** Validation errors stay `E_PROTOCOL_INVALID`; adapter throws stay `E_FIGMA_UNKNOWN`; editor-type mismatches surface as `E_FIGMA_EDITOR_TYPE_MISMATCH` (the only NEW error string Phase 10 introduces — it is part of the existing `E_FIGMA_*` family, not a new top-level category).

---

## Acceptance Criteria

- `packages/tools-figjam/` exists with 10 tool definitions (`create_sticky`, `create_section`, `create_connector`, `create_code_block`, `create_shape_with_text`, `create_table`, `set_sticky_content`, `set_section_name`, `move_into_section`, `list_section_children`) and per-tool plugin handlers.
- Every plugin handler in `packages/tools-figjam/src/plugin-handlers.ts` calls `requireFigJam(figma)` (Task 10.8) and throws `E_FIGMA_EDITOR_TYPE_MISMATCH` when the adapter reports `editorType !== "figjam"`.
- `FigmaAdapter` interface in `packages/figma-adapter/src/adapter.ts` extends with the 6 new node types (`StickyNode`, `SectionNode`, `ConnectorNode`, `CodeBlockNode`, `ShapeWithTextNode`, `TableNode`) and 10 new methods listed in Task 10.1; `FigmaFake` implements them deterministically; `RealFigmaAdapter` wraps the corresponding `figma.*` calls.
- Adapter methods themselves do NOT enforce the editor-type discriminator. The check lives in the **tool handler** so downstream callers (and tests) can still exercise the methods on a non-FigJam adapter when needed.
- `apps/mcp-server/src/main.ts` registers `tools-figjam` alongside `tools-extract`, `tools-variables`, `tools-console`, and `tools-design`. The shim's `tools` array is extended with all 10 new tool schemas.
- `apps/bridge-plugin/src/plugin.ts` registers the 10 plugin handlers on the runtime.
- An end-to-end catalog test asserts every Phase 10 tool name appears in the daemon's catalog (mirrors Phase 8's `e2e-phase8-catalog.test.ts`).
- A wire-level mismatch test asserts that calling a figjam tool against a `FigmaFake({editorType: "figma"})` returns `E_FIGMA_EDITOR_TYPE_MISMATCH`.
- Per-pack coverage ≥90/85/90/90 (lines/branches/functions/statements). `packages/figma-adapter` retains its existing bar.
- Phase 10 changeset under `.changeset/phase-10-tools-figjam.md`. The changeset bumps `@bromso/figma-mcp`, `@repo/tools-figjam`, and `@repo/figma-adapter` (all minor).
- Commit hygiene: each task ends with one conventional-commit-formatted commit. No multi-task commits. No `git add -A`.

---

## Task Map

| #     | Task                                                                    | Package / App         | Type        |
| ----- | ----------------------------------------------------------------------- | --------------------- | ----------- |
| 10.1  | Adapter extensions (6 node types, 10 methods, fake + real)              | figma-adapter         | code        |
| 10.2  | `@repo/tools-figjam` package scaffold                                   | tools-figjam (new)    | infra       |
| 10.3  | `tools-figjam`: `create_sticky`, `create_section`                       | tools-figjam          | code        |
| 10.4  | `tools-figjam`: `create_connector`, `create_code_block`                 | tools-figjam          | code        |
| 10.5  | `tools-figjam`: `create_shape_with_text`, `create_table`                | tools-figjam          | code        |
| 10.6  | `tools-figjam`: `set_sticky_content`, `set_section_name`                | tools-figjam          | code        |
| 10.7  | `tools-figjam`: `move_into_section`, `list_section_children`            | tools-figjam          | code        |
| 10.8  | Editor-type guard helper (`requireFigJam`) + handler refactor           | tools-figjam          | code        |
| 10.9  | Wire `tools-figjam` into mcp-server + bridge-plugin + e2e catalog test  | mcp-server + bridge   | code/tests  |
| 10.10 | Real-Figma figjam fixture stub (skipped by default)                     | mcp-server            | tests       |
| 10.11 | Editor-type-mismatch wire-level e2e test                                | mcp-server            | tests       |
| 10.12 | Coverage gate + Phase 10 changeset + acceptance                         | repo                  | infra       |

---

## Task 10.1: Adapter extensions for FigJam tools

**Goal:** Extend `FigmaAdapter` with the 6 FigJam node types plus the 10 methods that the FigJam tools depend on. Mirror in `FigmaFake` (deterministic id generation: `stk1`, `sec1`, `cn1`, `cb1`, `swt1`, `tbl1`) and in `RealFigmaAdapter` (wraps `figma.createSticky()` etc. — the `@figma/plugin-typings` package exposes these factories for editor type "figjam").

**Crucially:** the new methods do NOT themselves check `editorType`. The check happens in the tool handler (Task 10.8). This keeps the adapter callable from any caller who has already proved they're in a FigJam runtime, and makes unit testing the adapter independent of editor-type wiring.

**Files:**

- Modify: `packages/figma-adapter/src/adapter.ts` (add 6 types + 10 method signatures)
- Modify: `packages/figma-adapter/src/figma-fake.ts` (implement methods + add seeders)
- Modify: `packages/figma-adapter/src/real-figma-adapter.ts` (wrap `figma.*`)
- Modify: `packages/figma-adapter/src/index.ts` (re-export new types)
- Modify: `packages/figma-adapter/src/__tests__/figma-fake.test.ts` (extend)
- Modify: `packages/figma-adapter/src/__tests__/real-figma-adapter.test.ts` (extend)

**Step 1: Failing tests for `FigmaFake`** — append to `figma-fake.test.ts`

```ts
describe("FigmaFake.createSticky", () => {
  it("creates a STICKY node with the given content and a stk-prefixed id", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const a = await fake.createSticky({ content: "first", x: 0, y: 0 });
    const b = await fake.createSticky({ content: "second" });
    expect(a.type).toBe("STICKY");
    expect(a.content).toBe("first");
    expect(a.id).toMatch(/^stk/);
    expect(a.id).not.toBe(b.id);
  });

  it("respects optional authorName", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const a = await fake.createSticky({ content: "x", authorName: "Jonas" });
    expect(a.authorName).toBe("Jonas");
  });

  it("defaults x/y/width/height when unspecified", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const a = await fake.createSticky({ content: "x" });
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(a.width).toBeGreaterThan(0);
    expect(a.height).toBeGreaterThan(0);
  });
});

describe("FigmaFake.createSection", () => {
  it("creates a SECTION node with a name and sec-prefixed id", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({ name: "Goals", x: 100, y: 100, width: 400, height: 300 });
    expect(sec.type).toBe("SECTION");
    expect(sec.name).toBe("Goals");
    expect(sec.id).toMatch(/^sec/);
  });
});

describe("FigmaFake.createConnector", () => {
  it("creates a CONNECTOR linking two known nodes", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const a = await fake.createSticky({ content: "a" });
    const b = await fake.createSticky({ content: "b" });
    const cn = await fake.createConnector({ startNodeId: a.id, endNodeId: b.id });
    expect(cn.type).toBe("CONNECTOR");
    expect(cn.startNodeId).toBe(a.id);
    expect(cn.endNodeId).toBe(b.id);
    expect(cn.id).toMatch(/^cn/);
  });

  it("throws when startNodeId is unknown", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const b = await fake.createSticky({ content: "b" });
    await expect(
      fake.createConnector({ startNodeId: "missing", endNodeId: b.id })
    ).rejects.toThrow(/not found/i);
  });

  it("throws when endNodeId is unknown", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const a = await fake.createSticky({ content: "a" });
    await expect(
      fake.createConnector({ startNodeId: a.id, endNodeId: "missing" })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.createCodeBlock", () => {
  it("creates a CODE_BLOCK with code, language, x, y", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const cb = await fake.createCodeBlock({
      code: "const x = 1;",
      language: "typescript",
      x: 10,
      y: 20,
    });
    expect(cb.type).toBe("CODE_BLOCK");
    expect(cb.code).toBe("const x = 1;");
    expect(cb.language).toBe("typescript");
    expect(cb.id).toMatch(/^cb/);
  });

  it("defaults language to 'plaintext'", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const cb = await fake.createCodeBlock({ code: "raw" });
    expect(cb.language).toBe("plaintext");
  });
});

describe("FigmaFake.createShapeWithText", () => {
  it("creates a SHAPE_WITH_TEXT with a known shape variant", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const swt = await fake.createShapeWithText({
      shape: "diamond",
      content: "Decide",
      width: 120,
      height: 100,
    });
    expect(swt.type).toBe("SHAPE_WITH_TEXT");
    expect(swt.shape).toBe("diamond");
    expect(swt.content).toBe("Decide");
    expect(swt.id).toMatch(/^swt/);
  });
});

describe("FigmaFake.createTable", () => {
  it("creates a TABLE with rows and columns", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const tbl = await fake.createTable({
      rows: 3,
      columns: 4,
      width: 400,
      height: 300,
    });
    expect(tbl.type).toBe("TABLE");
    expect(tbl.rows).toBe(3);
    expect(tbl.columns).toBe(4);
    expect(tbl.id).toMatch(/^tbl/);
  });
});

describe("FigmaFake.setStickyContent", () => {
  it("rewrites the content of an existing sticky", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const stk = await fake.createSticky({ content: "old" });
    await fake.setStickyContent({ nodeId: stk.id, content: "new" });
    const node = await fake.getNodeById({ nodeId: stk.id });
    expect((node as { content?: string }).content).toBe("new");
  });

  it("rejects non-sticky nodes", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "X",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    await expect(
      fake.setStickyContent({ nodeId: sec.id, content: "x" })
    ).rejects.toThrow(/sticky/i);
  });

  it("rejects when nodeId is unknown", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    await expect(
      fake.setStickyContent({ nodeId: "missing", content: "x" })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.setSectionName", () => {
  it("rewrites the name of an existing section", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "Old",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    await fake.setSectionName({ nodeId: sec.id, name: "New" });
    const node = await fake.getNodeById({ nodeId: sec.id });
    expect((node as { name?: string }).name).toBe("New");
  });

  it("rejects non-section nodes", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const stk = await fake.createSticky({ content: "x" });
    await expect(
      fake.setSectionName({ nodeId: stk.id, name: "X" })
    ).rejects.toThrow(/section/i);
  });
});

describe("FigmaFake.moveIntoSection", () => {
  it("adds nodes to a section's children list", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "Group",
      x: 0,
      y: 0,
      width: 1000,
      height: 1000,
    });
    const a = await fake.createSticky({ content: "a" });
    const b = await fake.createSticky({ content: "b" });
    await fake.moveIntoSection({ sectionId: sec.id, nodeIds: [a.id, b.id] });
    const ids = await fake.listSectionChildren({ sectionId: sec.id });
    expect([...ids]).toEqual([a.id, b.id]);
  });

  it("dedupes already-present nodes (idempotent)", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "G",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const a = await fake.createSticky({ content: "a" });
    await fake.moveIntoSection({ sectionId: sec.id, nodeIds: [a.id] });
    await fake.moveIntoSection({ sectionId: sec.id, nodeIds: [a.id] });
    const ids = await fake.listSectionChildren({ sectionId: sec.id });
    expect([...ids]).toEqual([a.id]);
  });

  it("throws when sectionId is unknown", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const a = await fake.createSticky({ content: "a" });
    await expect(
      fake.moveIntoSection({ sectionId: "missing", nodeIds: [a.id] })
    ).rejects.toThrow(/section.*not found/i);
  });

  it("throws when sectionId points to a non-section node", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const stk = await fake.createSticky({ content: "x" });
    await expect(
      fake.moveIntoSection({ sectionId: stk.id, nodeIds: [] })
    ).rejects.toThrow(/section/i);
  });

  it("throws when any nodeId is unknown", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "G",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    await expect(
      fake.moveIntoSection({ sectionId: sec.id, nodeIds: ["nope"] })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.listSectionChildren", () => {
  it("returns an empty list for a fresh section", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "Empty",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(await fake.listSectionChildren({ sectionId: sec.id })).toEqual([]);
  });

  it("throws when the section does not exist", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    await expect(
      fake.listSectionChildren({ sectionId: "missing" })
    ).rejects.toThrow(/section.*not found/i);
  });
});
```

Run: `bun run --filter @repo/figma-adapter test figma-fake` → FAIL.

**Step 2: Extend the interface and node types** — `packages/figma-adapter/src/adapter.ts`

Append to the existing types (after `LineNode` / before `SolidPaint`):

```ts
export interface StickyNode {
  readonly id: string;
  readonly type: "STICKY";
  readonly content: string;
  readonly authorName?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SectionNode {
  readonly id: string;
  readonly type: "SECTION";
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ConnectorNode {
  readonly id: string;
  readonly type: "CONNECTOR";
  readonly startNodeId: string;
  readonly endNodeId: string;
}

export interface CodeBlockNode {
  readonly id: string;
  readonly type: "CODE_BLOCK";
  readonly code: string;
  readonly language: string;
  readonly x: number;
  readonly y: number;
}

export type ShapeWithTextShape =
  | "square"
  | "ellipse"
  | "rounded_rectangle"
  | "diamond"
  | "triangle_up"
  | "triangle_down"
  | "parallelogram_right"
  | "parallelogram_left";

export interface ShapeWithTextNode {
  readonly id: string;
  readonly type: "SHAPE_WITH_TEXT";
  readonly shape: ShapeWithTextShape;
  readonly content: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TableNode {
  readonly id: string;
  readonly type: "TABLE";
  readonly rows: number;
  readonly columns: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
```

Extend the `FigmaAdapter` interface with the 10 new methods:

```ts
export interface FigmaAdapter {
  // …existing members…

  createSticky(args: {
    content: string;
    authorName?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): Promise<StickyNode>;

  createSection(args: {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<SectionNode>;

  createConnector(args: {
    startNodeId: string;
    endNodeId: string;
  }): Promise<ConnectorNode>;

  createCodeBlock(args: {
    code: string;
    language?: string;
    x?: number;
    y?: number;
  }): Promise<CodeBlockNode>;

  createShapeWithText(args: {
    shape: ShapeWithTextShape;
    content: string;
    x?: number;
    y?: number;
    width: number;
    height: number;
  }): Promise<ShapeWithTextNode>;

  createTable(args: {
    rows: number;
    columns: number;
    x?: number;
    y?: number;
    width: number;
    height: number;
  }): Promise<TableNode>;

  setStickyContent(args: { nodeId: string; content: string }): Promise<void>;

  setSectionName(args: { nodeId: string; name: string }): Promise<void>;

  moveIntoSection(args: {
    sectionId: string;
    nodeIds: readonly string[];
  }): Promise<void>;

  listSectionChildren(args: { sectionId: string }): Promise<readonly string[]>;
}
```

> Note: `createSection` requires explicit `x`, `y`, `width`, `height` — sections don't have meaningful defaults the way stickies do, and FigJam users always place them at concrete coordinates with deliberate sizing.

**Step 3: Implement on `FigmaFake`** — `packages/figma-adapter/src/figma-fake.ts`

Add internal mutable shapes and counters (mirror the Phase 8 pattern):

```ts
interface MutableStickyNode {
  id: string;
  type: "STICKY";
  content: string;
  authorName?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MutableSectionNode {
  id: string;
  type: "SECTION";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: string[];
}

interface MutableConnectorNode {
  id: string;
  type: "CONNECTOR";
  startNodeId: string;
  endNodeId: string;
}

interface MutableCodeBlockNode {
  id: string;
  type: "CODE_BLOCK";
  code: string;
  language: string;
  x: number;
  y: number;
}

interface MutableShapeWithTextNode {
  id: string;
  type: "SHAPE_WITH_TEXT";
  shape: ShapeWithTextShape;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MutableTableNode {
  id: string;
  type: "TABLE";
  rows: number;
  columns: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

type AnyMutableNode =
  | MutableRectangleNode
  | MutableFrameNode
  | MutableTextNode
  | MutableEllipseNode
  | MutableLineNode
  | MutableStickyNode
  | MutableSectionNode
  | MutableConnectorNode
  | MutableCodeBlockNode
  | MutableShapeWithTextNode
  | MutableTableNode;

// add to the FigmaFake class:
private stickyCounter = 0;
private sectionCounter = 0;
private connectorCounter = 0;
private codeBlockCounter = 0;
private shapeWithTextCounter = 0;
private tableCounter = 0;
```

Default sticky dimensions (matches the Figma plugin runtime — sticky notes are roughly `200 × 200` by default):

```ts
const DEFAULT_STICKY_SIZE = 200;
```

Method bodies:

```ts
async createSticky(args: {
  content: string;
  authorName?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}): Promise<StickyNode> {
  const id = `stk${++this.stickyCounter}`;
  const mutable: MutableStickyNode = {
    id,
    type: "STICKY",
    content: args.content,
    authorName: args.authorName,
    x: args.x ?? 0,
    y: args.y ?? 0,
    width: args.width ?? DEFAULT_STICKY_SIZE,
    height: args.height ?? DEFAULT_STICKY_SIZE,
  };
  this.allNodes.set(id, mutable);
  return { ...mutable };
}

async createSection(args: {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<SectionNode> {
  const id = `sec${++this.sectionCounter}`;
  const mutable: MutableSectionNode = {
    id,
    type: "SECTION",
    name: args.name,
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    children: [],
  };
  this.allNodes.set(id, mutable);
  return {
    id,
    type: "SECTION",
    name: mutable.name,
    x: mutable.x,
    y: mutable.y,
    width: mutable.width,
    height: mutable.height,
  };
}

async createConnector(args: {
  startNodeId: string;
  endNodeId: string;
}): Promise<ConnectorNode> {
  if (!this.allNodes.has(args.startNodeId)) {
    throw new Error(`startNode not found: ${args.startNodeId}`);
  }
  if (!this.allNodes.has(args.endNodeId)) {
    throw new Error(`endNode not found: ${args.endNodeId}`);
  }
  const id = `cn${++this.connectorCounter}`;
  const mutable: MutableConnectorNode = {
    id,
    type: "CONNECTOR",
    startNodeId: args.startNodeId,
    endNodeId: args.endNodeId,
  };
  this.allNodes.set(id, mutable);
  return { ...mutable };
}

async createCodeBlock(args: {
  code: string;
  language?: string;
  x?: number;
  y?: number;
}): Promise<CodeBlockNode> {
  const id = `cb${++this.codeBlockCounter}`;
  const mutable: MutableCodeBlockNode = {
    id,
    type: "CODE_BLOCK",
    code: args.code,
    language: args.language ?? "plaintext",
    x: args.x ?? 0,
    y: args.y ?? 0,
  };
  this.allNodes.set(id, mutable);
  return { ...mutable };
}

async createShapeWithText(args: {
  shape: ShapeWithTextShape;
  content: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
}): Promise<ShapeWithTextNode> {
  const id = `swt${++this.shapeWithTextCounter}`;
  const mutable: MutableShapeWithTextNode = {
    id,
    type: "SHAPE_WITH_TEXT",
    shape: args.shape,
    content: args.content,
    x: args.x ?? 0,
    y: args.y ?? 0,
    width: args.width,
    height: args.height,
  };
  this.allNodes.set(id, mutable);
  return { ...mutable };
}

async createTable(args: {
  rows: number;
  columns: number;
  x?: number;
  y?: number;
  width: number;
  height: number;
}): Promise<TableNode> {
  const id = `tbl${++this.tableCounter}`;
  const mutable: MutableTableNode = {
    id,
    type: "TABLE",
    rows: args.rows,
    columns: args.columns,
    x: args.x ?? 0,
    y: args.y ?? 0,
    width: args.width,
    height: args.height,
  };
  this.allNodes.set(id, mutable);
  return { ...mutable };
}

async setStickyContent(args: { nodeId: string; content: string }): Promise<void> {
  const node = this.allNodes.get(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  if (node.type !== "STICKY") {
    throw new Error(`expected STICKY node: ${args.nodeId}`);
  }
  node.content = args.content;
}

async setSectionName(args: { nodeId: string; name: string }): Promise<void> {
  const node = this.allNodes.get(args.nodeId);
  if (!node) throw new Error(`node not found: ${args.nodeId}`);
  if (node.type !== "SECTION") {
    throw new Error(`expected SECTION node: ${args.nodeId}`);
  }
  node.name = args.name;
}

async moveIntoSection(args: {
  sectionId: string;
  nodeIds: readonly string[];
}): Promise<void> {
  const section = this.allNodes.get(args.sectionId);
  if (!section) throw new Error(`section not found: ${args.sectionId}`);
  if (section.type !== "SECTION") {
    throw new Error(`expected SECTION node: ${args.sectionId}`);
  }
  for (const id of args.nodeIds) {
    if (!this.allNodes.has(id)) {
      throw new Error(`node not found: ${id}`);
    }
  }
  for (const id of args.nodeIds) {
    if (!section.children.includes(id)) {
      section.children.push(id);
    }
  }
}

async listSectionChildren(args: { sectionId: string }): Promise<readonly string[]> {
  const section = this.allNodes.get(args.sectionId);
  if (!section) throw new Error(`section not found: ${args.sectionId}`);
  if (section.type !== "SECTION") {
    throw new Error(`expected SECTION node: ${args.sectionId}`);
  }
  return [...section.children];
}
```

Extend `snapshot()` so `getNodeById` returns useful shapes for the new node types — a minimal extension that surfaces `content`, `name`, `language`, `code`, `shape`, `rows`, `columns` per type. Keep the implementation small: extend the existing switch / branch list in the `snapshot` method.

```ts
private snapshot(node: AnyMutableNode): NodeSnapshot {
  // …existing branches preserved…
  if (node.type === "STICKY") {
    return {
      id: node.id, type: node.type,
      x: node.x, y: node.y, width: node.width, height: node.height,
      content: node.content,
      authorName: node.authorName,
    };
  }
  if (node.type === "SECTION") {
    return {
      id: node.id, type: node.type,
      x: node.x, y: node.y, width: node.width, height: node.height,
      name: node.name,
    };
  }
  if (node.type === "CONNECTOR") {
    return {
      id: node.id, type: node.type,
      startNodeId: node.startNodeId, endNodeId: node.endNodeId,
    };
  }
  if (node.type === "CODE_BLOCK") {
    return {
      id: node.id, type: node.type,
      x: node.x, y: node.y,
      code: node.code, language: node.language,
    };
  }
  if (node.type === "SHAPE_WITH_TEXT") {
    return {
      id: node.id, type: node.type,
      x: node.x, y: node.y, width: node.width, height: node.height,
      shape: node.shape, content: node.content,
    };
  }
  if (node.type === "TABLE") {
    return {
      id: node.id, type: node.type,
      x: node.x, y: node.y, width: node.width, height: node.height,
      rows: node.rows, columns: node.columns,
    };
  }
  // …existing rectangle/frame/text/ellipse/line branches preserved…
}
```

Extend `NodeSnapshot` in `adapter.ts` accordingly:

```ts
export interface NodeSnapshot {
  readonly id: string;
  readonly type: string;
  readonly width?: number;
  readonly height?: number;
  readonly x?: number;
  readonly y?: number;
  readonly characters?: string;
  readonly fontSize?: number;
  readonly fills?: readonly SolidPaint[];
  readonly strokes?: readonly SolidPaint[];
  readonly strokeWeight?: number;
  // FigJam-specific (Phase 10):
  readonly content?: string;
  readonly authorName?: string;
  readonly name?: string;
  readonly startNodeId?: string;
  readonly endNodeId?: string;
  readonly code?: string;
  readonly language?: string;
  readonly shape?: ShapeWithTextShape;
  readonly rows?: number;
  readonly columns?: number;
}
```

> The `NodeSnapshot` type is intentionally a flat optional bag — every consumer of `getNodeById` already narrows by `type` before reading the type-specific fields. Adding fields here is non-breaking.

**Step 4: Implement on `RealFigmaAdapter`** — `packages/figma-adapter/src/real-figma-adapter.ts`

Mechanical translation. Each method calls the matching `figma.create*()` factory and writes through the result. Key invariants:

- `createSticky`: `figma.createSticky()`, then `node.text.characters = args.content`, optional `node.authorName = args.authorName`. Place via `node.x`, `node.y`. Resize via `node.resize(width, height)` if provided. **Note:** in the real Figma plugin API, `StickyNode.text.characters` requires `await figma.loadFontAsync(node.text.fontName)` before assignment — same pattern as `createText`.
- `createSection`: `figma.createSection()`, then set `node.name`, `node.x`, `node.y`, `node.resizeWithoutConstraints(w, h)` (sections don't honor `resize` the same way frames do).
- `createConnector`: `figma.createConnector()`, then set `node.connectorStart = { endpointNodeId: args.startNodeId, magnet: "AUTO" }` and `node.connectorEnd = { endpointNodeId: args.endNodeId, magnet: "AUTO" }`. Validate that both endpoint nodes exist via `figma.getNodeByIdAsync()` BEFORE creating the connector — if validation fails, never create the half-formed node.
- `createCodeBlock`: `figma.createCodeBlock()`, set `node.code = args.code`, `node.codeLanguage = args.language ?? "PLAINTEXT"` (Figma uppercases the language id internally — implementer maps the lowercase API to the runtime's enum; if a string isn't in the enum, fall back to `"PLAINTEXT"`).
- `createShapeWithText`: `figma.createShapeWithText()`, then `node.shapeType = mapShape(args.shape)` (lowercase to Figma's enum like `SQUARE`, `ROUNDED_RECTANGLE`, etc.). Load font, then `node.text.characters = args.content`. Resize.
- `createTable`: `figma.createTable(args.rows, args.columns)` — Figma's factory takes the dimensions positionally; resize after.
- `setStickyContent`: lookup, narrow to STICKY, load `node.text.fontName`, write `node.text.characters`.
- `setSectionName`: lookup, narrow to SECTION, write `node.name`.
- `moveIntoSection`: lookup the section, narrow, then for each `nodeId` lookup + `section.appendChild(node)`. Figma's `SectionNode.appendChild` is idempotent at the runtime level (it removes from the old parent and re-appends).
- `listSectionChildren`: lookup, narrow to SECTION, return `node.children.map((c) => c.id)`.

Wrap each method in the same `getNodeByIdAsync` + null-check + type-assert pattern as Phase 8's `setNodeFill` / `setNodeStroke`.

Example (sticky):

```ts
async createSticky(args: {
  content: string;
  authorName?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}): Promise<StickyNode> {
  const node = (figma as unknown as { createSticky: () => StickyNodeRT }).createSticky();
  await figma.loadFontAsync(node.text.fontName as FontName);
  node.text.characters = args.content;
  if (args.authorName !== undefined) node.authorName = args.authorName;
  if (args.x !== undefined) node.x = args.x;
  if (args.y !== undefined) node.y = args.y;
  if (args.width !== undefined && args.height !== undefined) {
    (node as unknown as LayoutMixin).resize(args.width, args.height);
  }
  return {
    id: node.id,
    type: "STICKY",
    content: node.text.characters,
    authorName: node.authorName,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
}
```

> `StickyNodeRT` is a local type alias for the runtime's StickyNode shape (`@figma/plugin-typings` exposes it). The cast pattern mirrors what Phase 8 used for `setNodeFill` — `figma`'s typings vary across editor types, so we narrow at the call site.

**Step 5: Failing tests for `RealFigmaAdapter`** — append to `real-figma-adapter.test.ts`. Pattern: stub `figma.createSticky`, `figma.createSection`, etc., assert each delegates and surfaces the summary shape. One happy + one error path per method.

```ts
describe("RealFigmaAdapter.createSticky", () => {
  it("calls figma.createSticky, loads the font, writes content", async () => {
    const node = {
      id: "stk1",
      x: 0, y: 0, width: 200, height: 200,
      authorName: undefined as string | undefined,
      text: {
        fontName: { family: "Inter", style: "Regular" },
        characters: "",
      },
      resize: vi.fn(function (w: number, h: number) {
        this.width = w; this.height = h;
      }),
    };
    const figmaStub = stubFigma({
      createSticky: vi.fn().mockReturnValue(node),
      loadFontAsync: vi.fn().mockResolvedValue(undefined),
    });
    vi.stubGlobal("figma", figmaStub);
    const r = await new RealFigmaAdapter().createSticky({ content: "hello" });
    expect(figmaStub.loadFontAsync).toHaveBeenCalled();
    expect(node.text.characters).toBe("hello");
    expect(r).toMatchObject({ id: "stk1", type: "STICKY", content: "hello" });
  });
});

describe("RealFigmaAdapter.createConnector", () => {
  it("validates both endpoints before creating the connector", async () => {
    vi.stubGlobal("figma", stubFigma({
      getNodeByIdAsync: vi.fn().mockImplementation(async (id: string) => {
        if (id === "a") return { id: "a", type: "STICKY" };
        return null;
      }),
      createConnector: vi.fn(),
    }));
    await expect(
      new RealFigmaAdapter().createConnector({ startNodeId: "a", endNodeId: "b" })
    ).rejects.toThrow(/not found/i);
    expect((figma as unknown as { createConnector: ReturnType<typeof vi.fn> }).createConnector).not.toHaveBeenCalled();
  });
});
```

Repeat one happy + one error per method (`createSection`, `createConnector`, `createCodeBlock`, `createShapeWithText`, `createTable`, `setStickyContent`, `setSectionName`, `moveIntoSection`, `listSectionChildren`).

**Step 6: Re-export new types** — `packages/figma-adapter/src/index.ts`

```ts
export type {
  Component, EditorType, EffectStyle, EllipseNode, FigmaAdapter, FrameNode,
  LineNode, NodeSnapshot, PageSelection, PaintStyle, RectangleNode, SolidPaint,
  StyleBase, TextNode, TextStyle, Variable, VariableCollection,
  // Phase 10:
  StickyNode, SectionNode, ConnectorNode, CodeBlockNode,
  ShapeWithTextNode, ShapeWithTextShape, TableNode,
} from "./adapter";
export { RealFigmaAdapter } from "./real-figma-adapter";
```

**Step 7: Verify, commit**

```bash
bun run --filter @repo/figma-adapter test
git add packages/figma-adapter/src packages/figma-adapter/src/__tests__
git commit -m "feat(figma-adapter): FigJam node types and create/edit methods"
```

---

## Task 10.2: `@repo/tools-figjam` package scaffold

**Goal:** A green-light scaffold so Tasks 10.3–10.7 land cleanly. NO tools yet — just the directory, `package.json`, empty `index.ts`, empty `tools.ts`, empty `plugin-handlers.ts`, and a `__tests__/` directory.

**Files:**

- Create: `packages/tools-figjam/package.json`
- Create: `packages/tools-figjam/tsconfig.json`
- Create: `packages/tools-figjam/vitest.config.ts`
- Create: `packages/tools-figjam/src/index.ts`
- Create: `packages/tools-figjam/src/tools.ts`
- Create: `packages/tools-figjam/src/plugin-handlers.ts`
- Create: `packages/tools-figjam/src/__tests__/.gitkeep`
- Modify: `bun.lock` (via `bun install`)

**Step 1: `package.json`** — same shape as `@repo/tools-design`:

```json
{
  "name": "@repo/tools-figjam",
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

**Step 2: `tsconfig.json` and `vitest.config.ts`** — copy verbatim from `tools-design`. Coverage thresholds `lines: 90, branches: 85, functions: 90, statements: 90`.

**Step 3: Empty source stubs**

```ts
// src/tools.ts
// Phase 10.3-10.7 add 10 tool definitions here.
export {};

// src/plugin-handlers.ts
// Phase 10.3-10.7 add the per-tool handlers here.
// Phase 10.8 adds requireFigJam() and refactors handlers to use it.
export {};

// src/index.ts
/**
 * @repo/tools-figjam — node creation/editing tools for FigJam files.
 * Every tool is gated on `figma.editorType === "figjam"` via the
 * `requireFigJam` guard (Phase 10.8); calling on a Figma editor
 * surfaces `E_FIGMA_EDITOR_TYPE_MISMATCH`.
 */
export * from "./tools";
export * from "./plugin-handlers";
```

**Step 4: Install + verify**

```bash
bun install
bun run --filter @repo/tools-figjam test
```

`vitest run --passWithNoTests` should exit 0.

**Step 5: Commit**

```bash
git add packages/tools-figjam bun.lock
git commit -m "feat(tools-figjam): package scaffold (no tools yet)"
```

---

## Task 10.3: `tools-figjam` — `create_sticky`, `create_section`

**Goal:** First two FigJam tools. Each handler checks `figma.editorType === "figjam"` (inline for now; Task 10.8 lifts the check into a shared helper) and delegates to the matching adapter method. Tests run against `new FigmaFake({ editorType: "figjam" })`.

**Files:**

- Modify: `packages/tools-figjam/src/tools.ts`
- Modify: `packages/tools-figjam/src/plugin-handlers.ts`
- Create: `packages/tools-figjam/src/__tests__/tools.test.ts`
- Create: `packages/tools-figjam/src/__tests__/plugin-handlers.test.ts`

**Step 1: Failing tests** — `tools.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { CreateSection, CreateSticky } from "../tools";

describe("CreateSticky schema", () => {
  it("accepts content with optional authorName + placement", () => {
    expect(CreateSticky.input.safeParse({ content: "hi" }).success).toBe(true);
    expect(
      CreateSticky.input.safeParse({
        content: "hi",
        authorName: "J",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
      }).success
    ).toBe(true);
  });

  it("rejects empty content", () => {
    expect(CreateSticky.input.safeParse({ content: "" }).success).toBe(false);
  });

  it("output is {nodeId, type: 'STICKY'}", () => {
    expect(
      CreateSticky.output.safeParse({ nodeId: "stk1", type: "STICKY" }).success
    ).toBe(true);
  });
});

describe("CreateSection schema", () => {
  it("requires name + position + dimensions", () => {
    expect(
      CreateSection.input.safeParse({
        name: "Goals",
        x: 0,
        y: 0,
        width: 400,
        height: 300,
      }).success
    ).toBe(true);
    expect(
      CreateSection.input.safeParse({ name: "Goals" }).success
    ).toBe(false);
  });

  it("rejects empty name", () => {
    expect(
      CreateSection.input.safeParse({
        name: "",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }).success
    ).toBe(false);
  });

  it("rejects non-positive dimensions", () => {
    expect(
      CreateSection.input.safeParse({
        name: "X",
        x: 0,
        y: 0,
        width: 0,
        height: 100,
      }).success
    ).toBe(false);
  });
});
```

**Step 2: Failing tests** — `plugin-handlers.test.ts`

```ts
import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  createSectionPluginHandler,
  createStickyPluginHandler,
} from "../plugin-handlers";

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const figJamCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "figjam" }),
});
const figmaCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "figma" }),
});

describe("createStickyPluginHandler", () => {
  it("creates a sticky on a FigJam editor", async () => {
    const ctx = figJamCtx();
    const out = await createStickyPluginHandler(
      { content: "hello" },
      ctx
    );
    expect(out.type).toBe("STICKY");
    expect(out.nodeId).toMatch(/^stk/);
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { content?: string }).content).toBe("hello");
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createStickyPluginHandler({ content: "hello" }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Slides editor", async () => {
    const ctx = {
      logger: noopLogger,
      figma: new FigmaFake({ editorType: "slides" }),
    };
    await expect(
      createStickyPluginHandler({ content: "hi" }, ctx)
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("createSectionPluginHandler", () => {
  it("creates a section on a FigJam editor", async () => {
    const ctx = figJamCtx();
    const out = await createSectionPluginHandler(
      { name: "Goals", x: 0, y: 0, width: 400, height: 300 },
      ctx
    );
    expect(out.type).toBe("SECTION");
    expect(out.nodeId).toMatch(/^sec/);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createSectionPluginHandler(
        { name: "Goals", x: 0, y: 0, width: 400, height: 300 },
        figmaCtx()
      )
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});
```

**Step 3: Implement schemas** — `tools.ts`

```ts
import { defineTool } from "@repo/protocol";
import { z } from "zod";

const PositiveDimension = z.number().positive();

export const CreateSticky = defineTool({
  name: "create_sticky",
  description:
    "FigJam-only. Create a sticky note with the given content (and optional author name).",
  streaming: false,
  input: z
    .object({
      content: z.string().min(1),
      authorName: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: PositiveDimension.optional(),
      height: PositiveDimension.optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("STICKY") }),
});

export const CreateSection = defineTool({
  name: "create_section",
  description: "FigJam-only. Create a labeled section that can group nodes.",
  streaming: false,
  input: z
    .object({
      name: z.string().min(1),
      x: z.number(),
      y: z.number(),
      width: PositiveDimension,
      height: PositiveDimension,
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SECTION") }),
});
```

**Step 4: Implement handlers** — `plugin-handlers.ts`

> Inline editor-type check; lifted into `requireFigJam()` in Task 10.8.

```ts
import type { PluginHandler } from "@repo/protocol";
import type { CreateSection, CreateSticky } from "./tools";

const E_MISMATCH = "E_FIGMA_EDITOR_TYPE_MISMATCH";

export const createStickyPluginHandler: PluginHandler<typeof CreateSticky> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(`${E_MISMATCH}: create_sticky requires editorType=figjam (got ${figma.editorType})`);
  }
  const node = await figma.createSticky(args);
  return { nodeId: node.id, type: "STICKY" };
};

export const createSectionPluginHandler: PluginHandler<typeof CreateSection> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(`${E_MISMATCH}: create_section requires editorType=figjam (got ${figma.editorType})`);
  }
  const node = await figma.createSection(args);
  return { nodeId: node.id, type: "SECTION" };
};
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-figjam test
git add packages/tools-figjam/src
git commit -m "feat(tools-figjam): create_sticky, create_section"
```

---

## Task 10.4: `tools-figjam` — `create_connector`, `create_code_block`

**Goal:** `create_connector({startNodeId, endNodeId})` requires both endpoint nodes to exist; the adapter validates this synchronously. `create_code_block({code, language?, x?, y?})` accepts free-form `language` (string) defaulting to `"plaintext"`.

**Files:**

- Modify: `packages/tools-figjam/src/tools.ts`
- Modify: `packages/tools-figjam/src/plugin-handlers.ts`
- Modify: `packages/tools-figjam/src/__tests__/tools.test.ts`
- Modify: `packages/tools-figjam/src/__tests__/plugin-handlers.test.ts`

**Step 1: Failing tests** — append to `tools.test.ts`

```ts
describe("CreateConnector schema", () => {
  it("requires both endpoints", () => {
    expect(
      CreateConnector.input.safeParse({ startNodeId: "a", endNodeId: "b" }).success
    ).toBe(true);
    expect(CreateConnector.input.safeParse({ startNodeId: "a" }).success).toBe(false);
    expect(CreateConnector.input.safeParse({ endNodeId: "b" }).success).toBe(false);
  });

  it("rejects empty endpoints", () => {
    expect(
      CreateConnector.input.safeParse({ startNodeId: "", endNodeId: "b" }).success
    ).toBe(false);
  });

  it("output returns nodeId + type CONNECTOR", () => {
    expect(
      CreateConnector.output.safeParse({ nodeId: "cn1", type: "CONNECTOR" }).success
    ).toBe(true);
  });
});

describe("CreateCodeBlock schema", () => {
  it("requires code", () => {
    expect(CreateCodeBlock.input.safeParse({}).success).toBe(false);
    expect(CreateCodeBlock.input.safeParse({ code: "x" }).success).toBe(true);
  });

  it("language defaults to 'plaintext'", () => {
    const r = CreateCodeBlock.input.parse({ code: "x" });
    expect(r.language).toBe("plaintext");
  });
});
```

**Step 2: Failing tests** — append to `plugin-handlers.test.ts`

```ts
describe("createConnectorPluginHandler", () => {
  it("creates a connector between two existing nodes", async () => {
    const figma = new FigmaFake({ editorType: "figjam" });
    const a = await figma.createSticky({ content: "a" });
    const b = await figma.createSticky({ content: "b" });
    const out = await createConnectorPluginHandler(
      { startNodeId: a.id, endNodeId: b.id },
      { logger: noopLogger, figma }
    );
    expect(out.type).toBe("CONNECTOR");
    expect(out.nodeId).toMatch(/^cn/);
  });

  it("rejects when startNodeId is unknown", async () => {
    const figma = new FigmaFake({ editorType: "figjam" });
    const b = await figma.createSticky({ content: "b" });
    await expect(
      createConnectorPluginHandler(
        { startNodeId: "missing", endNodeId: b.id },
        { logger: noopLogger, figma }
      )
    ).rejects.toThrow(/not found/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createConnectorPluginHandler(
        { startNodeId: "a", endNodeId: "b" },
        figmaCtx()
      )
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("createCodeBlockPluginHandler", () => {
  it("creates a code block with default language", async () => {
    const ctx = figJamCtx();
    const out = await createCodeBlockPluginHandler(
      { code: "raw", language: "plaintext" },
      ctx
    );
    expect(out.type).toBe("CODE_BLOCK");
    expect(out.nodeId).toMatch(/^cb/);
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { language?: string }).language).toBe("plaintext");
  });

  it("uses an explicit language", async () => {
    const ctx = figJamCtx();
    const out = await createCodeBlockPluginHandler(
      { code: "const x = 1;", language: "typescript" },
      ctx
    );
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { language?: string }).language).toBe("typescript");
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createCodeBlockPluginHandler({ code: "x", language: "plaintext" }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});
```

**Step 3: Implement schemas** — append to `tools.ts`

```ts
export const CreateConnector = defineTool({
  name: "create_connector",
  description:
    "FigJam-only. Create a connector linking two existing nodes by id. Both endpoints must exist.",
  streaming: false,
  input: z
    .object({
      startNodeId: z.string().min(1),
      endNodeId: z.string().min(1),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("CONNECTOR") }),
});

export const CreateCodeBlock = defineTool({
  name: "create_code_block",
  description:
    "FigJam-only. Create a code block with a language label (defaults to 'plaintext').",
  streaming: false,
  input: z
    .object({
      code: z.string(),
      language: z.string().min(1).default("plaintext"),
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("CODE_BLOCK") }),
});
```

> The `code` field is `z.string()` with no `.min(1)` — empty code blocks are valid placeholders in FigJam (users often paste later). The `language` field has `.min(1)` because the `default("plaintext")` resolves the empty case at parse time.

**Step 4: Implement handlers** — append to `plugin-handlers.ts`

```ts
import type { CreateCodeBlock, CreateConnector } from "./tools";

export const createConnectorPluginHandler: PluginHandler<typeof CreateConnector> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(`${E_MISMATCH}: create_connector requires editorType=figjam (got ${figma.editorType})`);
  }
  const node = await figma.createConnector(args);
  return { nodeId: node.id, type: "CONNECTOR" };
};

export const createCodeBlockPluginHandler: PluginHandler<typeof CreateCodeBlock> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(`${E_MISMATCH}: create_code_block requires editorType=figjam (got ${figma.editorType})`);
  }
  const node = await figma.createCodeBlock({
    code: args.code,
    language: args.language,
    x: args.x,
    y: args.y,
  });
  return { nodeId: node.id, type: "CODE_BLOCK" };
};
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-figjam test
git add packages/tools-figjam/src
git commit -m "feat(tools-figjam): create_connector, create_code_block"
```

---

## Task 10.5: `tools-figjam` — `create_shape_with_text`, `create_table`

**Goal:** `create_shape_with_text` accepts a Zod enum of shape ids plus content + dimensions. `create_table` accepts positive integer rows + columns.

**Files:**

- Modify: `packages/tools-figjam/src/tools.ts`
- Modify: `packages/tools-figjam/src/plugin-handlers.ts`
- Modify: `packages/tools-figjam/src/__tests__/tools.test.ts`
- Modify: `packages/tools-figjam/src/__tests__/plugin-handlers.test.ts`

**Step 1: Failing tests** — append to `tools.test.ts`

```ts
describe("CreateShapeWithText schema", () => {
  it("accepts each known shape variant", () => {
    const variants = [
      "square", "ellipse", "rounded_rectangle", "diamond",
      "triangle_up", "triangle_down", "parallelogram_right", "parallelogram_left",
    ];
    for (const shape of variants) {
      expect(
        CreateShapeWithText.input.safeParse({
          shape,
          content: "X",
          width: 100,
          height: 100,
        }).success
      ).toBe(true);
    }
  });

  it("rejects unknown shape values", () => {
    expect(
      CreateShapeWithText.input.safeParse({
        shape: "hexagon",
        content: "X",
        width: 100,
        height: 100,
      }).success
    ).toBe(false);
  });

  it("rejects empty content", () => {
    expect(
      CreateShapeWithText.input.safeParse({
        shape: "square",
        content: "",
        width: 100,
        height: 100,
      }).success
    ).toBe(false);
  });
});

describe("CreateTable schema", () => {
  it("requires positive integer rows + columns", () => {
    expect(
      CreateTable.input.safeParse({
        rows: 3,
        columns: 4,
        width: 400,
        height: 300,
      }).success
    ).toBe(true);
  });

  it("rejects zero or negative rows/columns", () => {
    expect(
      CreateTable.input.safeParse({
        rows: 0,
        columns: 4,
        width: 100,
        height: 100,
      }).success
    ).toBe(false);
    expect(
      CreateTable.input.safeParse({
        rows: 3,
        columns: -1,
        width: 100,
        height: 100,
      }).success
    ).toBe(false);
  });

  it("rejects non-integer rows/columns", () => {
    expect(
      CreateTable.input.safeParse({
        rows: 1.5,
        columns: 4,
        width: 100,
        height: 100,
      }).success
    ).toBe(false);
  });
});
```

**Step 2: Failing tests** — append to `plugin-handlers.test.ts`

```ts
describe("createShapeWithTextPluginHandler", () => {
  it("creates a SHAPE_WITH_TEXT with the given variant + content", async () => {
    const ctx = figJamCtx();
    const out = await createShapeWithTextPluginHandler(
      { shape: "diamond", content: "Decide", width: 100, height: 80 },
      ctx
    );
    expect(out.type).toBe("SHAPE_WITH_TEXT");
    expect(out.nodeId).toMatch(/^swt/);
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { shape?: string }).shape).toBe("diamond");
    expect((node as { content?: string }).content).toBe("Decide");
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createShapeWithTextPluginHandler(
        { shape: "square", content: "X", width: 10, height: 10 },
        figmaCtx()
      )
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("createTablePluginHandler", () => {
  it("creates a TABLE with the given grid", async () => {
    const ctx = figJamCtx();
    const out = await createTablePluginHandler(
      { rows: 3, columns: 4, width: 400, height: 300 },
      ctx
    );
    expect(out.type).toBe("TABLE");
    expect(out.nodeId).toMatch(/^tbl/);
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { rows?: number }).rows).toBe(3);
    expect((node as { columns?: number }).columns).toBe(4);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createTablePluginHandler(
        { rows: 1, columns: 1, width: 10, height: 10 },
        figmaCtx()
      )
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});
```

**Step 3: Implement schemas** — append to `tools.ts`

```ts
const ShapeWithTextShape = z.enum([
  "square",
  "ellipse",
  "rounded_rectangle",
  "diamond",
  "triangle_up",
  "triangle_down",
  "parallelogram_right",
  "parallelogram_left",
]);

export const CreateShapeWithText = defineTool({
  name: "create_shape_with_text",
  description:
    "FigJam-only. Create a labeled shape (sticky-note-like surface with a fixed silhouette).",
  streaming: false,
  input: z
    .object({
      shape: ShapeWithTextShape,
      content: z.string().min(1),
      x: z.number().optional(),
      y: z.number().optional(),
      width: PositiveDimension,
      height: PositiveDimension,
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SHAPE_WITH_TEXT") }),
});

export const CreateTable = defineTool({
  name: "create_table",
  description: "FigJam-only. Create a table with the given row + column count.",
  streaming: false,
  input: z
    .object({
      rows: z.number().int().positive(),
      columns: z.number().int().positive(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: PositiveDimension,
      height: PositiveDimension,
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("TABLE") }),
});
```

**Step 4: Implement handlers** — append to `plugin-handlers.ts`

```ts
import type { CreateShapeWithText, CreateTable } from "./tools";

export const createShapeWithTextPluginHandler: PluginHandler<typeof CreateShapeWithText> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(`${E_MISMATCH}: create_shape_with_text requires editorType=figjam (got ${figma.editorType})`);
  }
  const node = await figma.createShapeWithText({
    shape: args.shape,
    content: args.content,
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
  });
  return { nodeId: node.id, type: "SHAPE_WITH_TEXT" };
};

export const createTablePluginHandler: PluginHandler<typeof CreateTable> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(`${E_MISMATCH}: create_table requires editorType=figjam (got ${figma.editorType})`);
  }
  const node = await figma.createTable({
    rows: args.rows,
    columns: args.columns,
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
  });
  return { nodeId: node.id, type: "TABLE" };
};
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-figjam test
git add packages/tools-figjam/src
git commit -m "feat(tools-figjam): create_shape_with_text, create_table"
```

---

## Task 10.6: `tools-figjam` — `set_sticky_content`, `set_section_name`

**Goal:** Two mutators. `set_sticky_content` rejects non-sticky nodes; `set_section_name` rejects non-section nodes. Both rely on the adapter's type-narrowing throws.

**Files:**

- Modify: `packages/tools-figjam/src/tools.ts`
- Modify: `packages/tools-figjam/src/plugin-handlers.ts`
- Modify: `packages/tools-figjam/src/__tests__/tools.test.ts`
- Modify: `packages/tools-figjam/src/__tests__/plugin-handlers.test.ts`

**Step 1: Failing tests** — append to `tools.test.ts`

```ts
describe("SetStickyContent schema", () => {
  it("requires nodeId + content", () => {
    expect(
      SetStickyContent.input.safeParse({ nodeId: "stk1", content: "x" }).success
    ).toBe(true);
    expect(SetStickyContent.input.safeParse({ nodeId: "stk1" }).success).toBe(false);
    expect(SetStickyContent.input.safeParse({ content: "x" }).success).toBe(false);
  });

  it("rejects empty content", () => {
    expect(
      SetStickyContent.input.safeParse({ nodeId: "stk1", content: "" }).success
    ).toBe(false);
  });

  it("output returns nodeId + type", () => {
    expect(
      SetStickyContent.output.safeParse({ nodeId: "stk1", type: "STICKY" }).success
    ).toBe(true);
  });
});

describe("SetSectionName schema", () => {
  it("requires nodeId + name", () => {
    expect(
      SetSectionName.input.safeParse({ nodeId: "sec1", name: "X" }).success
    ).toBe(true);
    expect(SetSectionName.input.safeParse({ nodeId: "sec1" }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(
      SetSectionName.input.safeParse({ nodeId: "sec1", name: "" }).success
    ).toBe(false);
  });
});
```

**Step 2: Failing tests** — append to `plugin-handlers.test.ts`

```ts
describe("setStickyContentPluginHandler", () => {
  it("rewrites a sticky's content", async () => {
    const ctx = figJamCtx();
    const stk = await ctx.figma.createSticky({ content: "old" });
    await setStickyContentPluginHandler(
      { nodeId: stk.id, content: "new" },
      ctx
    );
    const node = await ctx.figma.getNodeById({ nodeId: stk.id });
    expect((node as { content?: string }).content).toBe("new");
  });

  it("rejects non-sticky nodes", async () => {
    const ctx = figJamCtx();
    const sec = await ctx.figma.createSection({
      name: "X",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    await expect(
      setStickyContentPluginHandler({ nodeId: sec.id, content: "x" }, ctx)
    ).rejects.toThrow(/sticky/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      setStickyContentPluginHandler(
        { nodeId: "stk1", content: "x" },
        figmaCtx()
      )
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("setSectionNamePluginHandler", () => {
  it("rewrites a section's name", async () => {
    const ctx = figJamCtx();
    const sec = await ctx.figma.createSection({
      name: "Old",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    await setSectionNamePluginHandler(
      { nodeId: sec.id, name: "New" },
      ctx
    );
    const node = await ctx.figma.getNodeById({ nodeId: sec.id });
    expect((node as { name?: string }).name).toBe("New");
  });

  it("rejects non-section nodes", async () => {
    const ctx = figJamCtx();
    const stk = await ctx.figma.createSticky({ content: "x" });
    await expect(
      setSectionNamePluginHandler({ nodeId: stk.id, name: "X" }, ctx)
    ).rejects.toThrow(/section/i);
  });
});
```

**Step 3: Implement schemas** — append to `tools.ts`

```ts
export const SetStickyContent = defineTool({
  name: "set_sticky_content",
  description: "FigJam-only. Replace the content of an existing sticky note.",
  streaming: false,
  input: z
    .object({
      nodeId: z.string().min(1),
      content: z.string().min(1),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("STICKY") }),
});

export const SetSectionName = defineTool({
  name: "set_section_name",
  description: "FigJam-only. Replace the name label of an existing section.",
  streaming: false,
  input: z
    .object({
      nodeId: z.string().min(1),
      name: z.string().min(1),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SECTION") }),
});
```

**Step 4: Implement handlers** — append to `plugin-handlers.ts`

```ts
import type { SetSectionName, SetStickyContent } from "./tools";

export const setStickyContentPluginHandler: PluginHandler<typeof SetStickyContent> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(`${E_MISMATCH}: set_sticky_content requires editorType=figjam (got ${figma.editorType})`);
  }
  await figma.setStickyContent({ nodeId: args.nodeId, content: args.content });
  return { nodeId: args.nodeId, type: "STICKY" };
};

export const setSectionNamePluginHandler: PluginHandler<typeof SetSectionName> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(`${E_MISMATCH}: set_section_name requires editorType=figjam (got ${figma.editorType})`);
  }
  await figma.setSectionName({ nodeId: args.nodeId, name: args.name });
  return { nodeId: args.nodeId, type: "SECTION" };
};
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-figjam test
git add packages/tools-figjam/src
git commit -m "feat(tools-figjam): set_sticky_content, set_section_name"
```

---

## Task 10.7: `tools-figjam` — `move_into_section`, `list_section_children`

**Goal:** `move_into_section({sectionId, nodeIds})` adds the node ids to the section's child list (the FigmaFake stores them as a string array). `list_section_children({sectionId})` returns `{nodeIds, count}`.

**Files:**

- Modify: `packages/tools-figjam/src/tools.ts`
- Modify: `packages/tools-figjam/src/plugin-handlers.ts`
- Modify: `packages/tools-figjam/src/__tests__/tools.test.ts`
- Modify: `packages/tools-figjam/src/__tests__/plugin-handlers.test.ts`

**Step 1: Failing tests** — append to `tools.test.ts`

```ts
describe("MoveIntoSection schema", () => {
  it("requires sectionId + nodeIds", () => {
    expect(
      MoveIntoSection.input.safeParse({ sectionId: "sec1", nodeIds: ["a"] }).success
    ).toBe(true);
  });

  it("accepts an empty nodeIds array (no-op)", () => {
    expect(
      MoveIntoSection.input.safeParse({ sectionId: "sec1", nodeIds: [] }).success
    ).toBe(true);
  });

  it("rejects empty sectionId", () => {
    expect(
      MoveIntoSection.input.safeParse({ sectionId: "", nodeIds: ["a"] }).success
    ).toBe(false);
  });

  it("output reports moved count", () => {
    expect(MoveIntoSection.output.safeParse({ sectionId: "sec1", moved: 2 }).success).toBe(true);
  });
});

describe("ListSectionChildren schema", () => {
  it("requires sectionId", () => {
    expect(ListSectionChildren.input.safeParse({ sectionId: "sec1" }).success).toBe(true);
    expect(ListSectionChildren.input.safeParse({}).success).toBe(false);
  });

  it("output returns nodeIds + count", () => {
    expect(
      ListSectionChildren.output.safeParse({ nodeIds: [], count: 0 }).success
    ).toBe(true);
    expect(
      ListSectionChildren.output.safeParse({ nodeIds: ["a", "b"], count: 2 }).success
    ).toBe(true);
  });
});
```

**Step 2: Failing tests** — append to `plugin-handlers.test.ts`

```ts
describe("moveIntoSectionPluginHandler", () => {
  it("appends node ids to a section's children", async () => {
    const ctx = figJamCtx();
    const sec = await ctx.figma.createSection({
      name: "G",
      x: 0,
      y: 0,
      width: 1000,
      height: 1000,
    });
    const a = await ctx.figma.createSticky({ content: "a" });
    const b = await ctx.figma.createSticky({ content: "b" });
    const out = await moveIntoSectionPluginHandler(
      { sectionId: sec.id, nodeIds: [a.id, b.id] },
      ctx
    );
    expect(out).toEqual({ sectionId: sec.id, moved: 2 });
    const ids = await ctx.figma.listSectionChildren({ sectionId: sec.id });
    expect([...ids]).toEqual([a.id, b.id]);
  });

  it("rejects unknown section", async () => {
    const ctx = figJamCtx();
    await expect(
      moveIntoSectionPluginHandler(
        { sectionId: "missing", nodeIds: [] },
        ctx
      )
    ).rejects.toThrow(/section.*not found/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      moveIntoSectionPluginHandler(
        { sectionId: "sec1", nodeIds: [] },
        figmaCtx()
      )
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("listSectionChildrenPluginHandler", () => {
  it("returns the current child node ids and their count", async () => {
    const ctx = figJamCtx();
    const sec = await ctx.figma.createSection({
      name: "G",
      x: 0,
      y: 0,
      width: 1000,
      height: 1000,
    });
    const a = await ctx.figma.createSticky({ content: "a" });
    await ctx.figma.moveIntoSection({ sectionId: sec.id, nodeIds: [a.id] });
    const out = await listSectionChildrenPluginHandler(
      { sectionId: sec.id },
      ctx
    );
    expect(out).toEqual({ nodeIds: [a.id], count: 1 });
  });

  it("returns empty list for an unsourced section", async () => {
    const ctx = figJamCtx();
    const sec = await ctx.figma.createSection({
      name: "Empty",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const out = await listSectionChildrenPluginHandler(
      { sectionId: sec.id },
      ctx
    );
    expect(out).toEqual({ nodeIds: [], count: 0 });
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      listSectionChildrenPluginHandler({ sectionId: "sec1" }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});
```

**Step 3: Implement schemas** — append to `tools.ts`

```ts
export const MoveIntoSection = defineTool({
  name: "move_into_section",
  description: "FigJam-only. Add node ids to a section's children list.",
  streaming: false,
  input: z
    .object({
      sectionId: z.string().min(1),
      nodeIds: z.array(z.string().min(1)),
    })
    .strict(),
  output: z.object({
    sectionId: z.string(),
    moved: z.number().int().nonnegative(),
  }),
});

export const ListSectionChildren = defineTool({
  name: "list_section_children",
  description: "FigJam-only. Return the node ids currently inside a section.",
  streaming: false,
  input: z.object({ sectionId: z.string().min(1) }).strict(),
  output: z.object({
    nodeIds: z.array(z.string()),
    count: z.number().int().nonnegative(),
  }),
});
```

**Step 4: Implement handlers** — append to `plugin-handlers.ts`

```ts
import type { ListSectionChildren, MoveIntoSection } from "./tools";

export const moveIntoSectionPluginHandler: PluginHandler<typeof MoveIntoSection> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(`${E_MISMATCH}: move_into_section requires editorType=figjam (got ${figma.editorType})`);
  }
  await figma.moveIntoSection({
    sectionId: args.sectionId,
    nodeIds: args.nodeIds,
  });
  return { sectionId: args.sectionId, moved: args.nodeIds.length };
};

export const listSectionChildrenPluginHandler: PluginHandler<typeof ListSectionChildren> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(`${E_MISMATCH}: list_section_children requires editorType=figjam (got ${figma.editorType})`);
  }
  const nodeIds = await figma.listSectionChildren({ sectionId: args.sectionId });
  return { nodeIds: [...nodeIds], count: nodeIds.length };
};
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-figjam test
git add packages/tools-figjam/src
git commit -m "feat(tools-figjam): move_into_section, list_section_children"
```

---

## Task 10.8: Editor-type guard helper + handler refactor

**Goal:** Lift the `figma.editorType !== "figjam"` check into a single `requireFigJam()` helper. Each handler in `plugin-handlers.ts` calls `requireFigJam(figma, "<tool_name>")` instead of inlining the check. The helper is independently unit-tested. Refactor leaves behavior unchanged — the existing handler tests (10.3–10.7) pass without modification.

**Why now (and not in 10.3 first)?** Each task lands as a self-contained, reviewable unit; introducing the helper at 10.8 means the prior tasks' handler diffs read top-to-bottom (no forward references). The refactor here is mechanical. **Implementer judgment:** if a sub-agent decides to land the helper at 10.3 and reuse it across 10.4–10.7, that's also valid — keep the discipline of "every handler uses the same pattern."

**Files:**

- Create: `packages/tools-figjam/src/guard.ts`
- Create: `packages/tools-figjam/src/__tests__/guard.test.ts`
- Modify: `packages/tools-figjam/src/plugin-handlers.ts` (replace inline checks)
- Modify: `packages/tools-figjam/src/index.ts` (re-export)

**Step 1: Failing tests for the guard** — `packages/tools-figjam/src/__tests__/guard.test.ts`

```ts
import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import { requireFigJam, E_FIGMA_EDITOR_TYPE_MISMATCH } from "../guard";

describe("requireFigJam", () => {
  it("returns the adapter when editorType is figjam", () => {
    const figma = new FigmaFake({ editorType: "figjam" });
    expect(requireFigJam(figma, "tool_x")).toBe(figma);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on figma editor", () => {
    const figma = new FigmaFake({ editorType: "figma" });
    expect(() => requireFigJam(figma, "tool_x")).toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });

  it("throws on slides editor", () => {
    const figma = new FigmaFake({ editorType: "slides" });
    expect(() => requireFigJam(figma, "tool_x")).toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });

  it("includes the tool name and the offending editor type in the error message", () => {
    const figma = new FigmaFake({ editorType: "figma" });
    try {
      requireFigJam(figma, "create_sticky");
      expect.fail("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("create_sticky");
      expect(message).toContain("figjam");
      expect(message).toContain("figma");
    }
  });

  it("exposes the error code as a module constant", () => {
    expect(E_FIGMA_EDITOR_TYPE_MISMATCH).toBe("E_FIGMA_EDITOR_TYPE_MISMATCH");
  });
});
```

**Step 2: Implement the guard** — `packages/tools-figjam/src/guard.ts`

```ts
import type { FigmaAdapter } from "@repo/figma-adapter";

export const E_FIGMA_EDITOR_TYPE_MISMATCH = "E_FIGMA_EDITOR_TYPE_MISMATCH";

/**
 * Editor-type discriminator guard. Every FigJam tool handler calls
 * `requireFigJam(figma, "<tool_name>")` before touching the API.
 *
 * On mismatch, throws an Error whose `message` starts with
 * `E_FIGMA_EDITOR_TYPE_MISMATCH:` so the daemon's protocol-error
 * mapper surfaces it as the corresponding wire error code.
 */
export function requireFigJam(figma: FigmaAdapter, toolName: string): FigmaAdapter {
  if (figma.editorType !== "figjam") {
    throw new Error(
      `${E_FIGMA_EDITOR_TYPE_MISMATCH}: ${toolName} requires editorType=figjam (got ${figma.editorType})`
    );
  }
  return figma;
}
```

**Step 3: Refactor handlers** — `packages/tools-figjam/src/plugin-handlers.ts`

Replace each inline check with a call to `requireFigJam`. The body shrinks from 4 lines (declare local error code, branch, throw) to 1 line. Example:

```ts
// before:
export const createStickyPluginHandler: PluginHandler<typeof CreateSticky> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(`${E_MISMATCH}: create_sticky requires editorType=figjam (got ${figma.editorType})`);
  }
  const node = await figma.createSticky(args);
  return { nodeId: node.id, type: "STICKY" };
};

// after:
import { requireFigJam } from "./guard";

export const createStickyPluginHandler: PluginHandler<typeof CreateSticky> = async (
  args,
  { figma }
) => {
  const fj = requireFigJam(figma, "create_sticky");
  const node = await fj.createSticky(args);
  return { nodeId: node.id, type: "STICKY" };
};
```

Repeat for all 10 handlers. Drop the local `E_MISMATCH` constant — `requireFigJam` owns the literal.

**Step 4: Re-export the guard** — append to `packages/tools-figjam/src/index.ts`

```ts
export * from "./tools";
export * from "./plugin-handlers";
export { requireFigJam, E_FIGMA_EDITOR_TYPE_MISMATCH } from "./guard";
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-figjam test
git add packages/tools-figjam/src
git commit -m "feat(tools-figjam): requireFigJam guard helper + handler refactor"
```

> The pre-existing handler tests (every "throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor" case from 10.3–10.7) continue to pass — the matched substring `E_FIGMA_EDITOR_TYPE_MISMATCH` is identical.

---

## Task 10.9: Wire `tools-figjam` into mcp-server + bridge-plugin + e2e catalog test

**Goal:** Both `apps/mcp-server` and `apps/bridge-plugin` register the new pack. An e2e catalog test asserts the 10 wire names exist.

**Files:**

- Modify: `apps/mcp-server/package.json` (add `@repo/tools-figjam`)
- Modify: `apps/mcp-server/src/main.ts` (register the pack + extend the shim's `tools` list)
- Modify: `apps/bridge-plugin/package.json` (add `@repo/tools-figjam`)
- Modify: `apps/bridge-plugin/src/plugin.ts` (register all 10 handlers)
- Create: `apps/mcp-server/src/__tests__/e2e-phase10-catalog.test.ts`
- Modify: `bun.lock` (via `bun install`)

**Step 1: Failing test** — `apps/mcp-server/src/__tests__/e2e-phase10-catalog.test.ts`

```ts
import {
  CreateCodeBlock,
  CreateConnector,
  CreateSection,
  CreateShapeWithText,
  CreateSticky,
  CreateTable,
  ListSectionChildren,
  MoveIntoSection,
  SetSectionName,
  SetStickyContent,
} from "@repo/tools-figjam";
import { describe, expect, it } from "vitest";

describe("Phase 10 tool catalog", () => {
  it("exposes 10 figjam tools with the expected names", () => {
    const names = [
      CreateSticky.name,
      CreateSection.name,
      CreateConnector.name,
      CreateCodeBlock.name,
      CreateShapeWithText.name,
      CreateTable.name,
      SetStickyContent.name,
      SetSectionName.name,
      MoveIntoSection.name,
      ListSectionChildren.name,
    ];
    expect(new Set(names).size).toBe(10);
    expect(names).toEqual([
      "create_sticky",
      "create_section",
      "create_connector",
      "create_code_block",
      "create_shape_with_text",
      "create_table",
      "set_sticky_content",
      "set_section_name",
      "move_into_section",
      "list_section_children",
    ]);
  });

  it("every tool's input schema rejects extraneous keys (strict)", () => {
    const tools = [
      CreateSticky, CreateSection, CreateConnector, CreateCodeBlock,
      CreateShapeWithText, CreateTable, SetStickyContent, SetSectionName,
      MoveIntoSection, ListSectionChildren,
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

**Step 2: Add deps**

```jsonc
// apps/mcp-server/package.json
"@repo/tools-figjam": "workspace:*"

// apps/bridge-plugin/package.json
"@repo/tools-figjam": "workspace:*"
```

Run `bun install`.

**Step 3: Wire into `main.ts`** — extend imports + the `packs: [...]` array:

```ts
import {
  CreateCodeBlock,
  createCodeBlockPluginHandler,
  CreateConnector,
  createConnectorPluginHandler,
  CreateSection,
  createSectionPluginHandler,
  CreateShapeWithText,
  createShapeWithTextPluginHandler,
  CreateSticky,
  createStickyPluginHandler,
  CreateTable,
  createTablePluginHandler,
  ListSectionChildren,
  listSectionChildrenPluginHandler,
  MoveIntoSection,
  moveIntoSectionPluginHandler,
  SetSectionName,
  setSectionNamePluginHandler,
  SetStickyContent,
  setStickyContentPluginHandler,
} from "@repo/tools-figjam";

// inside Daemon.start({ packs: [...] }), after the tools-design entry:
{
  name: "tools-figjam",
  tools: [
    CreateSticky, CreateSection, CreateConnector, CreateCodeBlock,
    CreateShapeWithText, CreateTable, SetStickyContent, SetSectionName,
    MoveIntoSection, ListSectionChildren,
  ],
  registerPlugin: (reg) => {
    reg.register(CreateSticky, createStickyPluginHandler);
    reg.register(CreateSection, createSectionPluginHandler);
    reg.register(CreateConnector, createConnectorPluginHandler);
    reg.register(CreateCodeBlock, createCodeBlockPluginHandler);
    reg.register(CreateShapeWithText, createShapeWithTextPluginHandler);
    reg.register(CreateTable, createTablePluginHandler);
    reg.register(SetStickyContent, setStickyContentPluginHandler);
    reg.register(SetSectionName, setSectionNamePluginHandler);
    reg.register(MoveIntoSection, moveIntoSectionPluginHandler);
    reg.register(ListSectionChildren, listSectionChildrenPluginHandler);
  },
},
```

Extend the shim's `tools: [...]` list:

```ts
const shim = await createStdioShim({
  socketPath: startup.socketPath,
  sourceClientId: `shim-${process.pid}`,
  tools: [
    // …existing 23 tools…
    CreateSticky,
    CreateSection,
    CreateConnector,
    CreateCodeBlock,
    CreateShapeWithText,
    CreateTable,
    SetStickyContent,
    SetSectionName,
    MoveIntoSection,
    ListSectionChildren,
  ],
  mcpServerInfo: { name: "figma-mcp", version: VERSION },
});
```

**Step 4: Wire into the bridge plugin** — `apps/bridge-plugin/src/plugin.ts`

```ts
import {
  CreateCodeBlock, createCodeBlockPluginHandler,
  CreateConnector, createConnectorPluginHandler,
  CreateSection, createSectionPluginHandler,
  CreateShapeWithText, createShapeWithTextPluginHandler,
  CreateSticky, createStickyPluginHandler,
  CreateTable, createTablePluginHandler,
  ListSectionChildren, listSectionChildrenPluginHandler,
  MoveIntoSection, moveIntoSectionPluginHandler,
  SetSectionName, setSectionNamePluginHandler,
  SetStickyContent, setStickyContentPluginHandler,
} from "@repo/tools-figjam";

// inside start(), after the tools-design register() calls:
runtime.register(CreateSticky, createStickyPluginHandler);
runtime.register(CreateSection, createSectionPluginHandler);
runtime.register(CreateConnector, createConnectorPluginHandler);
runtime.register(CreateCodeBlock, createCodeBlockPluginHandler);
runtime.register(CreateShapeWithText, createShapeWithTextPluginHandler);
runtime.register(CreateTable, createTablePluginHandler);
runtime.register(SetStickyContent, setStickyContentPluginHandler);
runtime.register(SetSectionName, setSectionNamePluginHandler);
runtime.register(MoveIntoSection, moveIntoSectionPluginHandler);
runtime.register(ListSectionChildren, listSectionChildrenPluginHandler);
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/mcp-server test e2e-phase10-catalog
bun run --filter @repo/mcp-server test
bun run --filter @repo/bridge-plugin test
git add apps/mcp-server/src/main.ts apps/mcp-server/src/__tests__/e2e-phase10-catalog.test.ts apps/mcp-server/package.json apps/bridge-plugin/src/plugin.ts apps/bridge-plugin/package.json bun.lock
git commit -m "feat(mcp-server): register tools-figjam pack"
```

---

## Task 10.10: Real-Figma figjam fixture stub (skipped by default)

**Goal:** Track the gap. Phase 9's `real-figma.golden.test.ts` round-trips a Design file via `/v1/files/<key>?depth=1` against a recorded fixture. FigJam files don't expose a comparable read endpoint that surfaces sticky/section/connector node-level structure — the REST API's FigJam coverage is significantly thinner than its Design coverage.

We ship a **skipped** golden test now so:
1. The shape of a future FigJam smoke harness is documented inline.
2. CI does not fail on Phase 10 merge (the test is `it.skip`).
3. A follow-up phase can either (a) record against `/v1/files/<key>/nodes?ids=<sticky-id>` for individual nodes, (b) introduce a plugin-driven recorder that captures FigJam state via a side channel, or (c) accept that the FigJam plugin tooling is exercised entirely through unit tests against `FigmaFake`.

**Files:**

- Create: `apps/mcp-server/src/__tests__/real-figma-figjam.golden.test.ts`

**Step 1: Implement the stub**

```ts
// apps/mcp-server/src/__tests__/real-figma-figjam.golden.test.ts
import { describe, it } from "vitest";

// TODO(phase 11+): Promote this to an active golden test once we settle
// on a FigJam read strategy. Options:
//
//   A) /v1/files/<key>/nodes?ids=<sticky-id> — works for individual nodes
//      but requires us to know the ids in advance, defeating the
//      "structural roundtrip" purpose Phase 9 used for design files.
//
//   B) Plugin-driven recorder — the bridge plugin captures the FigJam
//      page's structure via figma.currentPage.children and serializes
//      to a fixture. Requires a paired daemon+plugin during recording.
//
//   C) Accept that FigJam coverage is FigmaFake-only. The 10.3-10.7 unit
//      tests + the 10.11 mismatch e2e test cover correctness; the
//      manual smoke is "open the bridge plugin in a real FigJam file
//      and verify nothing throws."
//
// FIGMA_API_KEY is not relevant here yet — kept skipped unconditionally.
describe.skip("real-figma figjam golden", () => {
  it("recorded sticky/section/connector structure round-trips", () => {
    // Placeholder. See TODO above.
  });
});
```

**Step 2: Verify, commit**

```bash
bun run --filter @repo/mcp-server test real-figma-figjam.golden
# → "0 tests, 1 skipped" — passes vacuously.
git add apps/mcp-server/src/__tests__/real-figma-figjam.golden.test.ts
git commit -m "test(mcp-server): add skipped real-figma figjam golden stub"
```

> Documenting why this is NOT a hard requirement is part of the task. The "Notes on Execution" section reiterates this and the changeset (Task 10.12) calls it out as out-of-scope-but-tracked.

---

## Task 10.11: Editor-type-mismatch wire-level e2e test

**Goal:** A focused wire-level test that proves the discriminator works end-to-end. The bridge plugin reports `editorType === "figma"`; calling a figjam tool from the MCP shim returns `E_FIGMA_EDITOR_TYPE_MISMATCH` from the plugin handler.

**Files:**

- Create: `apps/mcp-server/src/__tests__/e2e-figjam-mismatch.test.ts`

**Step 1: Implement the test**

Pattern matches `e2e.test.ts` — spawn a daemon + shim with an in-memory `FigmaFake({editorType: "figma"})`, register the figjam pack, send a `tools/call` for `create_sticky`, assert the error message contains the discriminator code.

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import {
  CreateSticky,
  createStickyPluginHandler,
} from "@repo/tools-figjam";
import { describe, expect, it } from "vitest";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";

describe("FigJam editor-type mismatch", () => {
  it("returns E_FIGMA_EDITOR_TYPE_MISMATCH when called on a Figma editor", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-fj-"));
    const socketPath = join(dir, "daemon.sock");

    const figma = new FigmaFake({ editorType: "figma" });

    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0,
      version: "0.0.0",
      figma,
      packs: [
        {
          name: "tools-figjam",
          tools: [CreateSticky],
          registerPlugin: (reg) => {
            reg.register(CreateSticky, createStickyPluginHandler);
          },
        },
      ],
    });

    try {
      const shim = await createStdioShim({
        socketPath,
        sourceClientId: "shim-fj-test",
        tools: [CreateSticky],
        mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
      });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await shim.connectMcp(serverTransport);
      const client = new Client({ name: "test-client", version: "0.0.0" });
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "create_sticky",
        arguments: { content: "this should fail" },
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
      expect(text).toContain("create_sticky");
    } finally {
      await daemon.stop();
    }
  });
});
```

**Step 2: Verify, commit**

```bash
bun run --filter @repo/mcp-server test e2e-figjam-mismatch
git add apps/mcp-server/src/__tests__/e2e-figjam-mismatch.test.ts
git commit -m "test(mcp-server): wire-level figjam editor-type mismatch e2e"
```

> If the existing daemon plumbing doesn't surface the underlying error message verbatim (e.g. it wraps everything in a generic `E_FIGMA_UNKNOWN`), update the test to assert against the wrapper code AND check the structured `error.data` payload for the inner message. The point is to prove the discriminator reaches the wire — the exact serialization is implementation-detail.

---

## Task 10.12: Coverage gate + Phase 10 changeset + acceptance

**Files:**

- Verify `packages/tools-figjam/vitest.config.ts` thresholds (≥90/85/90/90)
- Verify `packages/figma-adapter/vitest.config.ts` thresholds (≥90/85/90/90)
- Create: `.changeset/phase-10-tools-figjam.md`

**Step 1: Per-pack coverage**

```bash
bun run --filter @repo/tools-figjam test --coverage
bun run --filter @repo/figma-adapter test --coverage
```

Each command must pass with no threshold violations. If a sub-area dips below the bar, add table-driven tests for the missing branches. Do NOT lower thresholds.

**Step 2: Root acceptance**

```bash
bun run lint
bun run types
bun run test
```

All green.

**Step 3: Changeset** — `.changeset/phase-10-tools-figjam.md`

```markdown
---
"@bromso/figma-mcp": minor
"@repo/tools-figjam": minor
"@repo/figma-adapter": minor
---

Phase 10: tools-figjam pack.

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
```

**Step 4: Commit**

```bash
git add .changeset/phase-10-tools-figjam.md
git commit -m "chore(changeset): record Phase 10 tools-figjam"
```

**Step 5: Final acceptance pass**

```bash
bun run lint && bun run types && bun run test
git log master..HEAD --oneline
```

**Phase 10 done.** The FigJam tool pack is wired through both runtimes; the registry now exposes ~33 tools; editor-type mismatches surface a clear discriminator on the wire.

---

## Notes on Execution

**Why the editor-type discriminator lives in the tool handler, not the adapter.** Adapter methods are the testable seam — keeping them editor-agnostic means a unit test of `FigmaFake.createSticky()` works regardless of whether the surrounding `editorType` is `"figjam"` or unset. If the adapter itself enforced the discriminator, every adapter test would need to first call `__setEditorType("figjam")`, and downstream callers (e.g. a future `tools-slides` pack that might want to cross-edit FigJam content under specific circumstances) would have no escape hatch. The discriminator's job is "is this tool callable in the current editor?"; that's a tool-level concern, not an adapter-level one.

**Why the FigJam-specific Figma plugin API surface is narrow.** The `@figma/plugin-typings` package exposes FigJam factories (`figma.createSticky`, `figma.createSection`, `figma.createConnector`, `figma.createCodeBlock`, `figma.createShapeWithText`, `figma.createTable`) only when the runtime resolves `editorType === "figjam"`. We don't need a separate type-loading step — the global `figma` is the same object; the methods are simply present-or-absent at runtime. The `RealFigmaAdapter` calls them directly; if the runtime is somehow not FigJam (a plugin that ships in both editors and the discriminator was bypassed), the call would throw a runtime TypeError. The handler-level guard prevents that path entirely.

**Why connectors are validated against the node map.** A FigJam connector is meaningless without two endpoints. Creating one with a phantom id leaves a half-formed `CONNECTOR` node hanging in the document. Both the `FigmaFake` and the `RealFigmaAdapter` validate `startNodeId` and `endNodeId` BEFORE creating the connector — if validation fails, no node is created. This is stricter than Figma's runtime (which would create the connector and just leave the endpoints unbound), but it keeps the wire contract clean: a successful `create_connector` call always produces a usable connector.

**Why we don't expose widget creation.** Figma widgets are a separate runtime — they have their own programming model (props, syncedState, hooks, FigJam's React-like API). Wrapping that in a tool would require modeling widget code as a string, deserializing it server-side, and either eval'ing it (security disaster) or pre-publishing widget bundles (vastly out of scope). If a future phase wants to support widgets, the right approach is a `create_widget_from_published_id` tool that takes a Figma-Community widget id, not arbitrary widget code.

**Why tests use `new FigmaFake({editorType: "figjam"})`.** The default editor type for `FigmaFake` is `"figma"` (set at construction). FigJam tool tests therefore have to pass the option explicitly; this is intentional — accidentally testing on the default would mean every test passes the discriminator guard for the wrong reason. The `figJamCtx()` / `figmaCtx()` helpers in the handler tests make the contrast explicit.

**Why `move_into_section` is idempotent.** A user who calls `move_into_section({sectionId, nodeIds: ["a"]})` twice expects the section to contain `["a"]`, not `["a", "a"]`. The `FigmaFake` enforces dedup; the `RealFigmaAdapter` relies on the runtime's `appendChild` semantics (which already handles re-parenting transparently). Tests assert the dedup behavior explicitly.

**Why `move_into_section` returns a count and `list_section_children` returns nodeIds + count.** These two tools are deliberately asymmetric. `move_into_section` accepts a list of inputs and reports how many were processed (handy for batch operations from an LLM); `list_section_children` is a read tool and the caller almost always wants both the ids AND the count, so we return both rather than forcing a `.length` derivation upstream.

**Why we skip the real-figma figjam golden test.** Phase 9's golden harness fetched `/v1/files/<key>?depth=1` and asserted the document name + page list. The same endpoint on a FigJam file returns a tree where `STICKY`, `SECTION`, etc. nodes are deeply nested under the page's children but the REST API's response shape diverges from the design-file shape in subtle ways (e.g. connector endpoints aren't fully resolved, sticky content is sometimes elided depending on the viewer's permissions). Recording a stable fixture that survives re-runs is harder for FigJam than for Design — and the value is lower because the FigJam tools all run plugin-side anyway. Task 10.10's stub documents the gap; a follow-up phase can promote it once we've built either a plugin-driven recorder or accepted REST-side limitations.

**Why Phase 10's test count is healthy without server-side handlers.** No tool in this pack has a server-handler — every operation requires the FigJam plugin runtime. A future server-side fallback would be a REST-API-backed read tool (e.g. `list_stickies` that fetches via `/v1/files/<key>/nodes` and returns a digest). That's `@repo/tools-rest` territory, separate phase.

**Why the changeset bumps three packages, not five.** `@repo/mcp-server` and `@repo/bridge-plugin` are private workspace packages — they don't get versioned and shipped externally. Their changes are absorbed under the `@bromso/figma-mcp` distribution. (Phase 8's changeset bumped them all because `@repo/tools-console` and `@repo/tools-design` were both freshly published; here only `@repo/tools-figjam` is new.) **Verify:** if the repo's changeset config (`.changeset/config.json`) ignores private packages, drop the explicit bumps; otherwise keep them. The acceptance criteria's "minor for `@bromso/figma-mcp`, `@repo/tools-figjam`, `@repo/figma-adapter`" reflects the public-published surface.

**Coverage thresholds.** Both affected packages (`figma-adapter`, `tools-figjam`) use the same per-pack bar from the master plan: lines/functions/statements ≥90, branches ≥85. Adding 10 methods to `figma-adapter` may push branch coverage if the new error paths aren't all exercised — Task 10.1's failing-test set covers each `not found`, `not section`, `not sticky`, `not paintable` branch. If branch coverage dips, add a table-driven test for the missing case rather than lowering the gate.

**Order-of-execution dependency.** Tasks 10.3–10.7 depend on Task 10.1 (the adapter methods must exist). Task 10.8 depends on 10.3–10.7 (refactor target). Task 10.9 depends on 10.8 (the handlers it imports must be in their final shape). Tasks 10.10 + 10.11 depend on 10.9 (the wire registration is in place). Task 10.12 is last. The task numbering reflects this order.

**No `server-handlers.ts` for this pack.** As with Phase 8's tools-console + tools-design, the FigJam pack is plugin-side only — there's no REST-API-backed alternative implementation, and no server-state for the server side to report. If a follow-up phase needs a server-side fallback (e.g. cloud-mode FigJam read via the REST API), that's where `server-handlers.ts` lands.

---

## Out of scope

- `@repo/tools-slides` — slide creation, transitions, focus tools. Separate phase.
- `@repo/tools-a11y` — audit/lint/annotation tools. Separate phase.
- `@repo/tools-rest` — REST-API-backed read tools (cloud-mode-without-bridge). Separate phase.
- FigJam widgets (`figma.createWidget`, widget props/syncedState/hooks).
- FigJam timer / voting / cursor-chat / audio rooms.
- Multi-board navigation (`figma.root.children` traversal across boards).
- Connector geometry: waypoints, magnet positions, custom paths, midpoint labels, arrow caps.
- Sticky styling beyond `content` and `authorName`: background color, `wideText`, `pinned`, comment threads.
- Code block language enum validation. The `language` field is free-form.
- Section nesting (sections inside sections). The `move_into_section` tool only handles flat membership.
- A `delete_sticky` / `delete_section` / `delete_connector` set — Phase 8's `delete_node` tool already covers these.
- A `clone_section` / `clone_sticky` set — Phase 8's `clone_node` tool covers them.
- Real-figma golden coverage for FigJam files (deferred; Task 10.10 ships a skipped stub).
- The deferred Phase 7 Windows IPC fix (named-pipe path resolution under `\\.\pipe\` on Windows). Tracked separately in `docs/plans/2026-05-06-figma-mcp-phase-7.md`'s "Out of scope".
- The deferred Phase 8 `query_console` regex DoS hardening (catastrophic backtracking guard / size limit on input). Tracked in Phase 8's "Out of scope".
- Telemetry on tool usage / per-tool error rates.
- Tool versioning / deprecation channels. Nothing is removed or renamed in Phase 10.
- Cross-pack integration tests beyond the catalog assertion + the mismatch e2e.

---

## References

- Phase 8 plan (canonical pack pattern): `docs/plans/2026-05-06-figma-mcp-phase-8.md`
- Phase 9 plan (real-figma harness): `docs/plans/2026-05-06-figma-mcp-phase-9.md`
- Phase 7 plan (CLI + diagnostics, Windows IPC follow-up): `docs/plans/2026-05-06-figma-mcp-phase-7.md`
- Phase 3 plan (canonical extract pack): `docs/plans/2026-05-06-figma-mcp-phase-3.md`
- Phase 2 plan (transport + figma-adapter): `docs/plans/2026-05-06-figma-mcp-phase-2.md`
- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md`
- Roadmap: `docs/plans/2026-05-06-figma-mcp-rewrite-plan.md` (Phase 10 high-level scope)
- Canonical pack: `packages/tools-design/src/{tools,plugin-handlers,index}.ts`
- Adapter contract: `packages/figma-adapter/src/adapter.ts`
- In-memory test double: `packages/figma-adapter/src/figma-fake.ts`
- Production adapter: `packages/figma-adapter/src/real-figma-adapter.ts`
- Bridge plugin runtime: `apps/bridge-plugin/src/runtime.ts`
- Bridge plugin entry: `apps/bridge-plugin/src/plugin.ts`
- mcp-server entry: `apps/mcp-server/src/main.ts`
- Protocol primitives: `packages/protocol/src/tools.ts` (`defineTool`, `PluginHandler`, `Pack`)
- Figma plugin API for figjam: <https://www.figma.com/plugin-docs/api/figjam/> (StickyNode, SectionNode, ConnectorNode, CodeBlockNode, ShapeWithTextNode, TableNode reference)
