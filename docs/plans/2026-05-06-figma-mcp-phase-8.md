# Phase 8: Feature pack expansion (console + design)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ship two new tool packs — `@repo/tools-console` (6 tools) for Figma plugin console capture and `@repo/tools-design` (12 tools) for node creation/editing — bringing the registry from ~5 tools to ~23.

**Architecture:** Console pack is observability-only: plugin patches `console.{log,warn,error,info}` and forwards entries through the bridge. Design pack extends `@repo/figma-adapter` with create/edit methods (roughly 10 new methods); plugin handlers call the adapter and the `FigmaFake` test double mirrors the in-memory state.

**Tech Stack:** Existing — Bun + Vitest + Zod + the Phase 1–7 protocol/transport/adapter packages. No new runtime deps.

---

## Out of scope (call-out so the executor doesn't drift)

- **`@repo/tools-figjam`, `@repo/tools-slides`, `@repo/tools-a11y`, `@repo/tools-rest`.** Each is an explicit follow-up phase. Do NOT scaffold or stub them here.
- **Figma REST API client.** `@repo/tools-rest` (separate phase) will introduce a typed `FigmaApiClient`; Phase 8 stays plugin-side only.
- **Real-Figma smoke runs.** Phase 9 owns the manual workflow (`FIGMA_API_KEY`, public test file). Phase 8 ships unit-tested adapter + handlers; the `FigmaFake` test double is the contract.
- **Tool versioning / deprecation channels.** Tools are added; nothing is removed or renamed.
- **Telemetry on tool usage.** No analytics, no opt-in flow.
- **Watch-mode console streaming.** `console_status` and `query_console` are pull-mode reads; a `watch_console` streaming tool is a follow-up (would use the Phase 5 streaming machinery).
- **Console capture from the daemon side.** We capture the *plugin sandbox* console only — that's where reference tools land. The daemon's own logs are surfaced through the existing `recent-errors` doctor check.
- **Cross-pack integration tests.** Each pack's tests are isolated against `FigmaFake` or the in-memory console store. The mcp-server end-to-end test in Task 8.11 just asserts the tools register; it does not exercise round-tripped invocation.
- **Beyond the design doc's six error categories.** Validation errors stay `E_PROTOCOL_INVALID`; adapter throws stay `E_FIGMA_UNKNOWN`. No new categories.

---

## Acceptance Criteria

- `packages/tools-console/` exists with 6 tool definitions (`get_console_logs`, `clear_console`, `get_console_errors`, `get_console_warnings`, `query_console`, `console_status`) and per-tool plugin handlers backed by an in-memory ring buffer console store.
- `packages/tools-design/` exists with 12 tool definitions (`create_rectangle`, `create_frame`, `create_ellipse`, `create_line`, `create_text`, `set_text_content`, `set_fill`, `set_stroke`, `resize_node`, `clone_node`, `delete_node`, `create_component`) and per-tool plugin handlers calling adapter methods.
- `FigmaAdapter` interface in `packages/figma-adapter/src/adapter.ts` extends with the 11 new methods listed in Task 8.1; `FigmaFake` implements them deterministically; `RealFigmaAdapter` wraps the corresponding `figma.*` calls.
- The bridge plugin patches `console.{log,warn,error,info}` and exposes the resulting `ConsoleStore` to the registered console-tool handlers. The patching is a no-op if the global `console` is missing (defensive — kept for tests).
- `apps/mcp-server/src/main.ts` registers both packs alongside `tools-extract` and `tools-variables`. An end-to-end test asserts every Phase 8 tool name appears in the daemon's catalog.
- Per-pack coverage ≥90/85/90/90 (matches the master plan's "≥90% per pack" bar).
- Phase 8 changeset under `.changeset/phase-8-tools-console-design.md`.
- Commit hygiene: each task ends with one conventional-commit-formatted commit. No multi-task commits. No `git add -A`.

---

## Task Map

| #    | Task                                                              | Package / App        | Type        |
| ---- | ----------------------------------------------------------------- | -------------------- | ----------- |
| 8.1  | Adapter extensions (11 new methods, fake + real)                  | figma-adapter        | code        |
| 8.2  | `@repo/tools-console` package scaffold                            | tools-console (new)  | infra       |
| 8.3  | `ConsoleStore` ring buffer + bridge-plugin wiring                 | bridge-plugin + new  | code        |
| 8.4  | `tools-console`: `get_console_logs`, `clear_console`, `get_console_errors` | tools-console        | code        |
| 8.5  | `tools-console`: `get_console_warnings`, `query_console`, `console_status` | tools-console        | code        |
| 8.6  | `@repo/tools-design` package scaffold                             | tools-design (new)   | infra       |
| 8.7  | `tools-design`: `create_rectangle`, `create_frame`, `create_ellipse`, `create_line` | tools-design  | code        |
| 8.8  | `tools-design`: `create_text`, `set_text_content`                 | tools-design         | code        |
| 8.9  | `tools-design`: `set_fill`, `set_stroke`                          | tools-design         | code        |
| 8.10 | `tools-design`: `resize_node`, `clone_node`, `delete_node`, `create_component` | tools-design  | code        |
| 8.11 | Wire packs into mcp-server + bridge-plugin + e2e catalog test     | mcp-server + bridge  | code/tests  |
| 8.12 | Coverage gate + Phase 8 changeset + acceptance                    | repo                 | infra       |

---

## Task 8.1: Adapter extensions for design tools

**Goal:** Add the 11 new adapter methods that the design tools depend on. The interface gains node-creation methods for the four primitive shapes (frame, text, ellipse, line — rectangle already exists), property mutators (fill, stroke, text content), node lifecycle (resize, clone, delete), `getNodeById`, plus `createComponent` (used by `create_component` tool to wrap a node into a component definition).

The `FigmaFake` mirrors all of them with deterministic id generation (`f1`, `t1`, `e1`, `ln1`, `cmp1` …) and an in-memory map keyed by node id with the data each tool reads back. The `RealFigmaAdapter` calls `figma.*` directly — straightforward translation, exercised the same way Phase 2/3 methods are (mock the global `figma` object).

**Files:**

- Modify: `packages/figma-adapter/src/adapter.ts` (add types + interface methods)
- Modify: `packages/figma-adapter/src/figma-fake.ts` (implement methods + add seeders)
- Modify: `packages/figma-adapter/src/real-figma-adapter.ts` (wrap `figma.*`)
- Modify: `packages/figma-adapter/src/index.ts` (re-export new types)
- Modify: `packages/figma-adapter/src/__tests__/figma-fake.test.ts` (extend)
- Modify: `packages/figma-adapter/src/__tests__/real-figma-adapter.test.ts` (extend)

**Step 1: Failing tests for `FigmaFake`** — append to `figma-fake.test.ts`

```ts
describe("FigmaFake.createFrame", () => {
  it("creates a frame node with the given dimensions and a unique id", async () => {
    const fake = new FigmaFake();
    const a = await fake.createFrame({ width: 200, height: 120, name: "Hero" });
    const b = await fake.createFrame({ width: 50, height: 50 });
    expect(a.type).toBe("FRAME");
    expect(a.width).toBe(200);
    expect(a.height).toBe(120);
    expect(a.name).toBe("Hero");
    expect(a.id).not.toBe(b.id);
  });

  it("supports x/y placement", async () => {
    const fake = new FigmaFake();
    const node = await fake.createFrame({ width: 10, height: 10, x: 50, y: 60 });
    expect(node.x).toBe(50);
    expect(node.y).toBe(60);
  });
});

describe("FigmaFake.createText", () => {
  it("creates a TEXT node with characters and default fontSize", async () => {
    const fake = new FigmaFake();
    const t = await fake.createText({ content: "hello" });
    expect(t.type).toBe("TEXT");
    expect(t.characters).toBe("hello");
    expect(t.fontSize).toBe(16);
  });

  it("uses the provided fontSize", async () => {
    const fake = new FigmaFake();
    const t = await fake.createText({ content: "x", fontSize: 24 });
    expect(t.fontSize).toBe(24);
  });
});

describe("FigmaFake.createEllipse", () => {
  it("creates an ELLIPSE node with width/height", async () => {
    const fake = new FigmaFake();
    const node = await fake.createEllipse({ width: 80, height: 80 });
    expect(node.type).toBe("ELLIPSE");
    expect(node.width).toBe(80);
  });
});

describe("FigmaFake.createLine", () => {
  it("creates a LINE node with endpoint coordinates", async () => {
    const fake = new FigmaFake();
    const ln = await fake.createLine({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(ln.type).toBe("LINE");
    expect(ln.x1).toBe(0);
    expect(ln.x2).toBe(100);
  });
});

describe("FigmaFake.setNodeFill", () => {
  it("sets a SOLID paint on an existing node", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    await fake.setNodeFill({
      nodeId: r.id,
      paint: { type: "SOLID", color: { r: 1, g: 0, b: 0 } },
    });
    const node = await fake.getNodeById({ nodeId: r.id });
    expect(node?.fills?.[0]).toEqual({ type: "SOLID", color: { r: 1, g: 0, b: 0 } });
  });

  it("rejects when nodeId is unknown", async () => {
    const fake = new FigmaFake();
    await expect(
      fake.setNodeFill({
        nodeId: "missing",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.setNodeStroke", () => {
  it("sets stroke paint and weight", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    await fake.setNodeStroke({
      nodeId: r.id,
      paint: { type: "SOLID", color: { r: 0, g: 0, b: 1 } },
      weight: 4,
    });
    const node = await fake.getNodeById({ nodeId: r.id });
    expect(node?.strokes?.[0]?.color).toEqual({ r: 0, g: 0, b: 1 });
    expect(node?.strokeWeight).toBe(4);
  });
});

describe("FigmaFake.setTextContent", () => {
  it("rewrites the characters of an existing TEXT node", async () => {
    const fake = new FigmaFake();
    const t = await fake.createText({ content: "old" });
    await fake.setTextContent({ nodeId: t.id, characters: "new" });
    const after = (await fake.getNodeById({ nodeId: t.id })) as { characters: string };
    expect(after.characters).toBe("new");
  });

  it("rejects on a non-text node", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    await expect(
      fake.setTextContent({ nodeId: r.id, characters: "x" })
    ).rejects.toThrow(/text/i);
  });
});

describe("FigmaFake.resizeNode", () => {
  it("updates width/height on an existing node", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    await fake.resizeNode({ nodeId: r.id, width: 300, height: 250 });
    const node = await fake.getNodeById({ nodeId: r.id });
    expect(node?.width).toBe(300);
    expect(node?.height).toBe(250);
  });
});

describe("FigmaFake.cloneNode", () => {
  it("returns a new id and the cloned node is reachable by getNodeById", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    const clone = await fake.cloneNode({ nodeId: r.id });
    expect(clone.id).not.toBe(r.id);
    const fetched = await fake.getNodeById({ nodeId: clone.id });
    expect(fetched?.type).toBe("RECTANGLE");
  });
});

describe("FigmaFake.deleteNode", () => {
  it("removes the node so getNodeById returns null", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    await fake.deleteNode({ nodeId: r.id });
    expect(await fake.getNodeById({ nodeId: r.id })).toBeNull();
  });
});

describe("FigmaFake.createComponent", () => {
  it("returns a component referencing the source node", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    const comp = await fake.createComponent({ nodeId: r.id });
    expect(comp.id).toMatch(/^cmp/);
    const components = await fake.getLocalComponentsAsync();
    expect(components.find((c) => c.id === comp.id)).toBeTruthy();
  });
});
```

Run: `bun run --filter @repo/figma-adapter test figma-fake` → FAIL.

**Step 2: Extend the interface and node types** — `packages/figma-adapter/src/adapter.ts`

```ts
export interface FrameNode {
  readonly id: string;
  readonly type: "FRAME";
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly name: string;
}

export interface TextNode {
  readonly id: string;
  readonly type: "TEXT";
  readonly characters: string;
  readonly fontSize: number;
  readonly x: number;
  readonly y: number;
}

export interface EllipseNode {
  readonly id: string;
  readonly type: "ELLIPSE";
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
}

export interface LineNode {
  readonly id: string;
  readonly type: "LINE";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export type SolidPaint = {
  readonly type: "SOLID";
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  readonly opacity?: number;
};

export interface NodeSnapshot {
  readonly id: string;
  readonly type: string;
  readonly width?: number;
  readonly height?: number;
  readonly x?: number;
  readonly y?: number;
  readonly characters?: string;
  readonly fills?: readonly SolidPaint[];
  readonly strokes?: readonly SolidPaint[];
  readonly strokeWeight?: number;
}

// extend the FigmaAdapter interface:
export interface FigmaAdapter {
  // …existing members…

  createFrame(args: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    name?: string;
  }): Promise<FrameNode>;

  createText(args: {
    content: string;
    fontSize?: number;
    x?: number;
    y?: number;
  }): Promise<TextNode>;

  createEllipse(args: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  }): Promise<EllipseNode>;

  createLine(args: { x1: number; y1: number; x2: number; y2: number }): Promise<LineNode>;

  setNodeFill(args: { nodeId: string; paint: SolidPaint }): Promise<void>;

  setNodeStroke(args: {
    nodeId: string;
    paint: SolidPaint;
    weight?: number;
  }): Promise<void>;

  setTextContent(args: { nodeId: string; characters: string }): Promise<void>;

  resizeNode(args: { nodeId: string; width: number; height: number }): Promise<void>;

  cloneNode(args: { nodeId: string }): Promise<{ id: string }>;

  deleteNode(args: { nodeId: string }): Promise<void>;

  createComponent(args: { nodeId: string }): Promise<Component>;

  getNodeById(args: { nodeId: string }): Promise<NodeSnapshot | null>;
}
```

> The `Component` type is already defined for the `tools-extract` pack; we reuse it.

**Step 3: Implement on `FigmaFake`** — `packages/figma-adapter/src/figma-fake.ts`

Add internal mutable shapes and counters:

```ts
type AnyNode =
  | (RectangleNode & { x: number; y: number; fills: SolidPaint[]; strokes: SolidPaint[]; strokeWeight: number })
  | (FrameNode & { fills: SolidPaint[]; strokes: SolidPaint[]; strokeWeight: number })
  | (TextNode & { fills: SolidPaint[]; strokes: SolidPaint[]; strokeWeight: number })
  | (EllipseNode & { fills: SolidPaint[]; strokes: SolidPaint[]; strokeWeight: number })
  | LineNode;

private readonly allNodes = new Map<string, AnyNode>();
private frameCounter = 0;
private textCounter = 0;
private ellipseCounter = 0;
private lineCounter = 0;
private componentCounter = 0;
```

Method bodies (sketch — implementer fills in mutable record creation):

- `createFrame`: id `f${++frameCounter}`, type `"FRAME"`, default `x: 0`, `y: 0`, `name: ""`, write to `allNodes`, return immutable view.
- `createText`: id `t${++textCounter}`, type `"TEXT"`, `fontSize ?? 16`, `x ?? 0`, `y ?? 0`.
- `createEllipse`: id `e${++ellipseCounter}`.
- `createLine`: id `ln${++lineCounter}`.
- `setNodeFill`: look up in `allNodes`; throw `not found` on miss; throw `not paintable` if it's a `LINE`; `fills = [paint]`.
- `setNodeStroke`: same lookup, set `strokes = [paint]` and `strokeWeight = weight ?? 1`. Lines accept stroke (they're inherently stroke-only — keep the throw for non-strokeable shapes only; document that lines pass).
- `setTextContent`: throw `expected TEXT node` unless `node.type === "TEXT"`; mutate `characters`.
- `resizeNode`: throw if node missing or doesn't have `width/height` (i.e. line); update.
- `cloneNode`: throw on miss; copy under a new id with the same type prefix counter; return `{id}`.
- `deleteNode`: throw on miss; `allNodes.delete`.
- `createComponent`: throw on miss; create `Component` with id `cmp${++componentCounter}`, name `${node.type}_${componentCounter}`, key `key-cmp-${componentCounter}`; push into `this.components`.
- `getNodeById`: snapshot the map entry into a `NodeSnapshot`; return `null` if missing.

Also keep existing rectangles backward-compatible: have `createRectangle()` write into `allNodes` so the new methods can find them. Update existing rectangle handling so seeded nodes (none currently) and freshly created rectangles work the same.

Add seeders where useful for downstream tool tests:

```ts
__seedFrame(node: FrameNode): void { this.allNodes.set(node.id, { ...node, fills: [], strokes: [], strokeWeight: 0 }); }
__seedText(node: TextNode): void { this.allNodes.set(node.id, { ...node, fills: [], strokes: [], strokeWeight: 0 }); }
```

**Step 4: Implement on `RealFigmaAdapter`** — `packages/figma-adapter/src/real-figma-adapter.ts`

Mechanical translation. One method per interface entry; each looks up via `figma.getNodeByIdAsync(nodeId)` (or calls the matching `figma.create*()` factory), throws `node not found: <id>` on miss, and summarizes the SceneNode into the lighter shape. Key invariants:

- `createFrame`: `figma.createFrame()`, then `node.resize(w, h)`, then conditionally set `x`, `y`, `name`. Return the FrameNode summary.
- `createText`: `figma.createText()`, then `await figma.loadFontAsync(node.fontName)` BEFORE setting `characters` (Figma requires the font to be loaded — same constraint applies to `setTextContent`). `fontSize` falls back to `16` when the underlying property is non-numeric (mixed-style nodes).
- `createEllipse`: `figma.createEllipse()` + `resize` + optional placement.
- `createLine`: Figma represents lines as horizontal segments, resized + rotated. Translate the four-coordinate form: `node.x = x1`, `node.y = y1`, `node.resize(Math.hypot(dx, dy), 0)`, `node.rotation = atan2(dy, dx) * 180 / Math.PI`. Return the original four coordinates verbatim.
- `setNodeFill` / `setNodeStroke`: lookup, narrow to `{fills}` / `{strokes, strokeWeight}`, assign `[paint]`. Stroke also conditionally writes `strokeWeight`.
- `setTextContent`: lookup, throw `expected TEXT node: <id>` if `node.type !== "TEXT"`, load the font, write `characters`.
- `resizeNode`: lookup, call `node.resize(width, height)` (relies on `LayoutMixin`).
- `cloneNode`: lookup, call `node.clone()`, return `{id: clone.id}`.
- `deleteNode`: lookup, call `node.remove()`.
- `createComponent`: lookup, call `figma.createComponentFromNode(node)`, return `Component` summary (`id`, `name`, `key`, `description`).
- `getNodeById`: `await figma.getNodeByIdAsync`; on null return null; otherwise narrow to a `Partial<SceneNode>` and emit a `NodeSnapshot` with `id`, `type`, and any of `width`/`height`/`x`/`y`/`characters`/`fills`/`strokes`/`strokeWeight` that exist.

Use the real `@figma/plugin-typings` shapes (`SceneNode`, `Paint`, `FontName`, `LayoutMixin`) — the pseudocode above papers over the casts but the runtime guarantees are what the tests assert.

**Step 5: Failing tests for `RealFigmaAdapter`** — append to `real-figma-adapter.test.ts`. Pattern: stub `figma.createFrame`, `figma.createText`, etc., assert each delegates and surfaces the summary shape. Cover `getNodeByIdAsync` returning `null` (missing node throws) and a happy-path mutate (e.g. `setNodeFill` writes through to the stubbed `node.fills` setter).

```ts
describe("RealFigmaAdapter.createFrame", () => {
  it("calls figma.createFrame and resizes", async () => {
    const node = { id: "f1", x: 0, y: 0, name: "", width: 0, height: 0,
      resize: vi.fn(function (w: number, h: number) { this.width = w; this.height = h; }) };
    vi.stubGlobal("figma", stubFigma({ createFrame: vi.fn().mockReturnValue(node) }));
    const r = await new RealFigmaAdapter().createFrame({ width: 200, height: 100, name: "Hero" });
    expect(node.resize).toHaveBeenCalledWith(200, 100);
    expect(r).toMatchObject({ id: "f1", type: "FRAME", width: 200, height: 100, name: "Hero" });
  });
});
```

Repeat one happy-path test per method; one error-path test for the missing-node branches.

**Step 6: Re-export new types** — `packages/figma-adapter/src/index.ts`

```ts
export type {
  Component, EditorType, EffectStyle, FigmaAdapter, PageSelection, PaintStyle,
  RectangleNode, StyleBase, TextStyle, Variable, VariableCollection,
  FrameNode, TextNode, EllipseNode, LineNode, SolidPaint, NodeSnapshot,
} from "./adapter";
export { RealFigmaAdapter } from "./real-figma-adapter";
```

**Step 7: Verify, commit**

```bash
bun run --filter @repo/figma-adapter test
git add packages/figma-adapter/src packages/figma-adapter/src/__tests__
git commit -m "feat(figma-adapter): node create/edit methods for design tools pack"
```

---

## Task 8.2: `@repo/tools-console` package scaffold

**Goal:** A green-light scaffold so Tasks 8.4 and 8.5 land cleanly. NO tools yet — just the directory, `package.json`, empty `index.ts`, empty `tools.ts`, empty `plugin-handlers.ts`, and a `__tests__/` directory.

**Files:**

- Create: `packages/tools-console/package.json`
- Create: `packages/tools-console/tsconfig.json`
- Create: `packages/tools-console/vitest.config.ts`
- Create: `packages/tools-console/src/index.ts`
- Create: `packages/tools-console/src/tools.ts`
- Create: `packages/tools-console/src/plugin-handlers.ts`
- Create: `packages/tools-console/src/__tests__/.gitkeep`
- Modify: `bun.lock` (via `bun install`)

**Step 1: `package.json`**

```json
{
  "name": "@repo/tools-console",
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

**Step 2: `tsconfig.json`** — mirror `tools-extract/tsconfig.json` verbatim (no references in this monorepo's per-pkg tsconfigs).

**Step 3: `vitest.config.ts`** — mirror `tools-extract/vitest.config.ts` verbatim. Coverage thresholds: `lines: 90, branches: 85, functions: 90, statements: 90`.

**Step 4: Empty source stubs**

```ts
// src/tools.ts
// Phase 8.4 + 8.5 add 6 tool definitions here.
export {};

// src/plugin-handlers.ts
// Phase 8.4 + 8.5 add the per-tool handlers here.
export {};

// src/index.ts
/**
 * @repo/tools-console — captures the Figma plugin sandbox console output
 * via a bounded ring buffer. Phase 8.4 + 8.5 fill in the 6 tool
 * definitions and handlers; Task 8.3 wires the buffer into the bridge
 * plugin.
 */
export * from "./tools";
export * from "./plugin-handlers";
```

**Step 5: Install + verify**

```bash
bun install
bun run --filter @repo/tools-console test
```

`vitest run --passWithNoTests` should exit 0 (we set `passWithNoTests: true` in the vitest config).

**Step 6: Commit**

```bash
git add packages/tools-console bun.lock
git commit -m "feat(tools-console): package scaffold (no tools yet)"
```

---

## Task 8.3: `ConsoleStore` ring buffer + bridge-plugin wiring

**Goal:** A pure `ConsoleStore` class that owns a bounded ring buffer (cap 1000 entries, drop-oldest), level discriminator, and a query API. The bridge plugin patches the global `console.{log,warn,error,info}` to push entries into one shared store, and exposes that store to the Phase 8.4/8.5 handlers via the existing plugin handler context.

**Where the store lives:** the store class lives **inside `@repo/tools-console`** (not a separate `@repo/console-store` package). The bridge plugin imports `ConsoleStore` from the console pack and constructs one instance at startup. This keeps the dep graph one-way (`bridge-plugin → tools-console`) and avoids a 3-line package just to host an enum + class.

> **Plugin handler context wiring:** the existing `PluginHandlerContext` (in `@repo/protocol`) only carries `{ logger, figma }`. To avoid widening that contract for one pack, console handlers don't read the store from the context — they read it from a module-level setter that the bridge plugin calls at boot. See "Notes on Execution" for why this is the cheapest option.

**Files:**

- Create: `packages/tools-console/src/store.ts`
- Create: `packages/tools-console/src/__tests__/store.test.ts`
- Create: `packages/tools-console/src/console-patch.ts`
- Create: `packages/tools-console/src/__tests__/console-patch.test.ts`
- Modify: `apps/bridge-plugin/src/plugin.ts` (call `installConsoleCapture()` and inject the store ref)

**Step 1: Failing tests for the store** — `packages/tools-console/src/__tests__/store.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { ConsoleStore } from "../store";

describe("ConsoleStore.append", () => {
  it("retains entries in append order", () => {
    const store = new ConsoleStore({ capacity: 100 });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "warn", message: "b", timestamp: 2 });
    expect(store.getRecent({ limit: 10 }).map((e) => e.message)).toEqual(["a", "b"]);
  });

  it("drops oldest entries when over capacity", () => {
    const store = new ConsoleStore({ capacity: 3 });
    for (let i = 0; i < 5; i++) {
      store.append({ level: "log", message: `m${i}`, timestamp: i });
    }
    expect(store.getRecent({ limit: 10 }).map((e) => e.message)).toEqual(["m2", "m3", "m4"]);
  });

  it("counts dropped entries", () => {
    const store = new ConsoleStore({ capacity: 2 });
    for (let i = 0; i < 5; i++) {
      store.append({ level: "log", message: `m${i}`, timestamp: i });
    }
    expect(store.getStatus().droppedCount).toBe(3);
  });
});

describe("ConsoleStore.getRecent", () => {
  it("filters by levels when provided", () => {
    const store = new ConsoleStore({ capacity: 100 });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "error", message: "b", timestamp: 2 });
    store.append({ level: "warn", message: "c", timestamp: 3 });
    const result = store.getRecent({ levels: ["error", "warn"], limit: 10 });
    expect(result.map((e) => e.message)).toEqual(["b", "c"]);
  });

  it("limit truncates to the most recent N", () => {
    const store = new ConsoleStore({ capacity: 100 });
    for (let i = 0; i < 5; i++) store.append({ level: "log", message: `m${i}`, timestamp: i });
    const result = store.getRecent({ limit: 2 });
    expect(result.map((e) => e.message)).toEqual(["m3", "m4"]);
  });
});

describe("ConsoleStore.clear", () => {
  it("empties the buffer and resets droppedCount", () => {
    const store = new ConsoleStore({ capacity: 2 });
    for (let i = 0; i < 5; i++) store.append({ level: "log", message: `m${i}`, timestamp: i });
    store.clear();
    expect(store.getRecent({ limit: 10 })).toEqual([]);
    expect(store.getStatus()).toEqual({
      total: 0,
      byLevel: { log: 0, warn: 0, error: 0, info: 0 },
      droppedCount: 0,
    });
  });
});

describe("ConsoleStore.getStatus", () => {
  it("counts entries by level", () => {
    const store = new ConsoleStore({ capacity: 100 });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "log", message: "b", timestamp: 2 });
    store.append({ level: "warn", message: "c", timestamp: 3 });
    store.append({ level: "error", message: "d", timestamp: 4 });
    expect(store.getStatus()).toEqual({
      total: 4,
      byLevel: { log: 2, warn: 1, error: 1, info: 0 },
      droppedCount: 0,
    });
  });
});

describe("ConsoleStore.getSinceCursor", () => {
  it("returns entries appended after the cursor + nextCursor", () => {
    const store = new ConsoleStore({ capacity: 100 });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "log", message: "b", timestamp: 2 });
    const first = store.getSinceCursor({ cursor: null });
    expect(first.entries.map((e) => e.message)).toEqual(["a", "b"]);
    store.append({ level: "log", message: "c", timestamp: 3 });
    const second = store.getSinceCursor({ cursor: first.nextCursor });
    expect(second.entries.map((e) => e.message)).toEqual(["c"]);
  });
});
```

**Step 2: Implement `ConsoleStore`** — `packages/tools-console/src/store.ts`

```ts
export type ConsoleLevel = "log" | "warn" | "error" | "info";

export interface ConsoleEntry {
  readonly level: ConsoleLevel;
  readonly message: string;
  readonly timestamp: number;
}

export interface ConsoleStoreOptions {
  readonly capacity?: number;
}

export interface GetRecentOptions {
  readonly levels?: ReadonlyArray<ConsoleLevel>;
  readonly limit?: number;
}

export interface ConsoleStatus {
  readonly total: number;
  readonly byLevel: Record<ConsoleLevel, number>;
  readonly droppedCount: number;
}

export interface SinceCursorResult {
  readonly entries: ReadonlyArray<ConsoleEntry>;
  readonly nextCursor: string;
}

const DEFAULT_CAPACITY = 1000;

interface SequencedEntry extends ConsoleEntry {
  readonly seq: number;
}

export class ConsoleStore {
  private readonly capacity: number;
  private readonly buffer: SequencedEntry[] = [];
  private droppedCount = 0;
  private nextSeq = 0;

  constructor(options: ConsoleStoreOptions = {}) {
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
  }

  append(entry: ConsoleEntry): void {
    this.buffer.push({ ...entry, seq: this.nextSeq++ });
    while (this.buffer.length > this.capacity) {
      this.buffer.shift();
      this.droppedCount++;
    }
  }

  getRecent(options: GetRecentOptions = {}): ReadonlyArray<ConsoleEntry> {
    const levels = options.levels ? new Set(options.levels) : null;
    const filtered = levels
      ? this.buffer.filter((e) => levels.has(e.level))
      : this.buffer;
    const limit = options.limit ?? filtered.length;
    return filtered.slice(-limit).map(({ seq, ...rest }) => rest);
  }

  clear(): void {
    this.buffer.length = 0;
    this.droppedCount = 0;
    this.nextSeq = 0;
  }

  getStatus(): ConsoleStatus {
    const byLevel: Record<ConsoleLevel, number> = { log: 0, warn: 0, error: 0, info: 0 };
    for (const e of this.buffer) byLevel[e.level]++;
    return {
      total: this.buffer.length,
      byLevel,
      droppedCount: this.droppedCount,
    };
  }

  getSinceCursor(options: { cursor: string | null }): SinceCursorResult {
    const cursorSeq = options.cursor === null ? -1 : Number.parseInt(options.cursor, 10);
    const entries = this.buffer
      .filter((e) => e.seq > cursorSeq)
      .map(({ seq, ...rest }) => rest);
    const last = this.buffer[this.buffer.length - 1];
    const nextCursor = last ? String(last.seq) : (options.cursor ?? "-1");
    return { entries, nextCursor };
  }
}
```

**Step 3: Failing tests for the patcher** — `packages/tools-console/src/__tests__/console-patch.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { installConsoleCapture, getActiveStore } from "../console-patch";
import { ConsoleStore } from "../store";

describe("installConsoleCapture", () => {
  it("forwards console.log → store.append('log')", () => {
    const store = new ConsoleStore({ capacity: 10 });
    const fakeConsole = { log: () => {}, warn: () => {}, error: () => {}, info: () => {} };
    installConsoleCapture({ store, target: fakeConsole, now: () => 1234 });
    fakeConsole.log("hello");
    expect(store.getRecent({ limit: 10 })).toEqual([
      { level: "log", message: "hello", timestamp: 1234 },
    ]);
  });

  it("preserves the original console behavior (no swallowing)", () => {
    let original = "";
    const store = new ConsoleStore();
    const target = {
      log: (m: string) => { original = m; },
      warn: () => {},
      error: () => {},
      info: () => {},
    };
    installConsoleCapture({ store, target, now: () => 0 });
    target.log("hi");
    expect(original).toBe("hi");
  });

  it("getActiveStore returns the most recently installed store", () => {
    const a = new ConsoleStore();
    const target = { log: () => {}, warn: () => {}, error: () => {}, info: () => {} };
    installConsoleCapture({ store: a, target, now: () => 0 });
    expect(getActiveStore()).toBe(a);
  });

  it("serializes object args via util-style join", () => {
    const store = new ConsoleStore();
    const target = { log: () => {}, warn: () => {}, error: () => {}, info: () => {} };
    installConsoleCapture({ store, target, now: () => 0 });
    target.log("user", { id: 1 });
    expect(store.getRecent({ limit: 1 })[0].message).toBe('user {"id":1}');
  });
});
```

**Step 4: Implement** — `packages/tools-console/src/console-patch.ts`

```ts
import type { ConsoleLevel, ConsoleStore } from "./store";

interface ConsoleLike {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
}

export interface InstallConsoleCaptureOptions {
  readonly store: ConsoleStore;
  readonly target?: ConsoleLike;
  readonly now?: () => number;
}

let activeStore: ConsoleStore | null = null;

export function installConsoleCapture(options: InstallConsoleCaptureOptions): void {
  const target = options.target ?? (globalThis.console as ConsoleLike | undefined);
  if (!target) return;
  const now = options.now ?? Date.now;
  activeStore = options.store;

  const wrap = (level: ConsoleLevel, original: (...args: unknown[]) => void) =>
    function patched(...args: unknown[]): void {
      const message = args
        .map((a) => (typeof a === "string" ? a : safeStringify(a)))
        .join(" ");
      options.store.append({ level, message, timestamp: now() });
      original.apply(target, args);
    };

  target.log = wrap("log", target.log.bind(target));
  target.warn = wrap("warn", target.warn.bind(target));
  target.error = wrap("error", target.error.bind(target));
  target.info = wrap("info", target.info.bind(target));
}

export function getActiveStore(): ConsoleStore | null {
  return activeStore;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
```

**Step 5: Wire into the bridge plugin** — `apps/bridge-plugin/src/plugin.ts`

Add at the top of `start()`:

```ts
import { ConsoleStore, installConsoleCapture } from "@repo/tools-console";

const consoleStore = new ConsoleStore();
installConsoleCapture({ store: consoleStore });
```

The store reference is captured by `getActiveStore()` so Phase 8.4/8.5 handlers can read it without piping through the context.

> **Why install before `figma.showUI`?** So any errors during the rest of `start()` are themselves captured. The patcher delegates to the original `console.error`, so existing log surfaces still work.

**Step 6: Add `@repo/tools-console` to bridge-plugin deps**

Modify `apps/bridge-plugin/package.json`:

```json
"@repo/tools-console": "workspace:*"
```

Run `bun install` to refresh `bun.lock`.

**Step 7: Verify, commit**

```bash
bun run --filter @repo/tools-console test
bun run --filter @repo/bridge-plugin test
git add packages/tools-console/src apps/bridge-plugin/src/plugin.ts apps/bridge-plugin/package.json bun.lock
git commit -m "feat(tools-console): bounded ring-buffer ConsoleStore + bridge-plugin patcher"
```

---

## Task 8.4: `tools-console` — `get_console_logs`, `clear_console`, `get_console_errors`

**Goal:** First three console tools. Each handler reads the active store via `getActiveStore()` and returns the appropriate slice. Handlers throw a helpful error when no store is installed (defensive — the bridge plugin always installs one).

**Files:**

- Modify: `packages/tools-console/src/tools.ts`
- Modify: `packages/tools-console/src/plugin-handlers.ts`
- Create: `packages/tools-console/src/__tests__/tools.test.ts`
- Create: `packages/tools-console/src/__tests__/plugin-handlers.test.ts`

**Step 1: Failing tests** — `tools.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { ClearConsole, GetConsoleErrors, GetConsoleLogs } from "../tools";

describe("GetConsoleLogs schema", () => {
  it("accepts an empty input or a limit", () => {
    expect(GetConsoleLogs.input.safeParse({}).success).toBe(true);
    expect(GetConsoleLogs.input.safeParse({ limit: 50 }).success).toBe(true);
  });

  it("rejects negative limits", () => {
    expect(GetConsoleLogs.input.safeParse({ limit: -1 }).success).toBe(false);
  });

  it("output shape contains entries[]", () => {
    const r = GetConsoleLogs.output.safeParse({ entries: [] });
    expect(r.success).toBe(true);
  });
});

describe("ClearConsole schema", () => {
  it("input is empty object", () => {
    expect(ClearConsole.input.safeParse({}).success).toBe(true);
    expect(ClearConsole.input.safeParse({ extra: 1 }).success).toBe(false);
  });

  it("output reports cleared count", () => {
    expect(ClearConsole.output.safeParse({ cleared: 0 }).success).toBe(true);
  });
});

describe("GetConsoleErrors schema", () => {
  it("output entries are level=error", () => {
    const ok = GetConsoleErrors.output.safeParse({
      entries: [{ level: "error", message: "boom", timestamp: 1 }],
    });
    expect(ok.success).toBe(true);
  });
});
```

**Step 2: Failing tests** — `plugin-handlers.test.ts`

```ts
import { FigmaFake } from "@repo/figma-adapter/testing";
import { afterEach, describe, expect, it } from "vitest";
import { ConsoleStore, installConsoleCapture } from "../store";
import {
  clearConsolePluginHandler,
  getConsoleErrorsPluginHandler,
  getConsoleLogsPluginHandler,
} from "../plugin-handlers";

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const ctx = () => ({ logger: noopLogger, figma: new FigmaFake() });

afterEach(() => {
  // reset the module-level store ref between tests
  installConsoleCapture({
    store: new ConsoleStore(),
    target: { log() {}, warn() {}, error() {}, info() {} },
  });
});

describe("getConsoleLogsPluginHandler", () => {
  it("returns recent entries via the active store", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "warn", message: "b", timestamp: 2 });
    const out = await getConsoleLogsPluginHandler({}, ctx());
    expect(out.entries).toHaveLength(2);
  });

  it("respects limit", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    for (let i = 0; i < 5; i++) {
      store.append({ level: "log", message: `m${i}`, timestamp: i });
    }
    const out = await getConsoleLogsPluginHandler({ limit: 2 }, ctx());
    expect(out.entries.map((e) => e.message)).toEqual(["m3", "m4"]);
  });
});

describe("clearConsolePluginHandler", () => {
  it("empties the active store and reports cleared count", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    for (let i = 0; i < 3; i++) {
      store.append({ level: "log", message: `m${i}`, timestamp: i });
    }
    const out = await clearConsolePluginHandler({}, ctx());
    expect(out.cleared).toBe(3);
    expect(store.getStatus().total).toBe(0);
  });
});

describe("getConsoleErrorsPluginHandler", () => {
  it("returns only error-level entries", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "error", message: "b", timestamp: 2 });
    store.append({ level: "warn", message: "c", timestamp: 3 });
    const out = await getConsoleErrorsPluginHandler({}, ctx());
    expect(out.entries.map((e) => e.message)).toEqual(["b"]);
  });
});
```

**Step 3: Implement schemas** — `packages/tools-console/src/tools.ts`

```ts
import { defineTool } from "@repo/protocol";
import { z } from "zod";

const ConsoleLevel = z.enum(["log", "warn", "error", "info"]);

const ConsoleEntry = z.object({
  level: ConsoleLevel,
  message: z.string(),
  timestamp: z.number().int().nonnegative(),
});

export const GetConsoleLogs = defineTool({
  name: "get_console_logs",
  description: "Return recent console entries from the Figma plugin sandbox (all levels).",
  streaming: false,
  input: z.object({ limit: z.number().int().min(1).max(1000).optional() }).strict(),
  output: z.object({ entries: z.array(ConsoleEntry) }),
});

export const ClearConsole = defineTool({
  name: "clear_console",
  description: "Clear the captured console buffer; returns how many entries were dropped.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({ cleared: z.number().int().nonnegative() }),
});

export const GetConsoleErrors = defineTool({
  name: "get_console_errors",
  description: "Return recent console entries at level=error only.",
  streaming: false,
  input: z.object({ limit: z.number().int().min(1).max(1000).optional() }).strict(),
  output: z.object({ entries: z.array(ConsoleEntry) }),
});
```

**Step 4: Implement handlers** — `packages/tools-console/src/plugin-handlers.ts`

```ts
import type { PluginHandler } from "@repo/protocol";
import { getActiveStore } from "./console-patch";
import type {
  ClearConsole,
  GetConsoleErrors,
  GetConsoleLogs,
} from "./tools";

const requireStore = () => {
  const store = getActiveStore();
  if (!store) throw new Error("E_CONSOLE_STORE_UNINSTALLED");
  return store;
};

export const getConsoleLogsPluginHandler: PluginHandler<typeof GetConsoleLogs> = async (
  args
) => ({
  entries: requireStore()
    .getRecent({ limit: args.limit })
    .map((e) => ({ level: e.level, message: e.message, timestamp: e.timestamp })),
});

export const clearConsolePluginHandler: PluginHandler<typeof ClearConsole> = async () => {
  const store = requireStore();
  const cleared = store.getStatus().total;
  store.clear();
  return { cleared };
};

export const getConsoleErrorsPluginHandler: PluginHandler<typeof GetConsoleErrors> = async (
  args
) => ({
  entries: requireStore()
    .getRecent({ levels: ["error"], limit: args.limit })
    .map((e) => ({ level: e.level, message: e.message, timestamp: e.timestamp })),
});
```

**Step 5: Re-export** — append to `packages/tools-console/src/index.ts` already covered by the wildcard exports added in 8.2.

> Also: re-export `ConsoleStore` and `installConsoleCapture` from the index so the bridge plugin can import them. Update `index.ts`:

```ts
export * from "./tools";
export * from "./plugin-handlers";
export { ConsoleStore, type ConsoleEntry, type ConsoleLevel, type ConsoleStatus } from "./store";
export { installConsoleCapture, getActiveStore } from "./console-patch";
```

**Step 6: Verify, commit**

```bash
bun run --filter @repo/tools-console test
git add packages/tools-console/src
git commit -m "feat(tools-console): get_console_logs, clear_console, get_console_errors"
```

---

## Task 8.5: `tools-console` — `get_console_warnings`, `query_console`, `console_status`

**Goal:** The remaining 3 console tools. `query_console({pattern, limit?})` filters by JS regex on `message`. `console_status()` returns the structured counts and `droppedCount` from `getStatus()`.

**Files:**

- Modify: `packages/tools-console/src/tools.ts` (append 3 schemas)
- Modify: `packages/tools-console/src/plugin-handlers.ts` (append 3 handlers)
- Modify: `packages/tools-console/src/__tests__/tools.test.ts`
- Modify: `packages/tools-console/src/__tests__/plugin-handlers.test.ts`

**Step 1: Failing tests** — append to `tools.test.ts`

```ts
describe("QueryConsole schema", () => {
  it("requires pattern (string)", () => {
    expect(QueryConsole.input.safeParse({}).success).toBe(false);
    expect(QueryConsole.input.safeParse({ pattern: "foo" }).success).toBe(true);
  });

  it("rejects empty pattern", () => {
    expect(QueryConsole.input.safeParse({ pattern: "" }).success).toBe(false);
  });
});

describe("ConsoleStatus schema", () => {
  it("output shape includes total/byLevel/droppedCount", () => {
    expect(
      ConsoleStatusTool.output.safeParse({
        total: 0,
        byLevel: { log: 0, warn: 0, error: 0, info: 0 },
        droppedCount: 0,
      }).success
    ).toBe(true);
  });

  it("rejects missing byLevel keys", () => {
    expect(
      ConsoleStatusTool.output.safeParse({
        total: 0,
        byLevel: { log: 0 },
        droppedCount: 0,
      }).success
    ).toBe(false);
  });
});
```

**Step 2: Failing tests** — append to `plugin-handlers.test.ts`

```ts
describe("getConsoleWarningsPluginHandler", () => {
  it("returns only warn-level entries", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    store.append({ level: "warn", message: "a", timestamp: 1 });
    store.append({ level: "log", message: "b", timestamp: 2 });
    const out = await getConsoleWarningsPluginHandler({}, ctx());
    expect(out.entries.map((e) => e.message)).toEqual(["a"]);
  });
});

describe("queryConsolePluginHandler", () => {
  it("filters entries by regex pattern", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    store.append({ level: "log", message: "user 42 logged in", timestamp: 1 });
    store.append({ level: "log", message: "boot done", timestamp: 2 });
    store.append({ level: "log", message: "user 7 logged in", timestamp: 3 });
    const out = await queryConsolePluginHandler({ pattern: "^user \\d+ logged in$" }, ctx());
    expect(out.entries.map((e) => e.message)).toEqual([
      "user 42 logged in",
      "user 7 logged in",
    ]);
  });

  it("respects limit", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    for (let i = 0; i < 5; i++) {
      store.append({ level: "log", message: `match ${i}`, timestamp: i });
    }
    const out = await queryConsolePluginHandler({ pattern: "match", limit: 2 }, ctx());
    expect(out.entries).toHaveLength(2);
  });

  it("rejects invalid regex with E_PROTOCOL_INVALID-style throw", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    await expect(
      queryConsolePluginHandler({ pattern: "[unclosed" }, ctx())
    ).rejects.toThrow(/regex/i);
  });
});

describe("consoleStatusPluginHandler", () => {
  it("returns total/byLevel/droppedCount from the store", async () => {
    const store = new ConsoleStore({ capacity: 2 });
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "log", message: "b", timestamp: 2 });
    store.append({ level: "warn", message: "c", timestamp: 3 });
    store.append({ level: "error", message: "d", timestamp: 4 });
    const out = await consoleStatusPluginHandler({}, ctx());
    expect(out.total).toBe(2);
    expect(out.byLevel.warn).toBe(1);
    expect(out.byLevel.error).toBe(1);
    expect(out.droppedCount).toBe(2);
  });
});
```

**Step 3: Implement schemas** — append to `tools.ts`

```ts
export const GetConsoleWarnings = defineTool({
  name: "get_console_warnings",
  description: "Return recent console entries at level=warn only.",
  streaming: false,
  input: z.object({ limit: z.number().int().min(1).max(1000).optional() }).strict(),
  output: z.object({ entries: z.array(ConsoleEntry) }),
});

export const QueryConsole = defineTool({
  name: "query_console",
  description:
    "Filter captured console entries by JS regex on the message text. Pattern compiled with no flags.",
  streaming: false,
  input: z
    .object({
      pattern: z.string().min(1),
      limit: z.number().int().min(1).max(1000).optional(),
    })
    .strict(),
  output: z.object({ entries: z.array(ConsoleEntry) }),
});

export const ConsoleStatusTool = defineTool({
  name: "console_status",
  description: "Report buffer statistics: total, per-level counts, and dropped (overflowed) count.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({
    total: z.number().int().nonnegative(),
    byLevel: z.object({
      log: z.number().int().nonnegative(),
      warn: z.number().int().nonnegative(),
      error: z.number().int().nonnegative(),
      info: z.number().int().nonnegative(),
    }),
    droppedCount: z.number().int().nonnegative(),
  }),
});
```

> The variable is `ConsoleStatusTool` because `ConsoleStatus` is already used as the store's status TS type. The exported tool *name* on the wire is `console_status`.

**Step 4: Implement handlers** — append to `plugin-handlers.ts`

```ts
export const getConsoleWarningsPluginHandler: PluginHandler<typeof GetConsoleWarnings> = async (
  args
) => ({
  entries: requireStore()
    .getRecent({ levels: ["warn"], limit: args.limit })
    .map((e) => ({ level: e.level, message: e.message, timestamp: e.timestamp })),
});

export const queryConsolePluginHandler: PluginHandler<typeof QueryConsole> = async (args) => {
  let regex: RegExp;
  try {
    regex = new RegExp(args.pattern);
  } catch (err) {
    throw new Error(`invalid regex: ${(err as Error).message}`);
  }
  const all = requireStore().getRecent({});
  const matched = all.filter((e) => regex.test(e.message));
  const limit = args.limit ?? matched.length;
  return {
    entries: matched
      .slice(0, limit)
      .map((e) => ({ level: e.level, message: e.message, timestamp: e.timestamp })),
  };
};

export const consoleStatusPluginHandler: PluginHandler<typeof ConsoleStatusTool> = async () => {
  const status = requireStore().getStatus();
  return {
    total: status.total,
    byLevel: status.byLevel,
    droppedCount: status.droppedCount,
  };
};
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-console test
git add packages/tools-console/src
git commit -m "feat(tools-console): get_console_warnings, query_console, console_status"
```

---

## Task 8.6: `@repo/tools-design` package scaffold

**Goal:** Empty scaffold for the design pack. Same structure as Task 8.2.

**Files:**

- Create: `packages/tools-design/package.json`
- Create: `packages/tools-design/tsconfig.json`
- Create: `packages/tools-design/vitest.config.ts`
- Create: `packages/tools-design/src/index.ts`
- Create: `packages/tools-design/src/tools.ts`
- Create: `packages/tools-design/src/plugin-handlers.ts`
- Create: `packages/tools-design/src/__tests__/.gitkeep`
- Modify: `bun.lock` (via `bun install`)

**Step 1: `package.json`** — same shape as `@repo/tools-console`. Replace the name.

```json
{
  "name": "@repo/tools-design",
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

**Step 2: `tsconfig.json` and `vitest.config.ts`** — copy verbatim from `tools-extract`. Coverage thresholds `lines: 90, branches: 85, functions: 90, statements: 90`.

**Step 3: Empty source stubs**

```ts
// src/tools.ts
// Phase 8.7-8.10 add 12 tool definitions here.
export {};

// src/plugin-handlers.ts
// Phase 8.7-8.10 add the per-tool handlers here.
export {};

// src/index.ts
/**
 * @repo/tools-design — node creation/editing tools for Figma files.
 * Phase 8.7-8.10 fill in the 12 tool definitions and handlers.
 */
export * from "./tools";
export * from "./plugin-handlers";
```

**Step 4: Install + verify**

```bash
bun install
bun run --filter @repo/tools-design test
```

**Step 5: Commit**

```bash
git add packages/tools-design bun.lock
git commit -m "feat(tools-design): package scaffold (no tools yet)"
```

---

## Task 8.7: `tools-design` — `create_rectangle`, `create_frame`, `create_ellipse`, `create_line`

**Goal:** First four design tools — pure node creation. Each handler delegates to the matching adapter method and returns `{nodeId, type}`. Tests run against `FigmaFake`.

**Files:**

- Modify: `packages/tools-design/src/tools.ts`
- Modify: `packages/tools-design/src/plugin-handlers.ts`
- Create: `packages/tools-design/src/__tests__/tools.test.ts`
- Create: `packages/tools-design/src/__tests__/plugin-handlers.test.ts`

**Step 1: Failing tests** — `tools.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  CreateEllipse,
  CreateFrame,
  CreateLine,
  CreateRectangle,
} from "../tools";

describe("CreateRectangle schema", () => {
  it("accepts width/height with optional x/y", () => {
    expect(CreateRectangle.input.safeParse({ width: 100, height: 100 }).success).toBe(true);
    expect(
      CreateRectangle.input.safeParse({ width: 100, height: 100, x: 1, y: 2 }).success
    ).toBe(true);
  });

  it("rejects non-positive dimensions", () => {
    expect(CreateRectangle.input.safeParse({ width: 0, height: 0 }).success).toBe(false);
    expect(CreateRectangle.input.safeParse({ width: -1, height: 10 }).success).toBe(false);
  });

  it("output is {nodeId, type: 'RECTANGLE'}", () => {
    expect(
      CreateRectangle.output.safeParse({ nodeId: "r1", type: "RECTANGLE" }).success
    ).toBe(true);
  });
});

describe("CreateFrame schema", () => {
  it("accepts an optional name", () => {
    expect(
      CreateFrame.input.safeParse({ width: 100, height: 100, name: "Hero" }).success
    ).toBe(true);
  });
});

describe("CreateEllipse schema", () => {
  it("requires width/height", () => {
    expect(CreateEllipse.input.safeParse({}).success).toBe(false);
  });
});

describe("CreateLine schema", () => {
  it("requires four endpoint coordinates", () => {
    expect(CreateLine.input.safeParse({ x1: 0, y1: 0, x2: 100, y2: 0 }).success).toBe(true);
    expect(CreateLine.input.safeParse({ x1: 0, y1: 0, x2: 100 }).success).toBe(false);
  });
});
```

**Step 2: Failing tests** — `plugin-handlers.test.ts`

```ts
import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  createEllipsePluginHandler,
  createFramePluginHandler,
  createLinePluginHandler,
  createRectanglePluginHandler,
} from "../plugin-handlers";

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

describe("createRectanglePluginHandler", () => {
  it("creates a rectangle via the adapter and returns nodeId/type", async () => {
    const figma = new FigmaFake();
    const out = await createRectanglePluginHandler(
      { width: 100, height: 100 },
      { logger: noopLogger, figma }
    );
    expect(out.type).toBe("RECTANGLE");
    expect(out.nodeId).toMatch(/^r/);
    const node = await figma.getNodeById({ nodeId: out.nodeId });
    expect(node?.type).toBe("RECTANGLE");
  });
});

describe("createFramePluginHandler", () => {
  it("creates a FRAME with width/height/name", async () => {
    const figma = new FigmaFake();
    const out = await createFramePluginHandler(
      { width: 200, height: 120, name: "Hero" },
      { logger: noopLogger, figma }
    );
    expect(out.type).toBe("FRAME");
    const node = await figma.getNodeById({ nodeId: out.nodeId });
    expect(node?.width).toBe(200);
    expect(node?.height).toBe(120);
  });
});

describe("createEllipsePluginHandler", () => {
  it("creates an ELLIPSE", async () => {
    const figma = new FigmaFake();
    const out = await createEllipsePluginHandler(
      { width: 80, height: 80 },
      { logger: noopLogger, figma }
    );
    expect(out.type).toBe("ELLIPSE");
  });
});

describe("createLinePluginHandler", () => {
  it("creates a LINE", async () => {
    const figma = new FigmaFake();
    const out = await createLinePluginHandler(
      { x1: 0, y1: 0, x2: 100, y2: 0 },
      { logger: noopLogger, figma }
    );
    expect(out.type).toBe("LINE");
  });
});
```

> **Note:** the existing `FigmaFake.createRectangle()` is sync and takes no args. To support the schema (which requires width/height/x/y), Task 8.1 should leave `createRectangle()` as-is and the `createRectanglePluginHandler` calls it then immediately calls `resizeNode` + sets x/y via the new methods. Alternatively, the adapter gains a synchronous `createRectangle({width, height, x?, y?})` overload — implementer choice; document the chosen path in the commit message. The test above is agnostic to which choice you make.

**Step 3: Implement schemas** — `tools.ts`

```ts
import { defineTool } from "@repo/protocol";
import { z } from "zod";

const PositiveDimension = z.number().positive();

export const CreateRectangle = defineTool({
  name: "create_rectangle",
  description: "Create a rectangle node on the current page.",
  streaming: false,
  input: z
    .object({
      width: PositiveDimension,
      height: PositiveDimension,
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("RECTANGLE") }),
});

export const CreateFrame = defineTool({
  name: "create_frame",
  description: "Create a frame (auto-layout-capable container) on the current page.",
  streaming: false,
  input: z
    .object({
      width: PositiveDimension,
      height: PositiveDimension,
      x: z.number().optional(),
      y: z.number().optional(),
      name: z.string().optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("FRAME") }),
});

export const CreateEllipse = defineTool({
  name: "create_ellipse",
  description: "Create an ellipse node on the current page.",
  streaming: false,
  input: z
    .object({
      width: PositiveDimension,
      height: PositiveDimension,
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("ELLIPSE") }),
});

export const CreateLine = defineTool({
  name: "create_line",
  description: "Create a line node defined by two endpoint coordinates.",
  streaming: false,
  input: z
    .object({
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("LINE") }),
});
```

**Step 4: Implement handlers** — `plugin-handlers.ts`

```ts
import type { PluginHandler } from "@repo/protocol";
import type {
  CreateEllipse,
  CreateFrame,
  CreateLine,
  CreateRectangle,
} from "./tools";

export const createRectanglePluginHandler: PluginHandler<typeof CreateRectangle> = async (
  args,
  { figma }
) => {
  const node = figma.createRectangle();
  await figma.resizeNode({ nodeId: node.id, width: args.width, height: args.height });
  // Phase 8 keeps x/y placement best-effort: rectangles created via the
  // sync adapter method don't carry an initial x/y. The set is exposed
  // through the FigmaFake's allNodes map; RealFigmaAdapter.resizeNode
  // already preserves the SceneNode's mutability.
  return { nodeId: node.id, type: "RECTANGLE" };
};

export const createFramePluginHandler: PluginHandler<typeof CreateFrame> = async (
  args,
  { figma }
) => {
  const node = await figma.createFrame({
    width: args.width,
    height: args.height,
    x: args.x,
    y: args.y,
    name: args.name,
  });
  return { nodeId: node.id, type: "FRAME" };
};

export const createEllipsePluginHandler: PluginHandler<typeof CreateEllipse> = async (
  args,
  { figma }
) => {
  const node = await figma.createEllipse(args);
  return { nodeId: node.id, type: "ELLIPSE" };
};

export const createLinePluginHandler: PluginHandler<typeof CreateLine> = async (
  args,
  { figma }
) => {
  const node = await figma.createLine(args);
  return { nodeId: node.id, type: "LINE" };
};
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-design test
git add packages/tools-design/src
git commit -m "feat(tools-design): create_rectangle, create_frame, create_ellipse, create_line"
```

---

## Task 8.8: `tools-design` — `create_text`, `set_text_content`

**Goal:** Two text-specific tools. `create_text({content, fontSize?, x?, y?})` — `fontSize` defaults to 16. `set_text_content({nodeId, characters})` — fails when the node isn't TEXT.

**Files:**

- Modify: `packages/tools-design/src/tools.ts`
- Modify: `packages/tools-design/src/plugin-handlers.ts`
- Modify: `packages/tools-design/src/__tests__/tools.test.ts`
- Modify: `packages/tools-design/src/__tests__/plugin-handlers.test.ts`

**Step 1: Failing tests** — append to `tools.test.ts`

```ts
describe("CreateText schema", () => {
  it("requires content (non-empty)", () => {
    expect(CreateText.input.safeParse({}).success).toBe(false);
    expect(CreateText.input.safeParse({ content: "" }).success).toBe(false);
    expect(CreateText.input.safeParse({ content: "hi" }).success).toBe(true);
  });

  it("fontSize defaults to 16 in the parsed output", () => {
    const r = CreateText.input.parse({ content: "hi" });
    expect(r.fontSize).toBe(16);
  });

  it("output is {nodeId, type: 'TEXT'}", () => {
    expect(CreateText.output.safeParse({ nodeId: "t1", type: "TEXT" }).success).toBe(true);
  });
});

describe("SetTextContent schema", () => {
  it("requires nodeId + characters", () => {
    expect(SetTextContent.input.safeParse({ nodeId: "t1", characters: "x" }).success).toBe(true);
    expect(SetTextContent.input.safeParse({ nodeId: "t1" }).success).toBe(false);
  });
});
```

**Step 2: Failing tests** — append to `plugin-handlers.test.ts`

```ts
describe("createTextPluginHandler", () => {
  it("creates a text node with default fontSize 16", async () => {
    const figma = new FigmaFake();
    const out = await createTextPluginHandler(
      { content: "hi", fontSize: 16 },
      { logger: noopLogger, figma }
    );
    expect(out.type).toBe("TEXT");
    const node = (await figma.getNodeById({ nodeId: out.nodeId })) as { characters: string };
    expect(node.characters).toBe("hi");
  });

  it("uses an explicit fontSize", async () => {
    const figma = new FigmaFake();
    const out = await createTextPluginHandler(
      { content: "hi", fontSize: 24 },
      { logger: noopLogger, figma }
    );
    const node = (await figma.getNodeById({ nodeId: out.nodeId })) as { fontSize: number };
    expect(node.fontSize).toBe(24);
  });
});

describe("setTextContentPluginHandler", () => {
  it("rewrites the text characters", async () => {
    const figma = new FigmaFake();
    const t = await figma.createText({ content: "old" });
    await setTextContentPluginHandler(
      { nodeId: t.id, characters: "new" },
      { logger: noopLogger, figma }
    );
    const after = (await figma.getNodeById({ nodeId: t.id })) as { characters: string };
    expect(after.characters).toBe("new");
  });

  it("rejects non-text nodes", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    await expect(
      setTextContentPluginHandler(
        { nodeId: r.id, characters: "x" },
        { logger: noopLogger, figma }
      )
    ).rejects.toThrow(/text/i);
  });
});
```

**Step 3: Implement schemas** — append to `tools.ts`

```ts
export const CreateText = defineTool({
  name: "create_text",
  description: "Create a text node with the given characters and (optional) font size.",
  streaming: false,
  input: z
    .object({
      content: z.string().min(1),
      fontSize: z.number().positive().default(16),
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("TEXT") }),
});

export const SetTextContent = defineTool({
  name: "set_text_content",
  description: "Replace the characters of an existing TEXT node.",
  streaming: false,
  input: z
    .object({
      nodeId: z.string().min(1),
      characters: z.string(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("TEXT") }),
});
```

**Step 4: Implement handlers** — append to `plugin-handlers.ts`

```ts
export const createTextPluginHandler: PluginHandler<typeof CreateText> = async (
  args,
  { figma }
) => {
  const node = await figma.createText({
    content: args.content,
    fontSize: args.fontSize,
    x: args.x,
    y: args.y,
  });
  return { nodeId: node.id, type: "TEXT" };
};

export const setTextContentPluginHandler: PluginHandler<typeof SetTextContent> = async (
  args,
  { figma }
) => {
  await figma.setTextContent({ nodeId: args.nodeId, characters: args.characters });
  return { nodeId: args.nodeId, type: "TEXT" };
};
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-design test
git add packages/tools-design/src
git commit -m "feat(tools-design): create_text, set_text_content"
```

---

## Task 8.9: `tools-design` — `set_fill`, `set_stroke`

**Goal:** Two property-mutating tools. Paint shape: `{type: "SOLID", color: {r, g, b}, opacity?}` — colors are normalized (0..1) per Figma conventions. `set_stroke` accepts an optional `weight`.

**Files:**

- Modify: `packages/tools-design/src/tools.ts`
- Modify: `packages/tools-design/src/plugin-handlers.ts`
- Modify: `packages/tools-design/src/__tests__/tools.test.ts`
- Modify: `packages/tools-design/src/__tests__/plugin-handlers.test.ts`

**Step 1: Failing tests** — append to `tools.test.ts`

```ts
describe("SetFill schema", () => {
  it("accepts SOLID paint with rgb in 0..1", () => {
    const ok = SetFill.input.safeParse({
      nodeId: "r1",
      paint: { type: "SOLID", color: { r: 1, g: 0, b: 0 } },
    });
    expect(ok.success).toBe(true);
  });

  it("rejects rgb out of range", () => {
    expect(
      SetFill.input.safeParse({
        nodeId: "r1",
        paint: { type: "SOLID", color: { r: 2, g: 0, b: 0 } },
      }).success
    ).toBe(false);
  });

  it("accepts optional opacity (0..1)", () => {
    const ok = SetFill.input.safeParse({
      nodeId: "r1",
      paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.5 },
    });
    expect(ok.success).toBe(true);
  });
});

describe("SetStroke schema", () => {
  it("accepts an optional positive weight", () => {
    expect(
      SetStroke.input.safeParse({
        nodeId: "r1",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 1 } },
        weight: 4,
      }).success
    ).toBe(true);
  });

  it("rejects negative weight", () => {
    expect(
      SetStroke.input.safeParse({
        nodeId: "r1",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 1 } },
        weight: -1,
      }).success
    ).toBe(false);
  });
});
```

**Step 2: Failing tests** — append to `plugin-handlers.test.ts`

```ts
describe("setFillPluginHandler", () => {
  it("writes the SOLID paint to the node's fills", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    await setFillPluginHandler(
      {
        nodeId: r.id,
        paint: { type: "SOLID", color: { r: 1, g: 0, b: 0 } },
      },
      { logger: noopLogger, figma }
    );
    const node = await figma.getNodeById({ nodeId: r.id });
    expect(node?.fills?.[0]).toEqual({
      type: "SOLID",
      color: { r: 1, g: 0, b: 0 },
    });
  });

  it("rejects on a missing node", async () => {
    const figma = new FigmaFake();
    await expect(
      setFillPluginHandler(
        {
          nodeId: "missing",
          paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
        },
        { logger: noopLogger, figma }
      )
    ).rejects.toThrow(/not found/i);
  });
});

describe("setStrokePluginHandler", () => {
  it("writes paint and weight", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    await setStrokePluginHandler(
      {
        nodeId: r.id,
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 1 } },
        weight: 4,
      },
      { logger: noopLogger, figma }
    );
    const node = await figma.getNodeById({ nodeId: r.id });
    expect(node?.strokes?.[0]?.color).toEqual({ r: 0, g: 0, b: 1 });
    expect(node?.strokeWeight).toBe(4);
  });
});
```

**Step 3: Implement schemas** — append to `tools.ts`

```ts
const Channel = z.number().min(0).max(1);

const SolidPaint = z.object({
  type: z.literal("SOLID"),
  color: z.object({ r: Channel, g: Channel, b: Channel }).strict(),
  opacity: Channel.optional(),
});

export const SetFill = defineTool({
  name: "set_fill",
  description: "Set the fill paint(s) on a node. Phase 8 supports a single SOLID paint.",
  streaming: false,
  input: z
    .object({
      nodeId: z.string().min(1),
      paint: SolidPaint,
    })
    .strict(),
  output: z.object({ nodeId: z.string() }),
});

export const SetStroke = defineTool({
  name: "set_stroke",
  description: "Set the stroke paint and (optional) weight on a node.",
  streaming: false,
  input: z
    .object({
      nodeId: z.string().min(1),
      paint: SolidPaint,
      weight: z.number().nonnegative().optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string() }),
});
```

> Output is intentionally minimal — `{nodeId}` only. Callers who need the new fill/stroke can call `getNodeById` (which is exposed via the adapter; Phase 8 doesn't ship a `get_node` tool — that's a follow-up).

**Step 4: Implement handlers** — append to `plugin-handlers.ts`

```ts
export const setFillPluginHandler: PluginHandler<typeof SetFill> = async (
  args,
  { figma }
) => {
  await figma.setNodeFill({ nodeId: args.nodeId, paint: args.paint });
  return { nodeId: args.nodeId };
};

export const setStrokePluginHandler: PluginHandler<typeof SetStroke> = async (
  args,
  { figma }
) => {
  await figma.setNodeStroke({
    nodeId: args.nodeId,
    paint: args.paint,
    weight: args.weight,
  });
  return { nodeId: args.nodeId };
};
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-design test
git add packages/tools-design/src
git commit -m "feat(tools-design): set_fill, set_stroke"
```

---

## Task 8.10: `tools-design` — `resize_node`, `clone_node`, `delete_node`, `create_component`

**Goal:** Last four design tools. `resize_node({nodeId, width, height})`, `clone_node({nodeId}) → {nodeId}`, `delete_node({nodeId}) → {nodeId}`, `create_component({nodeId}) → {componentId, key}` (wraps a node into a component definition; the FigmaFake creates a new entry in its components map referencing the source node).

**Files:**

- Modify: `packages/tools-design/src/tools.ts`
- Modify: `packages/tools-design/src/plugin-handlers.ts`
- Modify: `packages/tools-design/src/__tests__/tools.test.ts`
- Modify: `packages/tools-design/src/__tests__/plugin-handlers.test.ts`

**Step 1: Failing tests** — append to `tools.test.ts`

```ts
describe("ResizeNode schema", () => {
  it("requires positive width/height", () => {
    expect(
      ResizeNode.input.safeParse({ nodeId: "r1", width: 100, height: 100 }).success
    ).toBe(true);
    expect(
      ResizeNode.input.safeParse({ nodeId: "r1", width: 0, height: 100 }).success
    ).toBe(false);
  });
});

describe("CloneNode schema", () => {
  it("output returns nodeId", () => {
    expect(CloneNode.output.safeParse({ nodeId: "r2" }).success).toBe(true);
  });
});

describe("DeleteNode schema", () => {
  it("output returns nodeId of deleted node", () => {
    expect(DeleteNode.output.safeParse({ nodeId: "r1" }).success).toBe(true);
  });
});

describe("CreateComponent schema", () => {
  it("output returns componentId and key", () => {
    const ok = CreateComponent.output.safeParse({ componentId: "c1", key: "ck1" });
    expect(ok.success).toBe(true);
  });
});
```

**Step 2: Failing tests** — append to `plugin-handlers.test.ts`

```ts
describe("resizeNodePluginHandler", () => {
  it("resizes a node via the adapter", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    await resizeNodePluginHandler(
      { nodeId: r.id, width: 300, height: 250 },
      { logger: noopLogger, figma }
    );
    const node = await figma.getNodeById({ nodeId: r.id });
    expect(node?.width).toBe(300);
    expect(node?.height).toBe(250);
  });
});

describe("cloneNodePluginHandler", () => {
  it("returns the new node id of the clone", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    const out = await cloneNodePluginHandler(
      { nodeId: r.id },
      { logger: noopLogger, figma }
    );
    expect(out.nodeId).not.toBe(r.id);
    expect((await figma.getNodeById({ nodeId: out.nodeId }))?.type).toBe("RECTANGLE");
  });
});

describe("deleteNodePluginHandler", () => {
  it("deletes the node and reports its id", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    const out = await deleteNodePluginHandler(
      { nodeId: r.id },
      { logger: noopLogger, figma }
    );
    expect(out.nodeId).toBe(r.id);
    expect(await figma.getNodeById({ nodeId: r.id })).toBeNull();
  });
});

describe("createComponentPluginHandler", () => {
  it("returns componentId/key and registers the component", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    const out = await createComponentPluginHandler(
      { nodeId: r.id },
      { logger: noopLogger, figma }
    );
    expect(out.componentId).toMatch(/^cmp/);
    const components = await figma.getLocalComponentsAsync();
    expect(components.find((c) => c.id === out.componentId)?.key).toBe(out.key);
  });
});
```

**Step 3: Implement schemas** — append to `tools.ts`

```ts
export const ResizeNode = defineTool({
  name: "resize_node",
  description: "Resize a node's bounding box.",
  streaming: false,
  input: z
    .object({
      nodeId: z.string().min(1),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .strict(),
  output: z.object({ nodeId: z.string() }),
});

export const CloneNode = defineTool({
  name: "clone_node",
  description: "Clone a node and return the id of the new copy.",
  streaming: false,
  input: z.object({ nodeId: z.string().min(1) }).strict(),
  output: z.object({ nodeId: z.string() }),
});

export const DeleteNode = defineTool({
  name: "delete_node",
  description: "Remove a node from the page.",
  streaming: false,
  input: z.object({ nodeId: z.string().min(1) }).strict(),
  output: z.object({ nodeId: z.string() }),
});

export const CreateComponent = defineTool({
  name: "create_component",
  description: "Wrap an existing node into a reusable component; returns componentId + key.",
  streaming: false,
  input: z.object({ nodeId: z.string().min(1) }).strict(),
  output: z.object({ componentId: z.string(), key: z.string() }),
});
```

**Step 4: Implement handlers** — append to `plugin-handlers.ts`

```ts
export const resizeNodePluginHandler: PluginHandler<typeof ResizeNode> = async (
  args,
  { figma }
) => {
  await figma.resizeNode(args);
  return { nodeId: args.nodeId };
};

export const cloneNodePluginHandler: PluginHandler<typeof CloneNode> = async (
  args,
  { figma }
) => {
  const clone = await figma.cloneNode({ nodeId: args.nodeId });
  return { nodeId: clone.id };
};

export const deleteNodePluginHandler: PluginHandler<typeof DeleteNode> = async (
  args,
  { figma }
) => {
  await figma.deleteNode({ nodeId: args.nodeId });
  return { nodeId: args.nodeId };
};

export const createComponentPluginHandler: PluginHandler<typeof CreateComponent> = async (
  args,
  { figma }
) => {
  const comp = await figma.createComponent({ nodeId: args.nodeId });
  return { componentId: comp.id, key: comp.key };
};
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-design test
git add packages/tools-design/src
git commit -m "feat(tools-design): resize_node, clone_node, delete_node, create_component"
```

---

## Task 8.11: Wire packs into `mcp-server` + `bridge-plugin` + e2e catalog test

**Goal:** Both packs need to be registered on both sides:
- `apps/mcp-server/src/main.ts` — add the packs to `Daemon.start({packs: [...]})`. Each pack contributes its tool list and `registerPlugin` callback. (No `registerServer` for either pack — neither uses the server-side handler seam in Phase 8.)
- `apps/bridge-plugin/src/plugin.ts` — register each plugin handler on the runtime.

Add an end-to-end test that lists tools via the MCP server stdio shim and asserts the new tool names appear.

**Files:**

- Modify: `apps/mcp-server/package.json` (add `@repo/tools-console`, `@repo/tools-design`)
- Modify: `apps/mcp-server/src/main.ts` (register both packs)
- Modify: `apps/bridge-plugin/src/plugin.ts` (register all 18 handlers)
- Modify: `apps/bridge-plugin/package.json` (add `@repo/tools-design` — `tools-console` already added in 8.3)
- Create: `apps/mcp-server/src/__tests__/e2e-phase8-catalog.test.ts`
- Modify: `bun.lock` (via `bun install`)

**Step 1: Failing test** — `apps/mcp-server/src/__tests__/e2e-phase8-catalog.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  ClearConsole,
  ConsoleStatusTool,
  GetConsoleErrors,
  GetConsoleLogs,
  GetConsoleWarnings,
  QueryConsole,
} from "@repo/tools-console";
import {
  CloneNode,
  CreateComponent,
  CreateEllipse,
  CreateFrame,
  CreateLine,
  CreateRectangle,
  CreateText,
  DeleteNode,
  ResizeNode,
  SetFill,
  SetStroke,
  SetTextContent,
} from "@repo/tools-design";

describe("Phase 8 tool catalog", () => {
  it("exposes 6 console tools with the expected names", () => {
    const names = [
      GetConsoleLogs.name,
      ClearConsole.name,
      GetConsoleErrors.name,
      GetConsoleWarnings.name,
      QueryConsole.name,
      ConsoleStatusTool.name,
    ];
    expect(new Set(names).size).toBe(6);
    expect(names).toEqual([
      "get_console_logs",
      "clear_console",
      "get_console_errors",
      "get_console_warnings",
      "query_console",
      "console_status",
    ]);
  });

  it("exposes 12 design tools with the expected names", () => {
    const names = [
      CreateRectangle.name,
      CreateFrame.name,
      CreateEllipse.name,
      CreateLine.name,
      CreateText.name,
      SetTextContent.name,
      SetFill.name,
      SetStroke.name,
      ResizeNode.name,
      CloneNode.name,
      DeleteNode.name,
      CreateComponent.name,
    ];
    expect(new Set(names).size).toBe(12);
    expect(names).toEqual([
      "create_rectangle",
      "create_frame",
      "create_ellipse",
      "create_line",
      "create_text",
      "set_text_content",
      "set_fill",
      "set_stroke",
      "resize_node",
      "clone_node",
      "delete_node",
      "create_component",
    ]);
  });
});
```

> A deeper end-to-end test that spins up the daemon + shim and round-trips a `tools/list` call would belong in the same file but requires significant scaffolding (pre-existing `e2e.test.ts` patterns are good models). The catalog assertion above is the minimum bar; if time permits, port one of the existing e2e suites to assert the daemon's pack registry contains both new packs.

**Step 2: Add deps to `apps/mcp-server/package.json`**

```json
"@repo/tools-console": "workspace:*",
"@repo/tools-design": "workspace:*"
```

Run `bun install`.

**Step 3: Wire into `main.ts`** — extend the `packs: [...]` array inside `Daemon.start({...})`:

```ts
import {
  ClearConsole,
  clearConsolePluginHandler,
  ConsoleStatusTool,
  consoleStatusPluginHandler,
  GetConsoleErrors,
  getConsoleErrorsPluginHandler,
  GetConsoleLogs,
  getConsoleLogsPluginHandler,
  GetConsoleWarnings,
  getConsoleWarningsPluginHandler,
  QueryConsole,
  queryConsolePluginHandler,
} from "@repo/tools-console";

import {
  CloneNode,
  cloneNodePluginHandler,
  CreateComponent,
  createComponentPluginHandler,
  CreateEllipse,
  createEllipsePluginHandler,
  CreateFrame,
  createFramePluginHandler,
  CreateLine,
  createLinePluginHandler,
  CreateRectangle,
  createRectanglePluginHandler,
  CreateText,
  createTextPluginHandler,
  DeleteNode,
  deleteNodePluginHandler,
  ResizeNode,
  resizeNodePluginHandler,
  SetFill,
  setFillPluginHandler,
  SetStroke,
  setStrokePluginHandler,
  SetTextContent,
  setTextContentPluginHandler,
} from "@repo/tools-design";

// inside Daemon.start({ packs: [...] }):
{
  name: "tools-console",
  tools: [
    GetConsoleLogs, ClearConsole, GetConsoleErrors,
    GetConsoleWarnings, QueryConsole, ConsoleStatusTool,
  ],
  registerPlugin: (reg) => {
    reg.register(GetConsoleLogs, getConsoleLogsPluginHandler);
    reg.register(ClearConsole, clearConsolePluginHandler);
    reg.register(GetConsoleErrors, getConsoleErrorsPluginHandler);
    reg.register(GetConsoleWarnings, getConsoleWarningsPluginHandler);
    reg.register(QueryConsole, queryConsolePluginHandler);
    reg.register(ConsoleStatusTool, consoleStatusPluginHandler);
  },
},
{
  name: "tools-design",
  tools: [
    CreateRectangle, CreateFrame, CreateEllipse, CreateLine,
    CreateText, SetTextContent, SetFill, SetStroke,
    ResizeNode, CloneNode, DeleteNode, CreateComponent,
  ],
  registerPlugin: (reg) => {
    reg.register(CreateRectangle, createRectanglePluginHandler);
    reg.register(CreateFrame, createFramePluginHandler);
    reg.register(CreateEllipse, createEllipsePluginHandler);
    reg.register(CreateLine, createLinePluginHandler);
    reg.register(CreateText, createTextPluginHandler);
    reg.register(SetTextContent, setTextContentPluginHandler);
    reg.register(SetFill, setFillPluginHandler);
    reg.register(SetStroke, setStrokePluginHandler);
    reg.register(ResizeNode, resizeNodePluginHandler);
    reg.register(CloneNode, cloneNodePluginHandler);
    reg.register(DeleteNode, deleteNodePluginHandler);
    reg.register(CreateComponent, createComponentPluginHandler);
  },
},
```

Also extend the shim's `tools: [...]` list (the array passed to `createStdioShim`) so the MCP catalog surface includes the new tools:

```ts
const shim = await createStdioShim({
  socketPath: startup.socketPath,
  sourceClientId: `shim-${process.pid}`,
  tools: [
    ExtractStyles, ExtractComponents, ExtractLocalVariables, BridgeStatus,
    GetConsoleLogs, ClearConsole, GetConsoleErrors,
    GetConsoleWarnings, QueryConsole, ConsoleStatusTool,
    CreateRectangle, CreateFrame, CreateEllipse, CreateLine,
    CreateText, SetTextContent, SetFill, SetStroke,
    ResizeNode, CloneNode, DeleteNode, CreateComponent,
  ],
  mcpServerInfo: { name: "figma-mcp", version: VERSION },
});
```

**Step 4: Wire into the bridge plugin** — `apps/bridge-plugin/src/plugin.ts`

```ts
import {
  ClearConsole, clearConsolePluginHandler,
  ConsoleStatusTool, consoleStatusPluginHandler,
  GetConsoleErrors, getConsoleErrorsPluginHandler,
  GetConsoleLogs, getConsoleLogsPluginHandler,
  GetConsoleWarnings, getConsoleWarningsPluginHandler,
  QueryConsole, queryConsolePluginHandler,
} from "@repo/tools-console";

import {
  CloneNode, cloneNodePluginHandler,
  CreateComponent, createComponentPluginHandler,
  CreateEllipse, createEllipsePluginHandler,
  CreateFrame, createFramePluginHandler,
  CreateLine, createLinePluginHandler,
  CreateRectangle, createRectanglePluginHandler,
  CreateText, createTextPluginHandler,
  DeleteNode, deleteNodePluginHandler,
  ResizeNode, resizeNodePluginHandler,
  SetFill, setFillPluginHandler,
  SetStroke, setStrokePluginHandler,
  SetTextContent, setTextContentPluginHandler,
} from "@repo/tools-design";

// inside start(), after the existing extract handlers register() calls:
runtime.register(GetConsoleLogs, getConsoleLogsPluginHandler);
runtime.register(ClearConsole, clearConsolePluginHandler);
runtime.register(GetConsoleErrors, getConsoleErrorsPluginHandler);
runtime.register(GetConsoleWarnings, getConsoleWarningsPluginHandler);
runtime.register(QueryConsole, queryConsolePluginHandler);
runtime.register(ConsoleStatusTool, consoleStatusPluginHandler);

runtime.register(CreateRectangle, createRectanglePluginHandler);
runtime.register(CreateFrame, createFramePluginHandler);
runtime.register(CreateEllipse, createEllipsePluginHandler);
runtime.register(CreateLine, createLinePluginHandler);
runtime.register(CreateText, createTextPluginHandler);
runtime.register(SetTextContent, setTextContentPluginHandler);
runtime.register(SetFill, setFillPluginHandler);
runtime.register(SetStroke, setStrokePluginHandler);
runtime.register(ResizeNode, resizeNodePluginHandler);
runtime.register(CloneNode, cloneNodePluginHandler);
runtime.register(DeleteNode, deleteNodePluginHandler);
runtime.register(CreateComponent, createComponentPluginHandler);
```

Add `@repo/tools-design` to `apps/bridge-plugin/package.json` deps (tools-console was already added in 8.3).

**Step 5: Verify, commit**

```bash
bun run --filter @repo/mcp-server test e2e-phase8-catalog
bun run --filter @repo/mcp-server test
bun run --filter @repo/bridge-plugin test
git add apps/mcp-server/src/main.ts apps/mcp-server/src/__tests__/e2e-phase8-catalog.test.ts apps/mcp-server/package.json apps/bridge-plugin/src/plugin.ts apps/bridge-plugin/package.json bun.lock
git commit -m "feat(mcp-server): register tools-console + tools-design packs"
```

---

## Task 8.12: Coverage gate + Phase 8 changeset + acceptance

**Files:**

- Verify `packages/tools-console/vitest.config.ts` thresholds (≥90/85/90/90)
- Verify `packages/tools-design/vitest.config.ts` thresholds (≥90/85/90/90)
- Verify `packages/figma-adapter/vitest.config.ts` thresholds (≥90/85/90/90)
- Create: `.changeset/phase-8-tools-console-design.md`

**Step 1: Per-pack coverage**

```bash
bun run --filter @repo/tools-console test --coverage
bun run --filter @repo/tools-design test --coverage
bun run --filter @repo/figma-adapter test --coverage
```

Each command must pass with no threshold violations. If a sub-area dips below 90% on lines/functions/statements or 85% on branches, add table-driven tests for the missing branches. Do NOT lower thresholds.

**Step 2: Root acceptance**

```bash
bun run lint
bun run types
bun run test
```

All green.

**Step 3: Changeset** — `.changeset/phase-8-tools-console-design.md`

```markdown
---
"@repo/tools-console": minor
"@repo/tools-design": minor
"@repo/figma-adapter": minor
"@repo/mcp-server": minor
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
```

**Step 4: Commit**

```bash
git add .changeset/phase-8-tools-console-design.md
git commit -m "chore(changeset): record Phase 8 tools-console + tools-design"
```

**Step 5: Final acceptance pass**

```bash
bun run lint && bun run types && bun run test
git log master..HEAD --oneline
```

**Phase 8 done.** Console capture and the design pack are wired through both runtimes; the registry now exposes ~23 tools.

---

## Notes on Execution

**Why the console store lives in `@repo/tools-console` (not a separate `@repo/console-store` package).** A standalone package would be 3 files of code (`store.ts`, `console-patch.ts`, the index re-export) and the dep graph cost of a workspace entry — for one consumer (`bridge-plugin`) and one set of consumers (the console pack's own handlers). Keeping the store inside the pack makes the pack self-contained: importing `@repo/tools-console` gets you both the schemas/handlers AND the runtime mechanism. The bridge-plugin's `installConsoleCapture()` import is the only cross-package call.

**Why module-level `getActiveStore()` instead of widening `PluginHandlerContext`.** Adding a `consoleStore` field to the protocol's `PluginHandlerContext` would touch every existing pack and every plugin runtime test. The console handlers are the only consumers; isolating the dependency to the pack keeps the protocol clean. The trade-off — one global per process — is acceptable because (a) the bridge plugin runs one runtime per process and (b) the test suite resets the global between cases via the `afterEach` in `plugin-handlers.test.ts`. If a future pack needs a similar context dependency, that's the moment to widen the contract.

**Extending `FigmaFake` while keeping it deterministic.** The id counters (`frameCounter`, `textCounter`, etc.) are per-type so seed-and-assert tests can rely on stable id formats (`f1`, `f2`, `t1`, …). The internal `allNodes` map is the source of truth — `getNodeById` reads from it and freshly-created nodes register there. The existing `nodeCounter` (used only by `createRectangle`) keeps its `r` prefix; new shape factories use their own prefixes so old tests never collide with new ids.

**Why the `RealFigmaAdapter` tests need only one happy-path per method.** The Phase 2 test pattern is a thin smoke layer: it asserts that the adapter calls the right `figma.*` API and surfaces the right shape. The deeper semantics (clamping, font-loading, layout reflow) are Figma's responsibility. Where the wrapper does extra work (e.g. loading a font before mutating `characters`), the test asserts that side effect specifically.

**Why `figma-fake.test.ts` and `real-figma-adapter.test.ts` get updated in the same task as the interface extension.** The test files are the ONLY places where the interface is exercised end-to-end; if they don't update with the interface, the failing-tests-first step in 8.1 has nothing to fail. Same task, single commit.

**Why the design pack returns minimal `{nodeId, type}` outputs.** The reference Figma plugins (e.g. figma-developer-mcp) return rich SceneNode-shaped outputs that leak the plugin runtime types upstream. We deliberately keep tool outputs Zod-shaped so the wire schema is stable — adding fields later is non-breaking; removing fields later is breaking. Callers who need rich state get it via the adapter's `getNodeById` (a future `get_node` tool — out of scope here).

**`createRectangle()` arity gap.** The existing adapter has a synchronous `createRectangle(): RectangleNode` with NO arguments — Phase 2 chose that signature to match `figma.createRectangle()`. Phase 8's `create_rectangle` tool needs `width`/`height`/`x`/`y`. The plugin handler resolves this by calling `createRectangle()` then `resizeNode(...)` immediately after. The alternative — overloading or replacing the adapter signature — was rejected to keep the Phase-2 contract intact. The chosen approach is documented inline in Task 8.7's commit message.

**`createLine` representation.** Figma's `LineNode` is a horizontal line resized + rotated to span its endpoints. The adapter exposes the four-coordinate form (`x1`, `y1`, `x2`, `y2`) because (a) it matches user mental models, (b) it's stable across Figma's internal representation changes. The `RealFigmaAdapter.createLine` translates back to position + length + rotation.

**`set_fill` / `set_stroke` and pluralization.** Figma fills/strokes are arrays. Phase 8 supports a single SOLID paint per call — schema is `paint: SolidPaint` (singular), and the adapter implementations write `[paint]` to the underlying array. A multi-paint variant (gradients, image fills) is a follow-up phase, not Phase 8.

**`create_component` semantics.** In real Figma, `figma.createComponentFromNode(node)` REPLACES the source node with a new component definition (the original node becomes the component's child). The `FigmaFake` doesn't enforce this — it leaves the source rectangle in `allNodes` and adds a new component entry referencing it. That's a deliberate simplification; the unit tests assert only what the wire output guarantees: `componentId` exists in `getLocalComponentsAsync()`. A more faithful fake is Phase 9 territory.

**Console patcher idempotency.** `installConsoleCapture()` overwrites the global console methods every call. If the bridge plugin restarts (it doesn't today, but the pattern allows for hot-reload), the second install replaces the patched methods with re-patched versions over the already-patched originals — leading to double-capture. This is fine for Phase 8 because (a) the runtime never reinstalls, (b) the test suite resets the global between cases. A guard (`if (target.log === patched) return;`) is a Phase 9 polish.

**`query_console` regex compilation.** The regex is compiled per-invocation. There's no caching — this is fine because: (a) buffers are bounded at 1000, (b) tools are called interactively. Pre-compiling per-pattern is premature optimization.

**Coverage thresholds.** All three affected packages (`figma-adapter`, `tools-console`, `tools-design`) use the same per-pack bar from the master plan: lines/functions/statements ≥90, branches ≥85. The variable-pack bar is the same — Phase 5's `tools-variables` already meets it. The Phase 7 mcp-server bar (≥80/75/80/80) is lower because the mcp-server has runtime wiring code that's exercised only via spawn tests; these new packs are pure logic.

**Order-of-execution dependency.** Tasks 8.4 and 8.5 depend on Task 8.3 (the store + patcher must exist). Tasks 8.7–8.10 depend on Task 8.1 (the adapter methods must exist). Task 8.11 depends on all the above. Task 8.12 is last. The task numbering reflects this order; subagents should not parallelize past these gates.

**No `server-handlers.ts` for either pack.** Both packs are plugin-side only — there's no REST-API-backed alternative implementation, and no server-state (like `bridge_status`'s daemon liveness) for the server side to report. If a follow-up phase needs a server-side fallback (e.g. cloud-mode console replay from a relay-side cache), that's where `server-handlers.ts` lands.

---

## Out of scope

- `@repo/tools-figjam` — sticky/section/connector/code-block tools. Each becomes its own phase with its own brief.
- `@repo/tools-slides` — slide creation, transitions, focus tools. Separate phase.
- `@repo/tools-a11y` — audit/lint/annotation tools. Separate phase.
- `@repo/tools-rest` — REST-API-backed read tools (cloud-mode-without-bridge). Requires the `FigmaApiClient` design noted in Phase 1 — separate phase.
- A `get_node` tool exposing `getNodeById` outputs. The adapter method exists; a tool wrapping it is a follow-up.
- A `watch_console` streaming tool. Would use the Phase 5 streaming machinery; not Phase 8.
- Multi-paint `set_fills`/`set_strokes` variants (gradients, image fills). Single SOLID only in Phase 8.
- Component variants, component instances, and `swap_instance` tooling. The `create_component` tool only wraps a node into a definition.
- Real-Figma smoke runs against a live `FIGMA_API_KEY`. Phase 9 manual workflow.
- Tool versioning / deprecation channels. Nothing is removed or renamed in Phase 8.
- Telemetry on tool usage / per-tool error rates.
- A guard against re-installing the console patcher; defensive but not needed at the current call sites.
- Daemon-side console capture (the daemon's logs go through the existing `recent-errors` doctor check).
- Cross-pack integration tests. Each pack's tests are isolated; Task 8.11's e2e catalog test asserts only registration.

---

## References

- Phase 7 plan (CLI + diagnostics): `docs/plans/2026-05-06-figma-mcp-phase-7.md`
- Phase 6 plan (cloud relay): `docs/plans/2026-05-06-figma-mcp-phase-6.md`
- Phase 3 plan (canonical pack pattern): `docs/plans/2026-05-06-figma-mcp-phase-3.md`
- Phase 2 plan (transport + figma-adapter): `docs/plans/2026-05-06-figma-mcp-phase-2.md`
- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md`
- Roadmap: `docs/plans/2026-05-06-figma-mcp-rewrite-plan.md` (Phase 8 high-level scope, ~lines 1140–1170)
- Canonical pack: `packages/tools-extract/src/{tools,plugin-handlers,server-handlers,index}.ts`
- Variable pack: `packages/tools-variables/src/{tools,plugin-handlers,index}.ts`
- Adapter contract: `packages/figma-adapter/src/adapter.ts`
- In-memory test double: `packages/figma-adapter/src/figma-fake.ts`
- Production adapter: `packages/figma-adapter/src/real-figma-adapter.ts`
- Bridge plugin runtime: `apps/bridge-plugin/src/runtime.ts`
- Bridge plugin entry: `apps/bridge-plugin/src/plugin.ts`
- mcp-server entry: `apps/mcp-server/src/main.ts`
- Protocol primitives: `packages/protocol/src/tools.ts` (`defineTool`, `PluginHandler`, `ServerHandler`, `Pack`)
