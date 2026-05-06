# Figma MCP Phase 4 — Bridge Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the deleted `apps/design-plugin` with `apps/bridge-plugin` — a Figma plugin that connects to the Phase 3 daemon over WebSocket, performs a version handshake, and serves `tools-extract`'s plugin handlers against a real `figma.*`-backed `FigmaAdapter`. Adds the WS server binding to `Daemon`, the version-handshake protocol, and switches the daemon's plugin-tool routing from in-process to over-WS when a plugin is paired (with in-process fallback for tests).

**Architecture:** A single Figma plugin app (`apps/bridge-plugin`) with two Vite builds: the **plugin sandbox** (`vite.config.plugin.ts` → single inline JS, no DOM access) and the **UI iframe** (`vite.config.ui.ts` → single inline HTML via `vite-plugin-singlefile`, React + `@repo/ui`). The sandbox owns the WebSocket connection to the daemon, the version handshake, and the request → handler dispatch loop using `PluginRegistryImpl` + `RealFigmaAdapter`. The UI iframe is a minimal connection-status panel that talks to the sandbox via `figma.ui.postMessage`. The daemon now binds a `WebSocketServerTransport` (defaulting to `127.0.0.1:9223`); when the WS client connects and the handshake succeeds, the daemon routes plugin-tool requests over WS instead of running them in-process. `RealFigmaAdapter` lives in `@repo/figma-adapter` (alongside `FigmaFake`) as a thin wrapper over the `figma` global.

**Tech Stack:** TypeScript, Bun, Vitest 4.1.4, Vite 6, `vite-plugin-singlefile`, `@vitejs/plugin-react`, React 19, `@repo/ui` (Tailwind components), `@figma/plugin-typings` (type-only), `ws` 8.x, `@repo/protocol` / `@repo/transport` / `@repo/figma-adapter` / `@repo/tools-extract` (Phases 1–3).

**Predecessors:** Phase 3 is merged. `apps/mcp-server` exists with Daemon + IPC + MCP SDK glue + stdio shim. `@repo/transport` exposes `WebSocketServerTransport` and `WebSocketClientTransport` (Phase 2). `@repo/tools-extract` exports the 4 canonical tools with plugin/server handlers. The `Daemon` does **not** yet bind a WebSocket port — Phase 3 routed plugin handlers in-process against `FigmaFake` because no real plugin existed. Phase 4 changes that.

---

## Acceptance Criteria

- `apps/bridge-plugin` exists, builds via `bun run --filter @repo/bridge-plugin build` (producing `dist/manifest.json` + `dist/plugin.js` + `dist/index.html`), lints clean, types clean.
- `@repo/figma-adapter` exports `RealFigmaAdapter` alongside `FigmaFake`. Coverage on figma-adapter stays ≥90% across all metrics (the package's existing 100% may slip if `RealFigmaAdapter` adds untestable Figma-runtime branches; thin delegation should keep it close).
- `Daemon.start` binds a `WebSocketServerTransport` on a configurable port (default `127.0.0.1:9223`, `0` in tests for ephemeral). The port is exposed via `daemon.wsPort`.
- Version-handshake envelopes are defined in `@repo/protocol` and validated by both daemon and plugin runtime. Mismatched versions close the connection with `E_PROTOCOL_VERSION_DRIFT`.
- When a real plugin is connected (post-handshake), `Daemon` routes `pluginRegistry` tool calls over WS via `Correlator`. With no plugin connected, the in-process `pluginRegistry` is the fallback (Phase 3 behavior preserved for backwards compatibility — the tests still seed `FigmaFake`).
- `apps/bridge-plugin/figma.manifest.ts` declares narrow `allowedDomains: ["ws://127.0.0.1:9223"]`. The build emits `dist/manifest.json` from this source.
- The plugin sandbox's `BridgePluginRuntime` connects to the daemon, completes the handshake, dispatches incoming requests against `tools-extract` plugin handlers + `RealFigmaAdapter`. Tested using a stubbed `figma` global and the Phase 2 in-memory transport pair simulating the daemon side.
- The UI iframe is a minimal React panel showing connection state (`disconnected | connecting | connected | version-mismatch`). Updates come from the sandbox via `figma.ui.postMessage`.
- A new end-to-end test in `apps/mcp-server`: real `Daemon` (with WS binding) ↔ `WebSocketClientTransport` connecting from the test harness, completing handshake, running each of the 4 `tools-extract` tools through the WS path. Coverage on `apps/mcp-server` ≥80/75/80/80.
- A changeset records Phase 4 minor bumps for the affected packages.
- Commit hygiene: each task ends with one conventional-commit-formatted commit. No multi-task commits, no `git add -A`.

---

## Task Map

| # | Task | Package / App | Type |
|---|------|---------------|------|
| 4.1 | Implement `RealFigmaAdapter` (TDD) | figma-adapter | code |
| 4.2 | Define handshake envelope schemas (TDD) | protocol | code |
| 4.3 | Add WS server binding to `Daemon` (TDD) | mcp-server | code |
| 4.4 | Daemon-side handshake on WS connect (TDD) | mcp-server | code |
| 4.5 | Daemon plugin-routing-via-WS (TDD) | mcp-server | code |
| 4.6 | `BridgePluginRuntime` — plugin connect/handshake/dispatch (TDD) | bridge-plugin | code |
| 4.7 | Scaffold `apps/bridge-plugin` | bridge-plugin | infra |
| 4.8 | Wire `tools-extract` handlers into the bridge-plugin entry | bridge-plugin | code |
| 4.9 | `figma.manifest.ts` with narrow `allowedDomains` | bridge-plugin | code |
| 4.10 | Minimal status panel UI iframe | bridge-plugin | code |
| 4.11 | End-to-end test: in-memory plugin → daemon WS → tool dispatch | mcp-server | tests |
| 4.12 | Coverage gate + Phase 4 changeset + acceptance | repo | infra |

> **Execution order:** Task 4.6 references files inside `apps/bridge-plugin/`. Task 4.7 creates that directory. Run **4.7 BEFORE 4.6**. The numbering is logical-grouping order (code-quality flow); the executor must reorder.
> Concrete order: 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.7 → 4.6 → 4.8 → 4.9 → 4.10 → 4.11 → 4.12.

---

## Task 4.1: Implement `RealFigmaAdapter` (TDD)

**Why first:** the bridge-plugin's `tools-extract` plugin handlers depend on a `FigmaAdapter` implementation; the `RealFigmaAdapter` is the production-side counterpart to `FigmaFake`.

**Files:**
- Create: `packages/figma-adapter/src/real-figma-adapter.ts`
- Create: `packages/figma-adapter/src/__tests__/real-figma-adapter.test.ts`
- Modify: `packages/figma-adapter/src/index.ts` (re-export the new class)
- Modify: `packages/figma-adapter/package.json` (add `@figma/plugin-typings` as a devDep — type-only)
- Modify: `packages/figma-adapter/tsconfig.json` if needed (add `@figma/plugin-typings` to `compilerOptions.types`)

**Step 1: Add the type dep**

```json
// packages/figma-adapter/package.json — devDependencies
"@figma/plugin-typings": "^1.111.0"
```

Run `bun install`. Confirm via `bun.lock` that it landed.

**Step 2: Write the failing tests**

```ts
// packages/figma-adapter/src/__tests__/real-figma-adapter.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealFigmaAdapter } from "../real-figma-adapter";

const stubFigma = (overrides: Partial<typeof figma> = {}) => {
  const base = {
    editorType: "figma" as const,
    getLocalPaintStylesAsync: vi.fn().mockResolvedValue([]),
    getLocalTextStylesAsync: vi.fn().mockResolvedValue([]),
    getLocalEffectStylesAsync: vi.fn().mockResolvedValue([]),
    createRectangle: vi.fn(),
    currentPage: { selection: [] as readonly { id: string }[] },
    root: {
      findAllWithCriteria: vi.fn().mockReturnValue([]),
    },
    variables: {
      getLocalVariablesAsync: vi.fn().mockResolvedValue([]),
      getVariableByIdAsync: vi.fn().mockResolvedValue(null),
    },
  };
  return { ...base, ...overrides };
};

beforeEach(() => {
  vi.stubGlobal("figma", stubFigma());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RealFigmaAdapter.editorType", () => {
  it("reads from figma.editorType", () => {
    vi.stubGlobal("figma", stubFigma({ editorType: "figjam" as const }));
    expect(new RealFigmaAdapter().editorType).toBe("figjam");
  });
});

describe("RealFigmaAdapter.getLocalVariablesAsync", () => {
  it("delegates to figma.variables.getLocalVariablesAsync, summarizing each variable", async () => {
    const calls = vi.fn().mockResolvedValue([
      {
        id: "v1",
        name: "color/red",
        resolvedType: "COLOR",
        valuesByMode: { m1: { r: 1, g: 0, b: 0 } },
      },
    ]);
    vi.stubGlobal(
      "figma",
      stubFigma({
        variables: {
          getLocalVariablesAsync: calls,
          getVariableByIdAsync: vi.fn(),
        } as never,
      } as never),
    );

    const result = await new RealFigmaAdapter().getLocalVariablesAsync();
    expect(calls).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "v1", resolvedType: "COLOR" });
  });
});

describe("RealFigmaAdapter.setValueForMode", () => {
  it("looks up the variable by id and calls setValueForMode on it", async () => {
    const setValueForMode = vi.fn();
    const variable = { id: "v1", setValueForMode };
    vi.stubGlobal(
      "figma",
      stubFigma({
        variables: {
          getLocalVariablesAsync: vi.fn().mockResolvedValue([variable]),
          getVariableByIdAsync: vi.fn().mockResolvedValue(variable),
        } as never,
      } as never),
    );

    await new RealFigmaAdapter().setValueForMode({
      variableId: "v1",
      modeId: "m1",
      value: "#aa0000",
    });
    expect(setValueForMode).toHaveBeenCalledWith("m1", "#aa0000");
  });

  it("throws when the variable does not exist", async () => {
    await expect(
      new RealFigmaAdapter().setValueForMode({
        variableId: "missing",
        modeId: "m1",
        value: 0,
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("RealFigmaAdapter.createRectangle", () => {
  it("delegates to figma.createRectangle and surfaces id/type/width/height", () => {
    const node = { id: "r1", type: "RECTANGLE" as const, width: 100, height: 100 };
    vi.stubGlobal("figma", stubFigma({ createRectangle: vi.fn().mockReturnValue(node) }));
    const result = new RealFigmaAdapter().createRectangle();
    expect(result).toEqual(node);
  });
});

describe("RealFigmaAdapter.currentPageSelection", () => {
  it("maps figma.currentPage.selection to ids", () => {
    vi.stubGlobal(
      "figma",
      stubFigma({ currentPage: { selection: [{ id: "n1" }, { id: "n2" }] } } as never),
    );
    expect(new RealFigmaAdapter().currentPageSelection.nodeIds).toEqual(["n1", "n2"]);
  });
});

describe("RealFigmaAdapter.getLocalComponentsAsync", () => {
  it("delegates to figma.root.findAllWithCriteria for COMPONENT nodes", async () => {
    const find = vi.fn().mockReturnValue([
      { id: "c1", name: "Button", key: "btn", description: "primary" },
    ]);
    vi.stubGlobal("figma", stubFigma({ root: { findAllWithCriteria: find } } as never));

    const result = await new RealFigmaAdapter().getLocalComponentsAsync();
    expect(find).toHaveBeenCalledWith({ types: ["COMPONENT"] });
    expect(result[0]).toEqual({
      id: "c1",
      name: "Button",
      key: "btn",
      description: "primary",
    });
  });
});

describe("RealFigmaAdapter.getLocalPaintStylesAsync", () => {
  it("delegates to figma.getLocalPaintStylesAsync, summarizing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({
        getLocalPaintStylesAsync: vi
          .fn()
          .mockResolvedValue([
            { id: "p1", name: "primary", description: "hex", paints: [{ type: "SOLID" }] },
          ]),
      }),
    );
    const result = await new RealFigmaAdapter().getLocalPaintStylesAsync();
    expect(result[0]).toMatchObject({ id: "p1", name: "primary", type: "PAINT" });
  });
});
```

> **Note on Figma's variable API:** the modern API is `figma.variables.getLocalVariablesAsync()` and `figma.variables.getVariableByIdAsync(id)`. The adapter encapsulates the two-step setValueForMode dance so handlers stay simple.

Run: `bun run --filter @repo/figma-adapter test real-figma-adapter` — FAIL.

**Step 3: Implement**

```ts
// packages/figma-adapter/src/real-figma-adapter.ts
import type {
  Component,
  EditorType,
  FigmaAdapter,
  PageSelection,
  PaintStyle,
  RectangleNode,
  TextStyle,
  EffectStyle,
  Variable,
} from "./adapter";

/**
 * Production `FigmaAdapter` backed by the `figma` global injected by
 * the Figma plugin runtime. Tests stub the global via `vi.stubGlobal`.
 *
 * Each method is a thin pass-through that summarizes the plugin
 * runtime's heavier objects into the lighter shapes the protocol's
 * tool output schemas expect.
 */
export class RealFigmaAdapter implements FigmaAdapter {
  get editorType(): EditorType {
    return figma.editorType as EditorType;
  }

  async getLocalVariablesAsync(): Promise<Variable[]> {
    const vars = await figma.variables.getLocalVariablesAsync();
    return vars.map((v) => ({
      id: v.id,
      name: v.name,
      resolvedType: v.resolvedType as Variable["resolvedType"],
      valuesByMode: { ...v.valuesByMode } as Variable["valuesByMode"],
    }));
  }

  async setValueForMode(args: {
    variableId: string;
    modeId: string;
    value: unknown;
  }): Promise<void> {
    const v = await figma.variables.getVariableByIdAsync(args.variableId);
    if (!v) throw new Error(`variable not found: ${args.variableId}`);
    v.setValueForMode(args.modeId, args.value as never);
  }

  createRectangle(): RectangleNode {
    const node = figma.createRectangle();
    return { id: node.id, type: "RECTANGLE", width: node.width, height: node.height };
  }

  get currentPageSelection(): PageSelection {
    return { nodeIds: figma.currentPage.selection.map((n) => n.id) };
  }

  async getLocalComponentsAsync(): Promise<Component[]> {
    const components = figma.root.findAllWithCriteria({ types: ["COMPONENT"] });
    return components.map((c) => ({
      id: c.id,
      name: c.name,
      key: (c as { key: string }).key,
      description: (c as { description?: string }).description,
    }));
  }

  async getLocalPaintStylesAsync(): Promise<PaintStyle[]> {
    const styles = await figma.getLocalPaintStylesAsync();
    return styles.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      type: "PAINT" as const,
      paints: s.paints.map((p) => ({ type: p.type, visible: p.visible })),
    }));
  }

  async getLocalTextStylesAsync(): Promise<TextStyle[]> {
    const styles = await figma.getLocalTextStylesAsync();
    return styles.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      type: "TEXT" as const,
      fontName: { family: s.fontName.family, style: s.fontName.style },
      fontSize: s.fontSize,
      lineHeight: s.lineHeight as TextStyle["lineHeight"],
      letterSpacing: s.letterSpacing as TextStyle["letterSpacing"],
    }));
  }

  async getLocalEffectStylesAsync(): Promise<EffectStyle[]> {
    const styles = await figma.getLocalEffectStylesAsync();
    return styles.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      type: "EFFECT" as const,
      effects: s.effects.map((e) => ({ type: e.type, visible: e.visible })),
    }));
  }
}
```

**Step 4: Update `index.ts`**

```ts
export { RealFigmaAdapter } from "./real-figma-adapter";
```

**Step 5: Run tests, verify**

`bun run --filter @repo/figma-adapter test` — was 23, now 31 (8 new).
`bun run --filter @repo/figma-adapter types` — clean. (May require adjusting `tsconfig.json` to include `@figma/plugin-typings` if globals aren't picked up automatically. If TS doesn't see `figma`, add `"types": ["@figma/plugin-typings"]` to `compilerOptions`.)
`bun run --filter @repo/figma-adapter lint` — clean.

**Step 6: Commit**

```bash
git add packages/figma-adapter/src/real-figma-adapter.ts packages/figma-adapter/src/__tests__/real-figma-adapter.test.ts packages/figma-adapter/src/index.ts packages/figma-adapter/package.json packages/figma-adapter/tsconfig.json bun.lock
git commit -m "feat(figma-adapter): add RealFigmaAdapter wrapping the figma global"
```

---

## Task 4.2: Define handshake envelope schemas (TDD)

**Goal:** Pin the version-handshake wire shape in `@repo/protocol`. Both sides validate it via Zod before accepting any tool envelopes.

**Files:**
- Create: `packages/protocol/src/handshake.ts`
- Create: `packages/protocol/src/__tests__/handshake.test.ts`
- Modify: `packages/protocol/src/index.ts` (re-export)
- Modify: `packages/protocol/src/envelope.ts` — add the two handshake kinds to the `Envelope` discriminated union (so the WS transport can `parseEnvelope` them through the same code path as tool envelopes)
- Modify: `packages/protocol/src/__tests__/envelope.test.ts` — add a discriminated-union test asserting the new kinds are accepted

**Step 1: Tests**

```ts
// packages/protocol/src/__tests__/handshake.test.ts
import { describe, expect, it } from "vitest";
import {
  HandshakeRequestEnvelope,
  HandshakeResponseEnvelope,
  parseHandshake,
} from "../handshake";

describe("HandshakeRequestEnvelope", () => {
  it("validates a request with serverVersion", () => {
    const r = HandshakeRequestEnvelope.safeParse({
      kind: "handshake-request",
      serverVersion: "0.0.0",
      protocolVersion: 1,
    });
    expect(r.success).toBe(true);
  });
  it("rejects when protocolVersion is missing", () => {
    const r = HandshakeRequestEnvelope.safeParse({
      kind: "handshake-request",
      serverVersion: "0.0.0",
    });
    expect(r.success).toBe(false);
  });
});

describe("HandshakeResponseEnvelope", () => {
  it("validates a response with clientVersion + accepted", () => {
    const r = HandshakeResponseEnvelope.safeParse({
      kind: "handshake-response",
      clientVersion: "0.0.0",
      protocolVersion: 1,
      accepted: true,
    });
    expect(r.success).toBe(true);
  });
  it("validates a rejection with reason", () => {
    const r = HandshakeResponseEnvelope.safeParse({
      kind: "handshake-response",
      clientVersion: "0.0.0",
      protocolVersion: 1,
      accepted: false,
      reason: "version mismatch",
    });
    expect(r.success).toBe(true);
  });
});

describe("parseHandshake (discriminated union)", () => {
  it("dispatches on kind", () => {
    const req = parseHandshake({
      kind: "handshake-request",
      serverVersion: "0.0.0",
      protocolVersion: 1,
    });
    expect(req.kind).toBe("handshake-request");
  });
  it("throws on unknown kind", () => {
    expect(() => parseHandshake({ kind: "nope" } as unknown)).toThrow();
  });
});
```

Run: FAIL.

**Step 2: Implement `handshake.ts`**

```ts
// packages/protocol/src/handshake.ts
import { z } from "zod";

/**
 * Handshake envelopes. Exchanged once per connection BEFORE any tool
 * envelopes flow. Mismatched `protocolVersion` is a hard close.
 */
export const PROTOCOL_VERSION = 1 as const;

export const HandshakeRequestEnvelope = z.object({
  kind: z.literal("handshake-request"),
  serverVersion: z.string().min(1),
  protocolVersion: z.number().int().positive(),
});
export type HandshakeRequestEnvelope = z.infer<typeof HandshakeRequestEnvelope>;

export const HandshakeResponseEnvelope = z.object({
  kind: z.literal("handshake-response"),
  clientVersion: z.string().min(1),
  protocolVersion: z.number().int().positive(),
  accepted: z.boolean(),
  reason: z.string().optional(),
});
export type HandshakeResponseEnvelope = z.infer<typeof HandshakeResponseEnvelope>;

export const Handshake = z.discriminatedUnion("kind", [
  HandshakeRequestEnvelope,
  HandshakeResponseEnvelope,
]);
export type Handshake = z.infer<typeof Handshake>;

export function parseHandshake(input: unknown): Handshake {
  return Handshake.parse(input);
}
```

**Step 3: Add handshake kinds to the `Envelope` union**

Modify `packages/protocol/src/envelope.ts`:

```ts
import { HandshakeRequestEnvelope, HandshakeResponseEnvelope } from "./handshake";

// ... existing schemas ...

export const Envelope = z.discriminatedUnion("kind", [
  RequestEnvelope,
  ResponseEnvelope,
  ErrorEnvelope,
  HandshakeRequestEnvelope,
  HandshakeResponseEnvelope,
]);
```

Add a test in `packages/protocol/src/__tests__/envelope.test.ts`:

```ts
it("accepts a handshake-request via parseEnvelope", () => {
  const env = parseEnvelope({
    kind: "handshake-request",
    serverVersion: "0.0.0",
    protocolVersion: 1,
  });
  expect(env.kind).toBe("handshake-request");
});

it("accepts a handshake-response via parseEnvelope", () => {
  const env = parseEnvelope({
    kind: "handshake-response",
    clientVersion: "0.0.0",
    protocolVersion: 1,
    accepted: true,
  });
  expect(env.kind).toBe("handshake-response");
});
```

**Step 4: Update `index.ts`**

Add: `export * from "./handshake";`

**Step 5: Run tests, commit**

`bun run --filter @repo/protocol test` — all tests pass (existing + new).

```bash
git add packages/protocol/src/handshake.ts packages/protocol/src/__tests__/handshake.test.ts packages/protocol/src/index.ts packages/protocol/src/envelope.ts packages/protocol/src/__tests__/envelope.test.ts
git commit -m "feat(protocol): add version-handshake envelope schemas"
```

---

## Task 4.3: Add WS server binding to `Daemon` (TDD)

**Goal:** `Daemon.start` now binds a `WebSocketServerTransport` (in addition to the IPC server). Default port `127.0.0.1:9223`; tests pass `0` for ephemeral. Daemon exposes `wsPort` for tests/diagnostics. The WS server doesn't yet handle plugin messages — that's Tasks 4.4/4.5.

**Files:**
- Modify: `apps/mcp-server/src/daemon/daemon.ts`
- Modify: `apps/mcp-server/src/daemon/__tests__/daemon.test.ts` (add tests; update existing tests to pass `wsPort: 0`)
- Modify: `apps/mcp-server/src/__tests__/e2e.test.ts` (existing tests need `wsPort: 0`)
- Modify: `apps/mcp-server/src/main.ts` (pass `wsPort: 9223` explicitly OR let it default; include `version: VERSION` field — see Task 4.4)

**Step 1: Add the failing tests** (append to `daemon.test.ts`):

```ts
describe("Daemon WS server", () => {
  it("binds a WebSocket server on a configurable port", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-ws-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0, // ephemeral
      version: "0.0.0",
      figma: new FigmaFake(),
      packs: [],
    });
    expect(daemon.wsPort).toBeGreaterThan(0);
    await daemon.stop();
  });

  it("stop() releases the WS port", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-ws-stop-"));
    const socketPath = join(dir, "daemon.sock");
    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0,
      version: "0.0.0",
      figma: new FigmaFake(),
      packs: [],
    });
    const port = daemon.wsPort;
    await daemon.stop();
    // Try to listen on the same port — should succeed because daemon released it.
    const { WebSocketServer } = await import("ws");
    const wss = new WebSocketServer({ port, host: "127.0.0.1" });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
});
```

> The "defaults to 9223" assertion is intentionally omitted — port 9223 may be bound by another process during the test run. The default is enforced by `Daemon`'s signature, not by tests.

Run: FAIL — `wsPort` not on `Daemon`.

**Step 2: Implement**

In `apps/mcp-server/src/daemon/daemon.ts`, modify `DaemonStartOptions`:

```ts
export interface DaemonStartOptions {
  readonly socketPath: string;
  /** TCP port for the plugin WebSocket. Defaults to 9223. Pass 0 for ephemeral (tests). */
  readonly wsPort?: number;
  /** Daemon version. Sent in the handshake-request. */
  readonly version: string;
  readonly figma: FigmaAdapter;
  readonly packs: readonly Pack[];
  readonly logger?: Logger;
}
```

In `Daemon`:

```ts
import { WebSocketServerTransport } from "@repo/transport";
// ... existing imports ...

export class Daemon {
  private readonly ipc: UnixSocketServerTransport;
  private readonly ws: WebSocketServerTransport;
  private readonly version: string;
  // ... existing fields ...

  static async start(options: DaemonStartOptions): Promise<Daemon> {
    const ipc = await UnixSocketServerTransport.listen({ path: options.socketPath });
    const wsPort = options.wsPort ?? 9223;
    const ws = await WebSocketServerTransport.listen({ port: wsPort });
    const daemon = new Daemon(
      ipc,
      ws,
      options.figma,
      options.version,
      options.logger ?? noopLogger,
    );
    // ... existing pack registration ...
    ipc.onMessage((env) => {
      if (env.kind === "request") {
        void daemon.handleRequest(env);
      }
    });
    return daemon;
  }

  private constructor(
    ipc: UnixSocketServerTransport,
    ws: WebSocketServerTransport,
    figma: FigmaAdapter,
    version: string,
    logger: Logger,
  ) {
    this.ipc = ipc;
    this.ws = ws;
    this.figma = figma;
    this.version = version;
    this.logger = logger;
  }

  get wsPort(): number {
    return this.ws.port;
  }

  async stop(): Promise<void> {
    this.closed = true;
    await Promise.all([this.ipc.close(), this.ws.close()]);
  }

  // ... existing methods ...
}
```

**Step 3: Update existing daemon callers**

Search: `rg "Daemon.start\(\{" apps/mcp-server/src/`

Update every call to include `wsPort: 0` (in tests) and `version: "0.0.0"` (everywhere). Also update `apps/mcp-server/src/main.ts`'s daemon-mode block to pass `version: VERSION`.

**Step 4: Run tests**

`bun run --filter @repo/mcp-server test` — all 41+ tests still pass plus 2 new.

**Step 5: Commit**

```bash
git add apps/mcp-server/src/daemon/daemon.ts apps/mcp-server/src/daemon/__tests__/daemon.test.ts apps/mcp-server/src/__tests__/e2e.test.ts apps/mcp-server/src/main.ts
git commit -m "feat(mcp-server): Daemon binds a WebSocket server for the plugin"
```

---

## Task 4.4: Daemon-side handshake on WS connect (TDD)

**Goal:** When a WS client connects to the daemon, send a `HandshakeRequestEnvelope`, await a `HandshakeResponseEnvelope`, and accept (or close) the connection accordingly. Track the connection state internally; expose `isPluginConnected` and `pluginVersion`.

**Files:**
- Modify: `apps/mcp-server/src/daemon/daemon.ts`
- Modify: `apps/mcp-server/src/daemon/__tests__/daemon.test.ts`

**Step 1: Tests** (append):

```ts
const waitFor = <T>(fn: () => T | undefined, timeoutMs = 1000): Promise<T> =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const v = fn();
      if (v !== undefined) return resolve(v);
      if (Date.now() - start > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, 10);
    };
    tick();
  });

describe("Daemon plugin handshake", () => {
  it("completes handshake with a matching protocolVersion", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-handshake-"));
    const daemon = await Daemon.start({
      socketPath: join(dir, "daemon.sock"),
      wsPort: 0,
      figma: new FigmaFake(),
      packs: [],
      version: "0.0.0",
    });

    const { WebSocketClientTransport } = await import("@repo/transport");
    const { WebSocket } = await import("ws");
    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${daemon.wsPort}`,
      WebSocketCtor: WebSocket as never,
    });

    // Daemon sends HandshakeRequestEnvelope on connect; client responds.
    let received: unknown;
    client.onMessage((env) => {
      received = env;
    });
    await waitFor(() => (received !== undefined ? received : undefined));
    expect((received as { kind: string }).kind).toBe("handshake-request");

    await client.send({
      kind: "handshake-response",
      clientVersion: "0.0.0",
      protocolVersion: 1,
      accepted: true,
    } as never);

    await waitFor(() => (daemon.isPluginConnected ? true : undefined));
    expect(daemon.isPluginConnected).toBe(true);
    expect(daemon.pluginVersion).toBe("0.0.0");

    await client.close();
    await daemon.stop();
  });

  it("rejects a client with mismatched protocolVersion", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-handshake-mismatch-"));
    const daemon = await Daemon.start({
      socketPath: join(dir, "daemon.sock"),
      wsPort: 0,
      figma: new FigmaFake(),
      packs: [],
      version: "0.0.0",
    });

    const { WebSocketClientTransport } = await import("@repo/transport");
    const { WebSocket } = await import("ws");
    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${daemon.wsPort}`,
      WebSocketCtor: WebSocket as never,
    });

    await client.send({
      kind: "handshake-response",
      clientVersion: "0.0.0",
      protocolVersion: 999, // bogus
      accepted: true,
    } as never);

    let disconnected = false;
    client.onDisconnect(() => {
      disconnected = true;
    });
    await waitFor(() => (disconnected ? true : undefined));
    expect(daemon.isPluginConnected).toBe(false);

    await daemon.stop();
  });
});
```

Run: FAIL.

**Step 2: Implement**

Import handshake types in `daemon.ts`:

```ts
import {
  type HandshakeRequestEnvelope,
  type HandshakeResponseEnvelope,
  PROTOCOL_VERSION,
  // ... existing protocol imports
} from "@repo/protocol";
```

Add private state to `Daemon`:

```ts
private pluginConnected = false;
private _pluginVersion: string | null = null;
```

In `Daemon.start`, after the WS server is created, register a connect handler:

```ts
ws.onConnect(() => {
  void daemon.runHandshake();
});
```

Add private methods:

```ts
get isPluginConnected(): boolean {
  return this.pluginConnected;
}
get pluginVersion(): string | null {
  return this._pluginVersion;
}

private async runHandshake(): Promise<void> {
  const request: HandshakeRequestEnvelope = {
    kind: "handshake-request",
    serverVersion: this.version,
    protocolVersion: PROTOCOL_VERSION,
  };
  // Subscribe to ONE handshake-response, then unsubscribe.
  const unsub = this.ws.onMessage((env) => {
    if ((env as unknown as { kind: string }).kind === "handshake-response") {
      unsub();
      void this.completeHandshake(env as unknown as HandshakeResponseEnvelope);
    }
  });
  await this.ws.send(request as never);
}

private async completeHandshake(response: HandshakeResponseEnvelope): Promise<void> {
  if (response.protocolVersion !== PROTOCOL_VERSION || !response.accepted) {
    await this.ws.close();
    return;
  }
  this.pluginConnected = true;
  this._pluginVersion = response.clientVersion;
}
```

> **Note:** the WS transport's `onMessage` delivers parsed `Envelope`s. With Task 4.2's union extension, handshake kinds parse correctly through `parseEnvelope` and are dispatched here.

**Step 3: Run tests, commit**

`bun run --filter @repo/mcp-server test daemon` — handshake tests pass.

```bash
git add apps/mcp-server/src/daemon/daemon.ts apps/mcp-server/src/daemon/__tests__/daemon.test.ts
git commit -m "feat(mcp-server): handshake on WS connect with version drift rejection"
```

---

## Task 4.5: Daemon plugin-routing-via-WS (TDD)

**Goal:** When a request hits the daemon and the tool is in `pluginRegistry`, route to the connected WS plugin (if any) via a `Correlator` over the WS transport. Fall back to in-process dispatch when no plugin is connected.

**Files:**
- Modify: `apps/mcp-server/src/daemon/daemon.ts`
- Modify: `apps/mcp-server/src/daemon/__tests__/daemon.test.ts`

**Step 1: Tests** (append):

```ts
it("forwards a plugin-registry tool over WS when a plugin is connected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mcp-route-ws-"));
  const PluginPing = defineTool({
    name: "plugin_ping",
    description: "ping over the WS plugin",
    streaming: false,
    input: z.object({}).strict(),
    output: z.object({ ok: z.literal(true) }),
  });

  const daemon = await Daemon.start({
    socketPath: join(dir, "daemon.sock"),
    wsPort: 0,
    figma: new FigmaFake(),
    version: "0.0.0",
    packs: [
      {
        name: "ping-pack",
        tools: [PluginPing],
        registerPlugin: () => {
          /* intentionally empty — proves WS path is used, not in-process */
        },
      },
    ],
  });

  const { WebSocketClientTransport } = await import("@repo/transport");
  const { WebSocket } = await import("ws");
  const pluginTransport = await WebSocketClientTransport.connect({
    url: `ws://127.0.0.1:${daemon.wsPort}`,
    WebSocketCtor: WebSocket as never,
  });

  // Plugin side: respond to handshake AND to plugin tool requests.
  pluginTransport.onMessage(async (env) => {
    if (env.kind === "handshake-request") {
      await pluginTransport.send({
        kind: "handshake-response",
        clientVersion: "0.0.0",
        protocolVersion: 1,
        accepted: true,
      } as never);
    }
    if (env.kind === "request" && env.tool === "plugin_ping") {
      await pluginTransport.send({
        kind: "response",
        id: env.id,
        ok: true,
        result: { ok: true },
      } as never);
    }
  });

  await waitFor(() => (daemon.isPluginConnected ? true : undefined));

  // IPC client (a stand-in for a stdio shim) issues the request.
  const ipcClient = await UnixSocketClientTransport.connect({ path: join(dir, "daemon.sock") });
  const correlator = new Correlator(ipcClient);
  const result = await correlator.request<{ ok: true }>({
    kind: "request",
    id: "shim-r1",
    sourceClientId: "shim-A",
    tool: "plugin_ping",
    args: {},
  });
  expect(result).toEqual({ ok: true });

  await ipcClient.close();
  await pluginTransport.close();
  await daemon.stop();
});
```

> The Phase 3 test "dispatches a plugin tool call against the daemon's FigmaFake" already covers the in-process fallback. It must continue to pass after this change — the new logic only activates `pluginConnected === true`.

Run: FAIL — daemon doesn't yet route over WS.

**Step 2: Implement**

In `Daemon`, add:

```ts
import { Correlator } from "@repo/transport";

// Add field:
private pluginCorrelator: Correlator | null = null;
```

In `completeHandshake`, after marking `pluginConnected = true`:

```ts
this.pluginCorrelator = new Correlator(this.ws);
```

In `dispatch`:

```ts
private async dispatch(req: RequestEnvelope): Promise<unknown> {
  if (this.serverRegistry.has(req.tool)) {
    return this.serverRegistry.dispatch(req.tool, req.args, { logger: this.logger });
  }
  // Plugin-tool resolution: prefer the connected WS plugin; fall back to in-process.
  const knownByPack = this.pluginRegistry.has(req.tool);
  if (this.pluginConnected && this.pluginCorrelator) {
    return this.pluginCorrelator.request({
      kind: "request",
      id: req.id, // reuse the originating id; correlator keys on this
      sourceClientId: req.sourceClientId,
      tool: req.tool,
      args: req.args,
    });
  }
  if (knownByPack) {
    return this.pluginRegistry.dispatch(req.tool, req.args, {
      logger: this.logger,
      figma: this.figma,
    });
  }
  throw new RegistryError(
    ErrorCode.E_PROTOCOL_UNKNOWN_TOOL,
    `unknown tool: ${req.tool}`,
  );
}
```

> **Routing precedence:** server registry first (always in-process). Then if a WS plugin is connected, route plugin tools to it (the plugin owns the universe of plugin tools). Otherwise fall back to in-process plugin registry. Unknown tool everywhere → error.

**Step 3: Run all tests**

`bun run --filter @repo/mcp-server test` — all pass, including the new WS-routing test AND the existing in-process fallback test.

**Step 4: Commit**

```bash
git add apps/mcp-server/src/daemon/daemon.ts apps/mcp-server/src/daemon/__tests__/daemon.test.ts
git commit -m "feat(mcp-server): route plugin-tool requests over WS when plugin is connected"
```

---

## Task 4.7: Scaffold `apps/bridge-plugin`

**(Runs BEFORE Task 4.6 — see execution order note.)**

**Files:**
- Create: `apps/bridge-plugin/package.json`
- Create: `apps/bridge-plugin/tsconfig.json`
- Create: `apps/bridge-plugin/tsconfig.node.json`
- Create: `apps/bridge-plugin/vitest.config.ts`
- Create: `apps/bridge-plugin/vite.config.plugin.ts`
- Create: `apps/bridge-plugin/vite.config.ui.ts`
- Create: `apps/bridge-plugin/src/plugin.ts` (sandbox entry stub)
- Create: `apps/bridge-plugin/src/ui/main.tsx` (UI entry stub)
- Create: `apps/bridge-plugin/src/ui/index.html` (Vite singlefile source)
- Create: `apps/bridge-plugin/src/ui/styles.css` (Tailwind imports)

**Step 1: `package.json`**

```json
{
  "name": "@repo/bridge-plugin",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build --config vite.config.plugin.ts && vite build --config vite.config.ui.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "types": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json",
    "lint": "biome check .",
    "dev": "vite --config vite.config.ui.ts"
  },
  "dependencies": {
    "@repo/figma-adapter": "workspace:*",
    "@repo/protocol": "workspace:*",
    "@repo/tools-extract": "workspace:*",
    "@repo/transport": "workspace:*",
    "@repo/ui": "workspace:*",
    "react": "^19.2.5",
    "react-dom": "^19.2.5"
  },
  "devDependencies": {
    "@figma/plugin-typings": "^1.111.0",
    "@tailwindcss/vite": "^4.2.4",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^25.0.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.0",
    "@vitest/coverage-v8": "4.1.4",
    "happy-dom": "^20.9.0",
    "tailwindcss": "^4.2.3",
    "typescript": "^6.0.0",
    "vite": "^8.0.0",
    "vite-plugin-singlefile": "^2.0.0",
    "vitest": "4.1.4"
  }
}
```

> Use the same Vite/React/Tailwind majors as `apps/storybook` for consistency. Confirm and update versions to whatever's resolved by the existing apps.

**Step 2: `tsconfig.json`** (web/UI side):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["@figma/plugin-typings", "vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/__tests__/**", "**/*.test.ts", "**/*.test.tsx"]
}
```

**Step 3: `tsconfig.node.json`** (test side using happy-dom + node):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"],
    "types": ["node", "@figma/plugin-typings"]
  },
  "include": ["src/**/*.test.ts", "src/**/*.test.tsx", "vite.config.*.ts", "vitest.config.ts"]
}
```

**Step 4: `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node", // Override per-test for UI via @vitest-environment comment
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/__tests__/**",
        "src/plugin.ts",      // sandbox entry — wired in Task 4.8
        "src/ui/main.tsx",    // UI bootstrap entry
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});
```

**Step 5: `vite.config.plugin.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/plugin.ts",
      formats: ["iife"],
      name: "BridgePlugin",
      fileName: () => "plugin.js",
    },
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      output: { extend: true },
    },
  },
});
```

**Step 6: `vite.config.ui.ts`**

```ts
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: "src/ui",
  plugins: [react(), tailwind(), viteSingleFile()],
  build: {
    outDir: "../../dist",
    emptyOutDir: false,
    rollupOptions: { input: "src/ui/index.html" },
  },
});
```

**Step 7: Source stubs**

`src/plugin.ts`:

```ts
/**
 * Plugin sandbox entry — runs in Figma's plugin runtime (no DOM).
 *
 * Subsequent tasks fill in the wiring. This stub keeps the build green.
 */
export {};
```

`src/ui/main.tsx`:

```tsx
import "./styles.css";

// Bootstraps the iframe React app. Wired in Task 4.10.
const root = document.getElementById("root");
if (root) root.textContent = "bridge-plugin: scaffold";
```

`src/ui/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Figma MCP Bridge</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

`src/ui/styles.css`:

```css
@import "tailwindcss";
```

**Step 8: Verify**

`bun install` — picks up new deps.
`bun run --filter @repo/bridge-plugin lint` — clean.
`bun run --filter @repo/bridge-plugin types` — clean.
`bun run --filter @repo/bridge-plugin test` — passes (passWithNoTests).
`bun run --filter @repo/bridge-plugin build` — produces `dist/plugin.js` and `dist/index.html`.

If `vite build` errors on PostCSS/Tailwind missing, ensure `@tailwindcss/vite` is in devDeps.

**Step 9: Commit**

```bash
git add apps/bridge-plugin bun.lock
git commit -m "feat(bridge-plugin): scaffold apps/bridge-plugin with Vite + React"
```

---

## Task 4.6: `BridgePluginRuntime` — plugin connect/handshake/dispatch (TDD)

**(Runs AFTER Task 4.7's scaffold lands.)**

**Goal:** A reusable runtime class for the plugin-side of the connection. Owns the WS message handler, performs the handshake, dispatches incoming requests against registered plugin handlers. Tests use the in-memory transport pair from `@repo/transport/testing` — no real WS in this task.

> **Where it lives:** Inside `apps/bridge-plugin/src/runtime.ts`. Despite being in an app, it's pure logic — testable with vitest.

**Files:**
- Create: `apps/bridge-plugin/src/runtime.ts`
- Create: `apps/bridge-plugin/src/__tests__/runtime.test.ts`

**Step 1: Tests**

```ts
// apps/bridge-plugin/src/__tests__/runtime.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "@repo/protocol";
import { FigmaFake } from "@repo/figma-adapter/testing";
import { createInMemoryTransportPair } from "@repo/transport/testing";
import { BridgePluginRuntime } from "../runtime";

const Echo = defineTool({
  name: "echo",
  description: "echo",
  streaming: false,
  input: z.object({ msg: z.string() }),
  output: z.object({ msg: z.string() }),
});

describe("BridgePluginRuntime", () => {
  it("answers a handshake-request with a handshake-response", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    runtime.start();

    const response = await new Promise<{ accepted: boolean; protocolVersion: number }>((resolve) => {
      daemonSide.onMessage((env) => {
        if (env.kind === "handshake-response") resolve(env as never);
      });
      void daemonSide.send({
        kind: "handshake-request",
        serverVersion: "0.0.0",
        protocolVersion: 1,
      } as never);
    });

    expect(response.accepted).toBe(true);
    expect(response.protocolVersion).toBe(1);
  });

  it("dispatches an incoming RequestEnvelope to the registered plugin handler", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    runtime.register(Echo, async (args) => ({ msg: args.msg.toUpperCase() }));
    runtime.start();

    const responses: unknown[] = [];
    daemonSide.onMessage((env) => {
      if (env.kind === "response") responses.push(env);
    });
    await daemonSide.send({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "echo",
      args: { msg: "hi" },
    } as never);

    await new Promise((r) => setTimeout(r, 50));
    expect(responses).toHaveLength(1);
    expect((responses[0] as { result: { msg: string } }).result.msg).toBe("HI");
  });

  it("emits an ErrorEnvelope when an unknown tool is requested", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    runtime.start();

    const errors: unknown[] = [];
    daemonSide.onMessage((env) => {
      if (env.kind === "error") errors.push(env);
    });
    await daemonSide.send({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "nope",
      args: {},
    } as never);

    await new Promise((r) => setTimeout(r, 50));
    expect(errors).toHaveLength(1);
    expect((errors[0] as { code: string }).code).toBe("E_PROTOCOL_UNKNOWN_TOOL");
  });

  it("emits an ErrorEnvelope when input validation fails", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    runtime.register(Echo, async (args) => ({ msg: args.msg }));
    runtime.start();

    const errors: unknown[] = [];
    daemonSide.onMessage((env) => {
      if (env.kind === "error") errors.push(env);
    });
    await daemonSide.send({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "echo",
      args: { msg: 123 } as never,
    } as never);

    await new Promise((r) => setTimeout(r, 50));
    expect((errors[0] as { code: string }).code).toBe("E_PROTOCOL_INVALID");
  });
});
```

Run: FAIL.

**Step 2: Implement**

```ts
// apps/bridge-plugin/src/runtime.ts
import type { FigmaAdapter } from "@repo/figma-adapter";
import {
  type Envelope,
  type ErrorEnvelope,
  ErrorCode,
  type HandshakeRequestEnvelope,
  type HandshakeResponseEnvelope,
  type Logger,
  type Pack,
  PROTOCOL_VERSION,
  type PluginHandler,
  type RequestEnvelope,
  type ResponseEnvelope,
  type ToolDefinition,
} from "@repo/protocol";
import type { Transport } from "@repo/transport";

export interface BridgePluginRuntimeOptions {
  readonly transport: Transport;
  readonly version: string;
  readonly figma: FigmaAdapter;
  readonly logger?: Logger;
}

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

interface Entry {
  tool: ToolDefinition;
  handler: PluginHandler<ToolDefinition>;
}

export class BridgePluginRuntime {
  private readonly transport: Transport;
  private readonly version: string;
  private readonly figma: FigmaAdapter;
  private readonly logger: Logger;
  private readonly entries = new Map<string, Entry>();

  constructor(options: BridgePluginRuntimeOptions) {
    this.transport = options.transport;
    this.version = options.version;
    this.figma = options.figma;
    this.logger = options.logger ?? noopLogger;
  }

  register<T extends ToolDefinition>(tool: T, handler: PluginHandler<T>): void {
    this.entries.set(tool.name, {
      tool,
      handler: handler as unknown as PluginHandler<ToolDefinition>,
    });
  }

  registerPack(pack: Pack): void {
    pack.registerPlugin?.({
      register: <T extends ToolDefinition>(t: T, h: PluginHandler<T>) => this.register(t, h),
    });
  }

  start(): void {
    this.transport.onMessage((env) => {
      void this.handle(env);
    });
  }

  private async handle(env: Envelope): Promise<void> {
    if ((env as unknown as { kind: string }).kind === "handshake-request") {
      const req = env as unknown as HandshakeRequestEnvelope;
      const response: HandshakeResponseEnvelope = {
        kind: "handshake-response",
        clientVersion: this.version,
        protocolVersion: PROTOCOL_VERSION,
        accepted: req.protocolVersion === PROTOCOL_VERSION,
      };
      await this.transport.send(response as never);
      return;
    }
    if (env.kind === "request") {
      await this.dispatch(env);
    }
  }

  private async dispatch(req: RequestEnvelope): Promise<void> {
    const entry = this.entries.get(req.tool);
    if (!entry) {
      const err: ErrorEnvelope = {
        kind: "error",
        id: req.id,
        ok: false,
        code: ErrorCode.E_PROTOCOL_UNKNOWN_TOOL,
        category: "protocol",
        message: `unknown tool: ${req.tool}`,
      };
      await this.transport.send(err);
      return;
    }
    try {
      const parsedInput = entry.tool.input.safeParse(req.args);
      if (!parsedInput.success) {
        const err: ErrorEnvelope = {
          kind: "error",
          id: req.id,
          ok: false,
          code: ErrorCode.E_PROTOCOL_INVALID,
          category: "protocol",
          message: `invalid input for ${req.tool}: ${parsedInput.error.message}`,
        };
        await this.transport.send(err);
        return;
      }
      const result = await entry.handler(parsedInput.data, {
        logger: this.logger,
        figma: this.figma,
      });
      const parsedOutput = entry.tool.output.safeParse(result);
      if (!parsedOutput.success) {
        const err: ErrorEnvelope = {
          kind: "error",
          id: req.id,
          ok: false,
          code: ErrorCode.E_PROTOCOL_OUTPUT_INVALID,
          category: "protocol",
          message: `invalid output from ${req.tool}: ${parsedOutput.error.message}`,
        };
        await this.transport.send(err);
        return;
      }
      const response: ResponseEnvelope = {
        kind: "response",
        id: req.id,
        ok: true,
        result: parsedOutput.data,
      };
      await this.transport.send(response);
    } catch (err) {
      const errEnv: ErrorEnvelope = {
        kind: "error",
        id: req.id,
        ok: false,
        code: ErrorCode.E_FIGMA_UNKNOWN,
        category: "figma",
        message: err instanceof Error ? err.message : String(err),
      };
      await this.transport.send(errEnv);
    }
  }
}
```

> **Why not reuse `PluginRegistryImpl`?** The class is structurally similar but has a different calling convention (returns values vs. sends responses on the wire). Duplicating ~30 lines is cheaper than refactoring the registry to support both modes. If a third use case appears, extract.

**Step 3: Run tests, commit**

```bash
git add apps/bridge-plugin/src/runtime.ts apps/bridge-plugin/src/__tests__/runtime.test.ts
git commit -m "feat(bridge-plugin): runtime handles handshake and dispatches plugin tools"
```

---

## Task 4.8: Wire `tools-extract` handlers into the bridge-plugin entry

**Files:**
- Modify: `apps/bridge-plugin/src/plugin.ts`
- Create: `apps/bridge-plugin/src/__tests__/plugin-entry.test.ts` (smoke test that the entry constructs without throwing — full pipeline tested in Task 4.11)

**Step 1: Implement the entry**

```ts
// apps/bridge-plugin/src/plugin.ts
import { RealFigmaAdapter } from "@repo/figma-adapter";
import {
  ExtractComponents,
  ExtractLocalVariables,
  ExtractStyles,
  extractComponentsPluginHandler,
  extractLocalVariablesPluginHandler,
  extractStylesPluginHandler,
} from "@repo/tools-extract";
import { WebSocketClientTransport } from "@repo/transport";
import { BridgePluginRuntime } from "./runtime";

const VERSION = "0.0.0";

export async function start(): Promise<void> {
  const transport = await WebSocketClientTransport.connect({
    url: "ws://127.0.0.1:9223",
    WebSocketCtor: globalThis.WebSocket as never,
  });
  const runtime = new BridgePluginRuntime({
    transport,
    version: VERSION,
    figma: new RealFigmaAdapter(),
  });
  runtime.register(ExtractStyles, extractStylesPluginHandler);
  runtime.register(ExtractComponents, extractComponentsPluginHandler);
  runtime.register(ExtractLocalVariables, extractLocalVariablesPluginHandler);
  runtime.start();
}

start().catch((err) => {
  console.error("bridge-plugin: fatal error in connection:", err);
});
```

> **Why export `start`:** the smoke test imports the module, which would otherwise auto-invoke `start()` and try to open a real WS. Exporting + invoking-at-bottom is a compromise: production runs `start()` once, tests can `import` without triggering the side effect IF the test imports the named export instead of the default. Better still: move the bottom invocation to a separate `bootstrap.ts` (see Step 2).

**Step 2: Refactor — bootstrap separate from module**

Replace the bottom `start().catch(...)` with a separate bootstrap file:

```ts
// apps/bridge-plugin/src/plugin.ts (final shape)
// ... imports ...
export async function start(): Promise<void> {
  // ... as above, NO bottom invocation ...
}
```

```ts
// apps/bridge-plugin/src/plugin-bootstrap.ts
import { start } from "./plugin";

start().catch((err) => {
  console.error("bridge-plugin: fatal error in connection:", err);
});
```

Update `apps/bridge-plugin/vite.config.plugin.ts`:

```ts
// change `entry: "src/plugin.ts"` to:
entry: "src/plugin-bootstrap.ts",
```

> Now the module-level test can import `./plugin` without triggering the connect.

**Step 3: Smoke test**

```ts
// apps/bridge-plugin/src/__tests__/plugin-entry.test.ts
import { describe, expect, it } from "vitest";
import { start } from "../plugin";

describe("plugin-entry import smoke", () => {
  it("exports a start function", () => {
    expect(typeof start).toBe("function");
  });
});
```

**Step 4: Run tests, commit**

```bash
git add apps/bridge-plugin/src/plugin.ts apps/bridge-plugin/src/plugin-bootstrap.ts apps/bridge-plugin/src/__tests__/plugin-entry.test.ts apps/bridge-plugin/vite.config.plugin.ts
git commit -m "feat(bridge-plugin): wire tools-extract handlers into plugin entry"
```

---

## Task 4.9: `figma.manifest.ts` with narrow `allowedDomains`

**Files:**
- Create: `apps/bridge-plugin/figma.manifest.ts`
- Modify: `apps/bridge-plugin/vite.config.plugin.ts` (emit `dist/manifest.json` from the TS source)

**Step 1: `figma.manifest.ts`**

```ts
// apps/bridge-plugin/figma.manifest.ts
//
// Source-of-truth for the Figma plugin manifest. The Vite plugin build
// converts this TS export into `dist/manifest.json` at build time.
//
// `allowedDomains` is intentionally narrow:
//   - `ws://127.0.0.1:9223` for the local daemon
//
// Phase 6 will append `wss://*.our-relay-domain.com` for cloud pairing.
// Until then, this is the only allowed network endpoint.

export const manifest = {
  name: "Figma MCP Bridge",
  id: "BRIDGE-PLUGIN-PLACEHOLDER-ID", // replace with the real ID before publishing
  api: "1.0.0",
  main: "plugin.js",
  ui: "index.html",
  editorType: ["figma", "figjam", "slides"] as const,
  networkAccess: {
    allowedDomains: ["ws://127.0.0.1:9223"] as const,
    reasoning:
      "Connects to the figma-mcp daemon on the user's machine to serve tool requests.",
  },
} as const;

export default manifest;
```

**Step 2: Vite emits `manifest.json`**

```ts
// apps/bridge-plugin/vite.config.plugin.ts
import { writeFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";
import manifest from "./figma.manifest";

const emitManifest = (): Plugin => ({
  name: "emit-figma-manifest",
  apply: "build",
  closeBundle: async () => {
    await writeFile("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  },
});

export default defineConfig({
  plugins: [emitManifest()],
  build: {
    lib: {
      entry: "src/plugin-bootstrap.ts",
      formats: ["iife"],
      name: "BridgePlugin",
      fileName: () => "plugin.js",
    },
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      output: { extend: true },
    },
  },
});
```

**Step 3: Verify**

`bun run --filter @repo/bridge-plugin build` — emits `apps/bridge-plugin/dist/manifest.json`.

```bash
cat apps/bridge-plugin/dist/manifest.json
```

Confirm `allowedDomains` is `["ws://127.0.0.1:9223"]`, `editorType` is the three-element tuple, `main: "plugin.js"`, `ui: "index.html"`.

**Step 4: Commit**

```bash
git add apps/bridge-plugin/figma.manifest.ts apps/bridge-plugin/vite.config.plugin.ts
git commit -m "feat(bridge-plugin): manifest with narrow allowedDomains for the local daemon"
```

---

## Task 4.10: Minimal status panel UI iframe

**Goal:** A single React component showing the connection state. Communicates with the plugin sandbox via `figma.ui.postMessage` (one-way for now).

**Files:**
- Create: `apps/bridge-plugin/src/ui/App.tsx`
- Create: `apps/bridge-plugin/src/ui/__tests__/App.test.tsx`
- Modify: `apps/bridge-plugin/src/ui/main.tsx` (mount `<App />`)
- Modify: `apps/bridge-plugin/src/plugin.ts` (post connection state to `figma.ui` after each transition; show the UI)

**Step 1: Component**

```tsx
// apps/bridge-plugin/src/ui/App.tsx
import { useEffect, useState } from "react";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "version-mismatch";

export function App(): JSX.Element {
  const [state, setState] = useState<ConnectionState>("disconnected");

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const data = (event.data as { pluginMessage?: { kind?: string; state?: ConnectionState } } | null)
        ?.pluginMessage;
      if (data?.kind === "connection-state" && data.state) setState(data.state);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  return (
    <div className="p-4 text-sm font-medium" data-testid="status-panel">
      <div>Figma MCP Bridge</div>
      <div className="mt-2 text-xs opacity-70">{state}</div>
    </div>
  );
}
```

**Step 2: Test**

```tsx
// apps/bridge-plugin/src/ui/__tests__/App.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { App } from "../App";

describe("App status panel", () => {
  it("renders 'disconnected' by default", () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId("status-panel").textContent).toContain("disconnected");
  });
  it("updates to 'connected' on a postMessage", () => {
    const { getByTestId } = render(<App />);
    fireEvent(
      window,
      new MessageEvent("message", {
        data: { pluginMessage: { kind: "connection-state", state: "connected" } },
      }),
    );
    expect(getByTestId("status-panel").textContent).toContain("connected");
  });
});
```

**Step 3: Mount in `main.tsx`**

```tsx
// apps/bridge-plugin/src/ui/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("UI root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Step 4: Plugin sandbox posts state**

In `apps/bridge-plugin/src/plugin.ts`, update `start()`:

```ts
export async function start(): Promise<void> {
  figma.showUI(__html__, { width: 320, height: 200 });

  const post = (state: "disconnected" | "connecting" | "connected" | "version-mismatch") =>
    figma.ui.postMessage({ kind: "connection-state", state });

  post("connecting");
  try {
    const transport = await WebSocketClientTransport.connect({
      url: "ws://127.0.0.1:9223",
      WebSocketCtor: globalThis.WebSocket as never,
    });
    const runtime = new BridgePluginRuntime({
      transport,
      version: VERSION,
      figma: new RealFigmaAdapter(),
    });
    runtime.register(ExtractStyles, extractStylesPluginHandler);
    runtime.register(ExtractComponents, extractComponentsPluginHandler);
    runtime.register(ExtractLocalVariables, extractLocalVariablesPluginHandler);
    runtime.start();
    post("connected");
  } catch (err) {
    post("disconnected");
    throw err;
  }
}
```

> The `__html__` global is provided by Figma's plugin runtime — it's the inlined contents of `dist/index.html` (the UI iframe HTML). Your tsconfig's `@figma/plugin-typings` declares it.

**Step 5: Run tests**

`bun run --filter @repo/bridge-plugin test` — App tests pass; plugin-entry smoke still passes.

**Step 6: Commit**

```bash
git add apps/bridge-plugin/src/ui/App.tsx apps/bridge-plugin/src/ui/__tests__/App.test.tsx apps/bridge-plugin/src/ui/main.tsx apps/bridge-plugin/src/plugin.ts
git commit -m "feat(bridge-plugin): status panel UI with connection state from sandbox"
```

---

## Task 4.11: End-to-end test — in-memory plugin → daemon WS → tool dispatch

**Goal:** A test in `apps/mcp-server` that:
- Starts a real `Daemon` with `wsPort: 0`.
- Opens a `WebSocketClientTransport` from inside the test (acting as the "plugin").
- Spins up a `BridgePluginRuntime` registered with all 3 extract plugin handlers + a seeded `FigmaFake`.
- Drives MCP tool calls through the stdio shim → daemon → WS → runtime → response.
- Verifies the daemon's WS routing (Task 4.5) end-to-end.

> **Cross-package test:** this test imports from both `@repo/mcp-server` and `@repo/bridge-plugin`. Add `@repo/bridge-plugin` as a devDep in `apps/mcp-server/package.json`.

**Files:**
- Create: `apps/mcp-server/src/__tests__/e2e-ws-plugin.test.ts`
- Modify: `apps/mcp-server/package.json` (add `@repo/bridge-plugin` devDep)

**Step 1: Test**

```ts
// apps/mcp-server/src/__tests__/e2e-ws-plugin.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import {
  BridgeStatus,
  ExtractComponents,
  ExtractLocalVariables,
  ExtractStyles,
  createBridgeStatusServerHandler,
  extractComponentsPluginHandler,
  extractLocalVariablesPluginHandler,
  extractStylesPluginHandler,
} from "@repo/tools-extract";
import { WebSocketClientTransport } from "@repo/transport";
import { BridgePluginRuntime } from "@repo/bridge-plugin/src/runtime";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";

describe("e2e: AI client → stdio shim → daemon (WS) → in-memory plugin", () => {
  it("extract_styles flows through the WS plugin path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-e2e-ws-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0,
      figma: new FigmaFake(), // unused — WS plugin overrides
      version: "0.0.0",
      packs: [
        {
          name: "tools-extract-server-only",
          tools: [BridgeStatus, ExtractStyles, ExtractComponents, ExtractLocalVariables],
          registerServer: (reg) =>
            reg.register(
              BridgeStatus,
              createBridgeStatusServerHandler({
                getDaemonInfo: () => ({ pid: process.pid, version: "0.0.0", uptimeMs: 0 }),
                getPluginState: () => ({ connected: daemon.isPluginConnected }),
              }),
            ),
          // No registerPlugin — the WS plugin handles them.
        },
      ],
    });

    // The "plugin": connect via WS, run handshake, register handlers.
    const figma = new FigmaFake();
    figma.__seedPaintStyles([{ id: "p1", name: "primary", type: "PAINT", paints: [] }]);
    figma.__seedTextStyles([
      {
        id: "t1",
        name: "body",
        type: "TEXT",
        fontName: { family: "Inter", style: "Regular" },
        fontSize: 14,
      },
    ]);
    figma.__seedEffectStyles([{ id: "e1", name: "shadow", type: "EFFECT", effects: [] }]);
    figma.__seedComponents([{ id: "c1", name: "Button", key: "btn" }]);

    const wsTransport = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${daemon.wsPort}`,
      WebSocketCtor: WebSocket as never,
    });
    const runtime = new BridgePluginRuntime({
      transport: wsTransport,
      version: "0.0.0",
      figma,
    });
    runtime.register(ExtractStyles, extractStylesPluginHandler);
    runtime.register(ExtractComponents, extractComponentsPluginHandler);
    runtime.register(ExtractLocalVariables, extractLocalVariablesPluginHandler);
    runtime.start();

    // Wait for handshake to complete daemon-side.
    const start = Date.now();
    while (!daemon.isPluginConnected && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(daemon.isPluginConnected).toBe(true);

    // Drive an MCP tool call through the stdio shim.
    const shim = await createStdioShim({
      socketPath,
      sourceClientId: "e2e-shim",
      tools: [BridgeStatus, ExtractStyles, ExtractComponents, ExtractLocalVariables],
      mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
    });
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await shim.connectMcp(serverT);
    const client = new Client({ name: "e2e-ws", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientT);

    const r = await client.callTool({ name: "extract_styles", arguments: {} });
    expect(JSON.stringify(r)).toContain("primary");
    expect(JSON.stringify(r)).toContain("body");

    await shim.stop();
    await wsTransport.close();
    await daemon.stop();
  });
});
```

> The `BridgePluginRuntime` import path `@repo/bridge-plugin/src/runtime` works because vitest resolves workspace packages by their TS sources. If your monorepo requires an `exports` map entry, add a `"./src/runtime"` entry to bridge-plugin's `package.json` exports.

**Step 2: Add devDep**

`apps/mcp-server/package.json` devDependencies:

```json
"@repo/bridge-plugin": "workspace:*"
```

Run `bun install`.

**Step 3: Run tests**

`bun run --filter @repo/mcp-server test e2e-ws-plugin` — passes.
`bun run test` (root) — all packages green.

**Step 4: Commit**

```bash
git add apps/mcp-server/src/__tests__/e2e-ws-plugin.test.ts apps/mcp-server/package.json bun.lock
git commit -m "test(mcp-server): end-to-end WS plugin path with BridgePluginRuntime"
```

---

## Task 4.12: Coverage gate + Phase 4 changeset + acceptance

**Files:**
- Create: `.changeset/phase-4-bridge-plugin.md`

**Step 1: Coverage on each new package + app**

```bash
bun run --filter @repo/figma-adapter test --coverage
bun run --filter @repo/protocol test --coverage
bun run --filter @repo/mcp-server test --coverage
bun run --filter @repo/bridge-plugin test --coverage
```

Confirm thresholds:
- `@repo/figma-adapter`: ≥90/85/90/90 (was 100; `RealFigmaAdapter` may drop it slightly).
- `@repo/protocol`: ≥95/90/95/95 (Phase 1 thresholds; the new `handshake.ts` should hit 100).
- `@repo/mcp-server`: ≥80/75/80/80.
- `@repo/bridge-plugin`: ≥80/75/80/80.

If any falls short, add a targeted test rather than relaxing the threshold.

**Step 2: Root acceptance**

```bash
bun run lint
bun run types
bun run test
```

All three pass.

**Step 3: Verify the build artifacts**

```bash
bun run --filter @repo/bridge-plugin build
ls apps/bridge-plugin/dist/
```

Confirm `dist/` contains:
- `plugin.js` (sandbox bundle)
- `index.html` (singlefile UI iframe)
- `manifest.json` (from `figma.manifest.ts`)

**Step 4: Verify `allowedDomains` is narrow**

```bash
cat apps/bridge-plugin/dist/manifest.json
```

Should show `"allowedDomains": ["ws://127.0.0.1:9223"]` and `"reasoning": "..."`.

**Step 5: Write the changeset**

Create `.changeset/phase-4-bridge-plugin.md`:

```markdown
---
"@repo/bridge-plugin": minor
"@repo/mcp-server": minor
"@repo/protocol": minor
"@repo/figma-adapter": minor
---

Phase 4: bridge plugin replaces the deleted apps/design-plugin.

- @repo/bridge-plugin (apps/bridge-plugin) — Figma plugin with WS
  client transport, BridgePluginRuntime (handshake + dispatch loop),
  React status panel UI, narrow allowedDomains manifest. Vite produces
  dist/plugin.js + dist/index.html + dist/manifest.json.
- @repo/mcp-server — Daemon now binds a WebSocket server (default
  127.0.0.1:9223), performs version handshake on plugin connect, and
  routes plugin-tool requests over WS when a plugin is connected
  (with in-process FigmaFake fallback for tests).
- @repo/protocol — adds HandshakeRequest/Response envelopes; the
  Envelope discriminated union now includes them.
- @repo/figma-adapter — adds RealFigmaAdapter wrapping the figma
  global, alongside FigmaFake.

Verified end-to-end (in-memory WS plugin path through the stdio shim).
No published package consumes these yet — all `private: true`.
```

**Step 6: Commit**

```bash
git add .changeset/phase-4-bridge-plugin.md
git commit -m "chore(changeset): record Phase 4 bridge plugin"
```

**Step 7: Final acceptance pass**

```bash
bun run lint && bun run types && bun run test
git log --oneline | head -25
```

Spot-check that Phase 4 commits read cleanly.

**Phase 4 done.** The bridge plugin connects to the daemon, handshakes, and serves tools-extract handlers backed by a real-figma adapter. Phase 5 builds streaming variables on top.

---

## Notes on Execution

**Execution order:** 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → **4.7** → **4.6** → 4.8 → 4.9 → 4.10 → 4.11 → 4.12. Task 4.6 depends on `apps/bridge-plugin/` existing (Task 4.7), so swap.

**TDD discipline:** every task with logic follows red → green → commit. Pure infra tasks (4.7 scaffold, 4.9 manifest, 4.12 acceptance) skip the red step.

**Manifest plugin id:** `BRIDGE-PLUGIN-PLACEHOLDER-ID` is a placeholder. Replace with the real Figma-issued id before submitting to the Plugin Community in Phase 9.

**`@figma/plugin-typings`:** added as devDep in two places (`@repo/figma-adapter` for `RealFigmaAdapter` types, `apps/bridge-plugin` for the plugin entry). Both reference the global `figma` and `__html__`. The version `^1.111.0` is approximate — check npm at execution time.

**`figma.variables.getLocalVariablesAsync`:** the modern API path is `figma.variables.*`. Tests for `RealFigmaAdapter` stub the modern API. If the `@figma/plugin-typings` version pinned doesn't yet expose `figma.variables`, fall back to the legacy `figma.getLocalVariablesAsync()` and update later.

**Network in tests:** Task 4.4/4.5/4.11 open real WS sockets. Use `wsPort: 0` for ephemeral ports — never hardcode `9223` in tests (port collision risk with concurrent test runs and any straggler daemon from Task 3.16).

**Smoke testing in real Figma (manual):** the design doc calls for "End-to-end smoke test: real plugin in Figma Desktop talking to a real daemon (manual test, recorded as a video for the README)." This is out of scope for Phase 4's automated tests — it's a release-time verification step. Track it as a Phase 9 deliverable.

**Out of scope reminders:**
- No streaming variables — Phase 5.
- No cloud relay / pairing flow — Phase 6.
- No setup CLI / `figma-mcp doctor` — Phase 7.
- No additional packs — Phase 8.
- Don't add features to `RealFigmaAdapter` beyond what `tools-extract` needs.

---

## References

- Predecessor plans: `docs/plans/2026-05-06-figma-mcp-rewrite-plan.md`, `docs/plans/2026-05-06-figma-mcp-phase-2.md`, `docs/plans/2026-05-06-figma-mcp-phase-3.md`.
- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md`.
- [`@figma/plugin-typings`](https://www.npmjs.com/package/@figma/plugin-typings)
- [`vite-plugin-singlefile`](https://github.com/richardtallent/vite-plugin-singlefile)
- [Figma Plugin Manifest reference](https://developers.figma.com/docs/plugins/manifest/)
- [Figma Variables API](https://developers.figma.com/docs/plugins/api/properties/figma-variables/)
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
