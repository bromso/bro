# Figma MCP Phase 3 — Daemon + Canonical Feature Pack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring `apps/mcp-server` online with the daemon model and IPC scaffolding. Build `@repo/tools-extract` as the canonical feature pack — 4 tools (`extract_styles`, `extract_components`, `extract_local_variables`, `bridge_status`) that prove the full pipeline AI client → MCP stdio shim → daemon (over Unix socket IPC) → plugin handler → response. No real Figma plugin yet — plugin handlers run in-process against `FigmaFake`. Phase 4 introduces the bridge plugin.

**Architecture:**
- `apps/mcp-server` is a single binary with two modes selected at startup. **Stdio shim mode** (default; what the AI client spawns): runs an `@modelcontextprotocol/sdk` server over stdio, forwards every tool call over a Unix domain socket to the daemon, returns the result to the AI. **Daemon mode** (forked from the first stdio invocation, detached): owns the IPC socket and the WS port, holds the tool registries, runs plugin handlers in-process for Phase 3.
- Single-instance is enforced by a lockfile at `~/.figma-mcp/daemon.lock` (PID + version + socket path). The shim checks the lockfile, verifies the PID is alive, and either connects or forks a fresh daemon.
- A new `UnixSocketServerTransport` and `UnixSocketClientTransport` in `@repo/transport` reuse the existing `Transport` contract (newline-delimited JSON envelopes over the socket).
- `@repo/tools-extract` is the canonical pack pattern. Every later pack (`-design`, `-figjam`, etc. in Phase 8) follows its shape: a single file exports a `Pack` whose `tools[]` are `defineTool(...)` calls with input/output Zod schemas, and `registerServer` / `registerPlugin` callbacks attach handlers.

**Tech Stack:** TypeScript, Bun, Vitest 4.1.4, `@repo/protocol` / `@repo/transport` / `@repo/figma-adapter` (Phase 1+2), `@modelcontextprotocol/sdk` 1.x, Node `net` module (Unix sockets), Node `child_process.spawn` (daemon fork), Biome.

**Predecessors:** Phase 1 (`@repo/protocol`) and Phase 2 (`@repo/transport`, `@repo/figma-adapter`) are merged. The `Transport`, `Correlator`, `WebSocketServerTransport`, `withReconnect`, `FigmaAdapter`, and `FigmaFake` exports are stable.

---

## Acceptance Criteria

- `apps/mcp-server` exists, builds via `bun run build` (or runs JIT with `bun apps/mcp-server/src/main.ts`), lints clean, types clean.
- `@repo/tools-extract` exists, builds, lints clean, types clean.
- `bun run test` passes with ≥85% coverage on `apps/mcp-server` (handlers + daemon code) and ≥90% on `@repo/tools-extract`.
- Single-instance daemon model verified on macOS and Linux: a fresh stdio invocation with no daemon running forks one and connects to it; a second stdio invocation re-uses the existing daemon. Stale lockfile (dead PID) is recovered automatically.
- All 4 `@repo/tools-extract` tools work end-to-end: stdio shim → daemon → in-process plugin handler → response. Verified with both an in-memory integration test and a real-process spawn test.
- The MCP SDK glue (`@modelcontextprotocol/sdk` server) registers each tool's input/output Zod schema and surfaces tool-level errors (`Figma`, `Stream`, `Protocol` categories) as MCP tool results with `isError: true`. Catastrophic errors (`Transport`, `Daemon`, `Relay`) become JSON-RPC error responses.
- `FigmaAdapter` extended with `getLocalPaintStylesAsync`, `getLocalTextStylesAsync`, `getLocalEffectStylesAsync`, and `getLocalComponentsAsync`. `FigmaFake` implements the new methods. The figma-adapter coverage stays at 100%.
- A changeset records Phase 3 with minor bumps for the affected packages.
- Commit hygiene: each task ends with one conventional-commit-formatted commit. No multi-task commits. `git add` specific files, never `git add -A`.

---

## Task Map

| # | Task | Package / App | Type |
|---|------|---------------|------|
| 3.1 | Extend `FigmaAdapter` for styles + components | figma-adapter | code |
| 3.2 | Scaffold `@repo/tools-extract` | tools-extract | infra |
| 3.3 | Scaffold `apps/mcp-server` | mcp-server | infra |
| 3.4 | Define tool schemas in `tools-extract` (TDD) | tools-extract | code |
| 3.5 | Implement plugin handlers for the 3 extract tools (TDD) | tools-extract | code |
| 3.6 | Implement `bridge_status` server handler (TDD) | tools-extract | code |
| 3.7 | Implement `ServerRegistryImpl` (TDD) | mcp-server | code |
| 3.8 | Implement `PluginRegistryImpl` (TDD) | mcp-server | code |
| 3.9 | Implement `UnixSocketServerTransport` + `UnixSocketClientTransport` (TDD) | transport | code |
| 3.10 | Implement lockfile manager (TDD) | mcp-server | code |
| 3.11 | Implement `Daemon` orchestrator (TDD) | mcp-server | code |
| 3.12 | Implement MCP server bridge (Zod → MCP SDK; TDD) | mcp-server | code |
| 3.13 | Implement stdio shim entrypoint (TDD) | mcp-server | code |
| 3.14 | First-invocation fork orchestration (TDD with stub `spawn`) | mcp-server | code |
| 3.15 | End-to-end in-memory integration test | mcp-server | tests |
| 3.16 | Real-process spawn smoke test (CI-stable) | mcp-server | tests |
| 3.17 | Coverage gate + Phase 3 changeset + acceptance | repo | infra |

---

## Task 3.1: Extend `FigmaAdapter` for styles + components

**Why first:** `tools-extract`'s plugin handlers depend on this surface; the adapter must support what we'll be wiring tools to call.

**Files:**
- Modify: `packages/figma-adapter/src/adapter.ts`
- Modify: `packages/figma-adapter/src/figma-fake.ts`
- Modify: `packages/figma-adapter/src/__tests__/adapter.test.ts`
- Modify: `packages/figma-adapter/src/__tests__/figma-fake.test.ts`

**Step 1: Update the type contract test (TDD red)**

Append to `packages/figma-adapter/src/__tests__/adapter.test.ts` four new `it` blocks asserting the methods + new types exist:

```ts
import type {
  PaintStyle,
  TextStyle,
  EffectStyle,
  Component,
} from "../adapter";

describe("FigmaAdapter (extended Phase 3 surface)", () => {
  it("declares getLocalPaintStylesAsync", () => {
    expectTypeOf<FigmaAdapter["getLocalPaintStylesAsync"]>().returns.resolves.toEqualTypeOf<PaintStyle[]>();
  });
  it("declares getLocalTextStylesAsync", () => {
    expectTypeOf<FigmaAdapter["getLocalTextStylesAsync"]>().returns.resolves.toEqualTypeOf<TextStyle[]>();
  });
  it("declares getLocalEffectStylesAsync", () => {
    expectTypeOf<FigmaAdapter["getLocalEffectStylesAsync"]>().returns.resolves.toEqualTypeOf<EffectStyle[]>();
  });
  it("declares getLocalComponentsAsync", () => {
    expectTypeOf<FigmaAdapter["getLocalComponentsAsync"]>().returns.resolves.toEqualTypeOf<Component[]>();
  });
});
```

Run `bun run --filter @repo/figma-adapter types` — should fail with `PaintStyle/TextStyle/EffectStyle/Component` not found.

**Step 2: Add the new types + methods to `adapter.ts`**

```ts
export interface StyleBase {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

/** Paint style (fills, e.g. solid colors, gradients). */
export interface PaintStyle extends StyleBase {
  readonly type: "PAINT";
  readonly paints: readonly Readonly<{ type: string; visible?: boolean }>[];
}

/** Text style (font + size + line height + tracking). */
export interface TextStyle extends StyleBase {
  readonly type: "TEXT";
  readonly fontName: { family: string; style: string };
  readonly fontSize: number;
  readonly lineHeight?: { value: number; unit: "PIXELS" | "PERCENT" } | { unit: "AUTO" };
  readonly letterSpacing?: { value: number; unit: "PIXELS" | "PERCENT" };
}

/** Effect style (drop shadows, blurs). */
export interface EffectStyle extends StyleBase {
  readonly type: "EFFECT";
  readonly effects: readonly Readonly<{ type: string; visible?: boolean }>[];
}

/** Component metadata (no node tree — keep it light). */
export interface Component {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly description?: string;
}
```

Add these methods to `FigmaAdapter`:

```ts
export interface FigmaAdapter {
  // ...existing members...
  getLocalPaintStylesAsync(): Promise<PaintStyle[]>;
  getLocalTextStylesAsync(): Promise<TextStyle[]>;
  getLocalEffectStylesAsync(): Promise<EffectStyle[]>;
  getLocalComponentsAsync(): Promise<Component[]>;
}
```

Re-export the new types from `index.ts`.

Run types — adapter test passes. `figma-fake.ts` will fail to compile (new methods missing).

**Step 3: Implement on `FigmaFake` + add seed hooks (TDD red → green)**

Append failing tests to `figma-fake.test.ts`:

```ts
describe("FigmaFake.getLocalPaintStylesAsync", () => {
  it("returns seeded paint styles", async () => {
    const fake = new FigmaFake();
    fake.__seedPaintStyles([
      { id: "p1", name: "primary", type: "PAINT", paints: [{ type: "SOLID" }] },
    ]);
    expect(await fake.getLocalPaintStylesAsync()).toHaveLength(1);
  });
});

describe("FigmaFake.getLocalTextStylesAsync", () => {
  it("returns seeded text styles", async () => {
    const fake = new FigmaFake();
    fake.__seedTextStyles([
      {
        id: "t1",
        name: "body",
        type: "TEXT",
        fontName: { family: "Inter", style: "Regular" },
        fontSize: 16,
      },
    ]);
    expect((await fake.getLocalTextStylesAsync())[0].fontName.family).toBe("Inter");
  });
});

describe("FigmaFake.getLocalEffectStylesAsync", () => {
  it("returns seeded effect styles", async () => {
    const fake = new FigmaFake();
    fake.__seedEffectStyles([
      { id: "e1", name: "shadow", type: "EFFECT", effects: [{ type: "DROP_SHADOW" }] },
    ]);
    expect(await fake.getLocalEffectStylesAsync()).toHaveLength(1);
  });
});

describe("FigmaFake.getLocalComponentsAsync", () => {
  it("returns seeded components", async () => {
    const fake = new FigmaFake();
    fake.__seedComponents([{ id: "c1", name: "Button", key: "abc" }]);
    expect((await fake.getLocalComponentsAsync())[0].key).toBe("abc");
  });
});
```

Add to `FigmaFake`:

```ts
private readonly paintStyles = new Map<string, PaintStyle>();
private readonly textStyles = new Map<string, TextStyle>();
private readonly effectStyles = new Map<string, EffectStyle>();
private readonly components = new Map<string, Component>();

async getLocalPaintStylesAsync(): Promise<PaintStyle[]> {
  return Array.from(this.paintStyles.values());
}
async getLocalTextStylesAsync(): Promise<TextStyle[]> {
  return Array.from(this.textStyles.values());
}
async getLocalEffectStylesAsync(): Promise<EffectStyle[]> {
  return Array.from(this.effectStyles.values());
}
async getLocalComponentsAsync(): Promise<Component[]> {
  return Array.from(this.components.values());
}

__seedPaintStyles(styles: readonly PaintStyle[]): void {
  for (const s of styles) this.paintStyles.set(s.id, s);
}
__seedTextStyles(styles: readonly TextStyle[]): void {
  for (const s of styles) this.textStyles.set(s.id, s);
}
__seedEffectStyles(styles: readonly EffectStyle[]): void {
  for (const s of styles) this.effectStyles.set(s.id, s);
}
__seedComponents(components: readonly Component[]): void {
  for (const c of components) this.components.set(c.id, c);
}
```

**Step 4: Verify**

Run `bun run --filter @repo/figma-adapter test` — all tests pass.
Run `bun run --filter @repo/figma-adapter types` — clean.
Run `bun run --filter @repo/figma-adapter lint` — clean.
Run root `bun run test` — protocol still green (uses the same adapter type).

**Step 5: Commit**

```bash
git add packages/figma-adapter/src/adapter.ts packages/figma-adapter/src/figma-fake.ts packages/figma-adapter/src/__tests__/adapter.test.ts packages/figma-adapter/src/__tests__/figma-fake.test.ts packages/figma-adapter/src/index.ts
git commit -m "feat(figma-adapter): extend FigmaAdapter with styles and components"
```

---

## Task 3.2: Scaffold `@repo/tools-extract`

**Files:**
- Create: `packages/tools-extract/package.json`
- Create: `packages/tools-extract/tsconfig.json`
- Create: `packages/tools-extract/vitest.config.ts`
- Create: `packages/tools-extract/src/index.ts`

**Step 1: `package.json`**

```json
{
  "name": "@repo/tools-extract",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
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

**Step 2: `tsconfig.json`** — identical to `packages/transport/tsconfig.json` (standalone).

**Step 3: `vitest.config.ts`** — same as figma-adapter (90/85/90/90, exclude only `src/__tests__/**`, include `src/**/*.ts`, `passWithNoTests: true`).

**Step 4: `src/index.ts`**

```ts
/**
 * @repo/tools-extract — canonical feature pack: design system extraction.
 *
 * Tools: extract_styles, extract_components, extract_local_variables,
 * bridge_status. Pattern is mechanical for later packs (Phase 8).
 */
export {};
```

**Step 5: Verify**

`bun install`, then run lint/types/test for the new package — all pass.

**Step 6: Commit**

```bash
git add packages/tools-extract bun.lock
git commit -m "feat(tools-extract): scaffold @repo/tools-extract package"
```

---

## Task 3.3: Scaffold `apps/mcp-server`

**Files:**
- Create: `apps/mcp-server/package.json`
- Create: `apps/mcp-server/tsconfig.json`
- Create: `apps/mcp-server/vitest.config.ts`
- Create: `apps/mcp-server/src/main.ts`

**Step 1: `package.json`**

```json
{
  "name": "@repo/mcp-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "types": "tsc --noEmit",
    "lint": "biome check .",
    "start": "bun src/main.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@repo/figma-adapter": "workspace:*",
    "@repo/protocol": "workspace:*",
    "@repo/tools-extract": "workspace:*",
    "@repo/transport": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^25.0.0",
    "@vitest/coverage-v8": "4.1.4",
    "typescript": "^6.0.0",
    "vitest": "4.1.4"
  }
}
```

> Confirm the `@modelcontextprotocol/sdk` major version against the latest stable release at the time of execution; pin the major. The plan name `^1.0.0` is approximate.

**Step 2: `tsconfig.json`** — same standalone shape as transport's, but include `"types": ["node"]` in `compilerOptions` because we use Node's `net`, `child_process`, `fs/promises`, etc.:

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
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

**Step 3: `vitest.config.ts`** — Node environment, 80/75/80/80 thresholds (apps target is lower than packages per the design doc):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "src/main.ts"],
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

> `src/main.ts` is the entry shim; its branches (mode dispatch, fork, exit codes) are exercised in the real-process spawn test (Task 3.16) which doesn't run under unit-test coverage. Excluding it keeps the threshold honest.

**Step 4: `src/main.ts`**

```ts
/**
 * @repo/mcp-server — entry point.
 *
 * Two modes selected by CLI flag (resolved in Task 3.14's orchestrator):
 *   - default (no flag): stdio shim. Forks a daemon if none is running.
 *   - --daemon: daemon main loop. Launched detached by a stdio shim.
 *
 * Subsequent tasks fill in the implementation. This file currently
 * exits zero so the package builds and lints cleanly.
 */
process.exit(0);
```

**Step 5: Verify**

`bun install`, then `bun run --filter @repo/mcp-server lint`, `types`, `test` — all clean.

**Step 6: Commit**

```bash
git add apps/mcp-server bun.lock
git commit -m "feat(mcp-server): scaffold apps/mcp-server"
```

---

## Task 3.4: Define tool schemas in `tools-extract` (TDD)

**Files:**
- Create: `packages/tools-extract/src/tools.ts`
- Create: `packages/tools-extract/src/__tests__/tools.test.ts`

**Step 1: Write the failing tests**

```ts
// packages/tools-extract/src/__tests__/tools.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ExtractStyles,
  ExtractComponents,
  ExtractLocalVariables,
  BridgeStatus,
} from "../tools";

describe("tools-extract tool definitions", () => {
  it("ExtractStyles has the expected name and shape", () => {
    expect(ExtractStyles.name).toBe("extract_styles");
    expect(ExtractStyles.streaming).toBe(false);
    // Output schema accepts a record of three style arrays
    const result = ExtractStyles.output.safeParse({
      paintStyles: [],
      textStyles: [],
      effectStyles: [],
    });
    expect(result.success).toBe(true);
  });

  it("ExtractComponents accepts no input args", () => {
    expect(ExtractComponents.input.safeParse({}).success).toBe(true);
  });

  it("ExtractLocalVariables output is { variables: Variable[] }", () => {
    const r = ExtractLocalVariables.output.safeParse({ variables: [] });
    expect(r.success).toBe(true);
  });

  it("BridgeStatus output reports daemon + plugin state", () => {
    const r = BridgeStatus.output.safeParse({
      daemon: { pid: 1234, version: "0.0.0", uptimeMs: 100 },
      plugin: { connected: false },
    });
    expect(r.success).toBe(true);
  });
});
```

Run: `bun run --filter @repo/tools-extract test tools` — FAIL (`Cannot find module "../tools"`).

**Step 2: Implement `tools.ts`**

```ts
import { z } from "zod";
import { defineTool } from "@repo/protocol";

const StyleSummary = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

const VariableSummary = z.object({
  id: z.string(),
  name: z.string(),
  resolvedType: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]),
  valuesByMode: z.record(z.unknown()),
});

const ComponentSummary = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
  description: z.string().optional(),
});

export const ExtractStyles = defineTool({
  name: "extract_styles",
  description: "Return all local paint, text, and effect styles in the current file.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({
    paintStyles: z.array(StyleSummary),
    textStyles: z.array(StyleSummary),
    effectStyles: z.array(StyleSummary),
  }),
});

export const ExtractComponents = defineTool({
  name: "extract_components",
  description: "Return all local components.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({ components: z.array(ComponentSummary) }),
});

export const ExtractLocalVariables = defineTool({
  name: "extract_local_variables",
  description: "Return all local variables in the current file.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({ variables: z.array(VariableSummary) }),
});

export const BridgeStatus = defineTool({
  name: "bridge_status",
  description:
    "Report daemon liveness, version, and whether a Figma plugin is paired.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({
    daemon: z.object({
      pid: z.number().int(),
      version: z.string(),
      uptimeMs: z.number().int().nonnegative(),
    }),
    plugin: z.object({
      connected: z.boolean(),
      lastConnectedAt: z.number().int().optional(),
    }),
  }),
});
```

**Step 3: Update `index.ts`**

```ts
export {
  ExtractStyles,
  ExtractComponents,
  ExtractLocalVariables,
  BridgeStatus,
} from "./tools";
```

**Step 4: Run tests**

Run: `bun run --filter @repo/tools-extract test` — PASS (4 tests).

**Step 5: Commit**

```bash
git add packages/tools-extract/src/tools.ts packages/tools-extract/src/__tests__/tools.test.ts packages/tools-extract/src/index.ts
git commit -m "feat(tools-extract): define tool schemas for the canonical pack"
```

---

## Task 3.5: Implement plugin handlers for the 3 extract tools (TDD)

**Files:**
- Create: `packages/tools-extract/src/plugin-handlers.ts`
- Create: `packages/tools-extract/src/__tests__/plugin-handlers.test.ts`

**Step 1: Write the failing tests**

```ts
// packages/tools-extract/src/__tests__/plugin-handlers.test.ts
import { describe, expect, it } from "vitest";
import { FigmaFake } from "@repo/figma-adapter/testing";
import {
  extractStylesPluginHandler,
  extractComponentsPluginHandler,
  extractLocalVariablesPluginHandler,
} from "../plugin-handlers";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe("extractStylesPluginHandler", () => {
  it("returns paint, text, and effect styles from the adapter", async () => {
    const figma = new FigmaFake();
    figma.__seedPaintStyles([
      { id: "p1", name: "primary", type: "PAINT", paints: [{ type: "SOLID" }] },
    ]);
    figma.__seedTextStyles([
      {
        id: "t1",
        name: "body",
        type: "TEXT",
        fontName: { family: "Inter", style: "Regular" },
        fontSize: 16,
      },
    ]);
    figma.__seedEffectStyles([
      { id: "e1", name: "shadow", type: "EFFECT", effects: [{ type: "DROP_SHADOW" }] },
    ]);

    const result = await extractStylesPluginHandler({}, { logger: noopLogger, figma });
    expect(result.paintStyles).toHaveLength(1);
    expect(result.textStyles).toHaveLength(1);
    expect(result.effectStyles).toHaveLength(1);
    expect(result.paintStyles[0].id).toBe("p1");
  });
});

describe("extractComponentsPluginHandler", () => {
  it("returns components from the adapter", async () => {
    const figma = new FigmaFake();
    figma.__seedComponents([{ id: "c1", name: "Button", key: "btn-key" }]);
    const result = await extractComponentsPluginHandler({}, { logger: noopLogger, figma });
    expect(result.components).toEqual([
      { id: "c1", name: "Button", key: "btn-key" },
    ]);
  });
});

describe("extractLocalVariablesPluginHandler", () => {
  it("returns variables from the adapter", async () => {
    const figma = new FigmaFake();
    figma.__seedVariables([
      {
        id: "v1",
        name: "color/red",
        resolvedType: "COLOR",
        valuesByMode: { mode1: "#f00" },
      },
    ]);
    const result = await extractLocalVariablesPluginHandler({}, { logger: noopLogger, figma });
    expect(result.variables[0].id).toBe("v1");
  });
});
```

Run: FAIL (`Cannot find module "../plugin-handlers"`).

**Step 2: Implement**

```ts
// packages/tools-extract/src/plugin-handlers.ts
import type { z } from "zod";
import type { PluginHandler } from "@repo/protocol";
import {
  ExtractComponents,
  ExtractLocalVariables,
  ExtractStyles,
} from "./tools";

const summarizeStyle = (s: { id: string; name: string; description?: string }) => ({
  id: s.id,
  name: s.name,
  description: s.description,
});

export const extractStylesPluginHandler: PluginHandler<typeof ExtractStyles> =
  async (_args, { figma }) => {
    const [paint, text, effect] = await Promise.all([
      figma.getLocalPaintStylesAsync(),
      figma.getLocalTextStylesAsync(),
      figma.getLocalEffectStylesAsync(),
    ]);
    return {
      paintStyles: paint.map(summarizeStyle),
      textStyles: text.map(summarizeStyle),
      effectStyles: effect.map(summarizeStyle),
    };
  };

export const extractComponentsPluginHandler: PluginHandler<typeof ExtractComponents> =
  async (_args, { figma }) => {
    const components = await figma.getLocalComponentsAsync();
    return {
      components: components.map((c) => ({
        id: c.id,
        name: c.name,
        key: c.key,
        description: c.description,
      })),
    };
  };

export const extractLocalVariablesPluginHandler: PluginHandler<typeof ExtractLocalVariables> =
  async (_args, { figma }) => {
    const variables = await figma.getLocalVariablesAsync();
    return {
      variables: variables.map((v) => ({
        id: v.id,
        name: v.name,
        resolvedType: v.resolvedType,
        valuesByMode: { ...v.valuesByMode },
      })),
    };
  };
```

**Step 3: Update index**

Add `export * from "./plugin-handlers";` to `packages/tools-extract/src/index.ts`.

**Step 4: Run tests** — PASS (3 tests, total 7 in tools-extract).

**Step 5: Commit**

```bash
git add packages/tools-extract/src/plugin-handlers.ts packages/tools-extract/src/__tests__/plugin-handlers.test.ts packages/tools-extract/src/index.ts
git commit -m "feat(tools-extract): plugin handlers for extract_styles, extract_components, extract_local_variables"
```

---

## Task 3.6: Implement `bridge_status` server handler (TDD)

**Why server-side:** `bridge_status` doesn't need the plugin — it reports the daemon's own state. It's the canonical example of a server-only tool.

**Files:**
- Create: `packages/tools-extract/src/server-handlers.ts`
- Create: `packages/tools-extract/src/__tests__/server-handlers.test.ts`

**Step 1: Write the failing test**

```ts
// packages/tools-extract/src/__tests__/server-handlers.test.ts
import { describe, expect, it } from "vitest";
import { createBridgeStatusServerHandler } from "../server-handlers";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe("createBridgeStatusServerHandler", () => {
  it("reports pid, version, uptime, and plugin state from the provider", async () => {
    const handler = createBridgeStatusServerHandler({
      getDaemonInfo: () => ({ pid: 1234, version: "0.0.0", uptimeMs: 50 }),
      getPluginState: () => ({ connected: true, lastConnectedAt: 1700000000000 }),
    });
    const result = await handler({}, { logger: noopLogger });
    expect(result.daemon.pid).toBe(1234);
    expect(result.plugin.connected).toBe(true);
    expect(result.plugin.lastConnectedAt).toBe(1700000000000);
  });

  it("works when the plugin has never connected", async () => {
    const handler = createBridgeStatusServerHandler({
      getDaemonInfo: () => ({ pid: 1, version: "0.0.0", uptimeMs: 0 }),
      getPluginState: () => ({ connected: false }),
    });
    const result = await handler({}, { logger: noopLogger });
    expect(result.plugin.connected).toBe(false);
    expect(result.plugin.lastConnectedAt).toBeUndefined();
  });
});
```

Run: FAIL.

**Step 2: Implement**

```ts
// packages/tools-extract/src/server-handlers.ts
import type { ServerHandler } from "@repo/protocol";
import type { BridgeStatus as BridgeStatusTool } from "./tools";

export interface BridgeStatusProviders {
  readonly getDaemonInfo: () => {
    pid: number;
    version: string;
    uptimeMs: number;
  };
  readonly getPluginState: () => {
    connected: boolean;
    lastConnectedAt?: number;
  };
}

/**
 * Factory: returns a `bridge_status` server handler bound to the
 * provided daemon-state providers. The factory shape lets the daemon
 * inject its real lifecycle hooks while keeping the handler test-pure.
 */
export function createBridgeStatusServerHandler(
  providers: BridgeStatusProviders,
): ServerHandler<typeof BridgeStatusTool> {
  return async (_args, _ctx) => ({
    daemon: providers.getDaemonInfo(),
    plugin: providers.getPluginState(),
  });
}
```

Add the export to `index.ts`.

**Step 3: Run tests** — PASS (2 tests).

**Step 4: Commit**

```bash
git add packages/tools-extract/src/server-handlers.ts packages/tools-extract/src/__tests__/server-handlers.test.ts packages/tools-extract/src/index.ts
git commit -m "feat(tools-extract): bridge_status server handler"
```

---

## Task 3.7: Implement `ServerRegistryImpl` (TDD)

**Files:**
- Create: `apps/mcp-server/src/registries/server-registry.ts`
- Create: `apps/mcp-server/src/registries/__tests__/server-registry.test.ts`

**Step 1: Write the failing tests**

```ts
// apps/mcp-server/src/registries/__tests__/server-registry.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "@repo/protocol";
import { ServerRegistryImpl } from "../server-registry";

const Ping = defineTool({
  name: "ping",
  description: "ping",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({ ok: z.literal(true) }),
});

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe("ServerRegistryImpl", () => {
  it("dispatches a registered tool", async () => {
    const reg = new ServerRegistryImpl();
    reg.register(Ping, async () => ({ ok: true }));
    const result = await reg.dispatch("ping", {}, { logger: noopLogger });
    expect(result).toEqual({ ok: true });
  });

  it("validates input via the tool's Zod schema", async () => {
    const reg = new ServerRegistryImpl();
    reg.register(Ping, async () => ({ ok: true }));
    await expect(
      reg.dispatch("ping", { extra: "field" }, { logger: noopLogger }),
    ).rejects.toThrow(/input/i);
  });

  it("rejects an unknown tool name with E_PROTOCOL_UNKNOWN_TOOL", async () => {
    const reg = new ServerRegistryImpl();
    await expect(
      reg.dispatch("nope", {}, { logger: noopLogger }),
    ).rejects.toMatchObject({ code: "E_PROTOCOL_UNKNOWN_TOOL" });
  });

  it("validates the handler's output via the tool's Zod schema", async () => {
    const reg = new ServerRegistryImpl();
    reg.register(Ping, async () => ({ ok: false }) as unknown as { ok: true });
    await expect(
      reg.dispatch("ping", {}, { logger: noopLogger }),
    ).rejects.toThrow(/output/i);
  });

  it("`has` reports whether a tool is registered", () => {
    const reg = new ServerRegistryImpl();
    expect(reg.has("ping")).toBe(false);
    reg.register(Ping, async () => ({ ok: true }));
    expect(reg.has("ping")).toBe(true);
  });
});
```

**Step 2: Implement**

```ts
// apps/mcp-server/src/registries/server-registry.ts
import type {
  ServerHandler,
  ServerHandlerContext,
  ServerRegistry,
  ToolDefinition,
} from "@repo/protocol";
import { ErrorCode } from "@repo/protocol";

/** Internal error type — surfaces a known protocol code without a wire envelope. */
export class RegistryError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

interface Entry {
  tool: ToolDefinition;
  handler: ServerHandler<ToolDefinition>;
}

export class ServerRegistryImpl implements ServerRegistry {
  private readonly entries = new Map<string, Entry>();

  register<T extends ToolDefinition>(tool: T, handler: ServerHandler<T>): void {
    this.entries.set(tool.name, {
      tool,
      handler: handler as ServerHandler<ToolDefinition>,
    });
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  async dispatch(
    name: string,
    args: unknown,
    ctx: ServerHandlerContext,
  ): Promise<unknown> {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new RegistryError(
        ErrorCode.E_PROTOCOL_UNKNOWN_TOOL,
        `unknown tool: ${name}`,
      );
    }
    const parsedInput = entry.tool.input.safeParse(args);
    if (!parsedInput.success) {
      throw new RegistryError(
        ErrorCode.E_PROTOCOL_INVALID,
        `invalid input for ${name}: ${parsedInput.error.message}`,
      );
    }
    const result = await entry.handler(parsedInput.data, ctx);
    const parsedOutput = entry.tool.output.safeParse(result);
    if (!parsedOutput.success) {
      throw new RegistryError(
        ErrorCode.E_PROTOCOL_OUTPUT_INVALID,
        `invalid output from ${name}: ${parsedOutput.error.message}`,
      );
    }
    return parsedOutput.data;
  }
}
```

**Step 3: Run tests** — PASS (5 tests).

**Step 4: Commit**

```bash
git add apps/mcp-server/src/registries/server-registry.ts apps/mcp-server/src/registries/__tests__/server-registry.test.ts
git commit -m "feat(mcp-server): ServerRegistryImpl with input/output validation"
```

---

## Task 3.8: Implement `PluginRegistryImpl` (TDD)

**Mirror of Task 3.7 with `PluginHandler` + `PluginHandlerContext`.** The shape is identical; the only differences are the handler type and the context type carrying `figma: FigmaAdapter` instead of `figmaApiKey?`.

**Files:**
- Create: `apps/mcp-server/src/registries/plugin-registry.ts`
- Create: `apps/mcp-server/src/registries/__tests__/plugin-registry.test.ts`

**Step 1: Write the failing tests**

Mirror the server-registry tests. Use `FigmaFake` from `@repo/figma-adapter/testing` to fill `ctx.figma`. Five tests covering the same shape: register + dispatch, input validation, unknown tool, output validation, `has`.

**Step 2: Implement** — same as `ServerRegistryImpl`, but with the handler signature using `PluginHandler<T>` and `PluginHandlerContext`.

**Step 3: Verify, commit**

```bash
git add apps/mcp-server/src/registries/plugin-registry.ts apps/mcp-server/src/registries/__tests__/plugin-registry.test.ts
git commit -m "feat(mcp-server): PluginRegistryImpl with input/output validation"
```

---

## Task 3.9: Implement Unix socket transports (TDD)

**Why in `@repo/transport`:** the abstraction is reusable. The shape mirrors the WebSocket transports — same `Transport` contract, same `Correlator` works on top, same `parseEnvelope` validation.

**Files:**
- Create: `packages/transport/src/unix-socket-server.ts`
- Create: `packages/transport/src/unix-socket-client.ts`
- Create: `packages/transport/src/__tests__/unix-socket.test.ts`
- Modify: `packages/transport/src/index.ts`
- Modify: `packages/transport/package.json` (no new deps — Node `net` is built-in; mark `@types/node` as a devDep if not already present)

**Step 1: Write the failing tests**

```ts
// packages/transport/src/__tests__/unix-socket.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RequestEnvelope } from "@repo/protocol";
import { UnixSocketServerTransport } from "../unix-socket-server";
import { UnixSocketClientTransport } from "../unix-socket-client";

const sample: RequestEnvelope = {
  kind: "request",
  id: "req_1",
  sourceClientId: "test",
  tool: "ping",
  args: {},
};

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

let socketPath: string;

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), "mcp-sock-"));
  socketPath = join(dir, "daemon.sock");
});

describe("UnixSocketServerTransport ↔ UnixSocketClientTransport", () => {
  it("client → server envelope round-trip", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    await client.send(sample);
    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received[0]).toEqual(sample);

    await client.close();
    await server.close();
  });

  it("server → client envelope round-trip", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const client = await UnixSocketClientTransport.connect({ path: socketPath });

    const onClient: unknown[] = [];
    client.onMessage((env) => onClient.push(env));

    await waitFor(() => (server.connectedClientCount > 0 ? true : undefined));
    await server.broadcast(sample);
    await waitFor(() => (onClient.length > 0 ? onClient : undefined));
    expect(onClient[0]).toEqual(sample);

    await client.close();
    await server.close();
  });

  it("server accepts multiple clients (multiplexed)", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const a = await UnixSocketClientTransport.connect({ path: socketPath });
    const b = await UnixSocketClientTransport.connect({ path: socketPath });

    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    await a.send(sample);
    await b.send({ ...sample, id: "req_2" });

    await waitFor(() => (received.length === 2 ? received : undefined));
    expect(received).toHaveLength(2);

    await a.close();
    await b.close();
    await server.close();
  });

  it("client handles server close gracefully", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const client = await UnixSocketClientTransport.connect({ path: socketPath });

    let disconnected = false;
    client.onDisconnect(() => {
      disconnected = true;
    });

    await server.close();
    await waitFor(() => (disconnected ? true : undefined));
    expect(disconnected).toBe(true);
  });

  it("drops malformed messages without dropping the connection", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    // Reach into the underlying socket and write a junk frame, then a valid one.
    // (Implementation detail: `client.__rawWrite` is exposed for tests only.)
    (client as unknown as { __rawWrite(data: string): void }).__rawWrite("not json\n");
    await client.send(sample);

    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received).toHaveLength(1);

    await client.close();
    await server.close();
  });
});
```

**Step 2: Implement**

The shape mirrors the WebSocket transports. Two key differences:

- The server is **multi-client** (the daemon serves N stdio shims simultaneously), unlike the WS server which is single-client. Track sockets in a `Set<net.Socket>`. Add `broadcast(envelope)` for server-to-all-clients delivery, and `connectedClientCount` getter.
- Newline-delimited JSON framing on top of the socket stream — accumulate bytes in a buffer, split on `\n`, parse each frame.

```ts
// packages/transport/src/unix-socket-server.ts
import { type Server, createServer, type Socket } from "node:net";
import { type Envelope, parseEnvelope } from "@repo/protocol";
import type { Transport } from "./transport";

export interface UnixSocketListenOptions {
  readonly path: string;
}

type Handler<T> = (arg: T) => void;

const NEWLINE = "\n";

class FramingBuffer {
  private buf = "";
  push(chunk: string, onFrame: (frame: string) => void): void {
    this.buf += chunk;
    let idx = this.buf.indexOf(NEWLINE);
    while (idx !== -1) {
      const frame = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 1);
      if (frame.length > 0) onFrame(frame);
      idx = this.buf.indexOf(NEWLINE);
    }
  }
}

export class UnixSocketServerTransport implements Transport {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private readonly messageHandlers = new Set<Handler<Envelope>>();
  private readonly connectHandlers = new Set<Handler<void>>();
  private readonly disconnectHandlers = new Set<Handler<Error | undefined>>();
  private closed = false;

  private constructor(server: Server) {
    this.server = server;
    server.on("connection", (socket) => this.onConnection(socket));
  }

  static listen(options: UnixSocketListenOptions): Promise<UnixSocketServerTransport> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      const onError = (err: Error) => {
        server.close();
        reject(err);
      };
      server.once("error", onError);
      server.listen(options.path, () => {
        server.removeListener("error", onError);
        resolve(new UnixSocketServerTransport(server));
      });
    });
  }

  get connectedClientCount(): number {
    return this.sockets.size;
  }

  /**
   * `send` on a multi-client transport doesn't have a single addressee.
   * Use `broadcast` for server-initiated messages; `send` is reserved
   * for parity with `Transport` and rejects to surface misuse.
   */
  async send(_envelope: Envelope): Promise<void> {
    throw new Error("UnixSocketServerTransport.send: use broadcast() instead");
  }

  async broadcast(envelope: Envelope): Promise<void> {
    if (this.closed) throw new Error("transport closed");
    const line = `${JSON.stringify(envelope)}${NEWLINE}`;
    for (const s of this.sockets) s.write(line);
  }

  onMessage(handler: Handler<Envelope>): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnect(handler: Handler<void>): () => void {
    this.connectHandlers.add(handler);
    if (this.connectedClientCount > 0) handler();
    return () => this.connectHandlers.delete(handler);
  }

  onDisconnect(handler: Handler<Error | undefined>): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private onConnection(socket: Socket): void {
    this.sockets.add(socket);
    for (const h of this.connectHandlers) h();

    const buf = new FramingBuffer();
    socket.setEncoding("utf-8");
    socket.on("data", (chunk: string) => {
      buf.push(chunk, (frame) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(frame);
        } catch {
          return;
        }
        let envelope: Envelope;
        try {
          envelope = parseEnvelope(parsed);
        } catch {
          return;
        }
        for (const h of this.messageHandlers) h(envelope);
      });
    });

    socket.on("close", () => {
      this.sockets.delete(socket);
      if (!this.closed) {
        for (const h of this.disconnectHandlers) h(undefined);
      }
    });
    // `net.Socket` always emits `close` after `error`, like `ws`.
    socket.on("error", (err) => {
      if (!this.closed) {
        for (const h of this.disconnectHandlers) h(err);
      }
    });
  }
}
```

```ts
// packages/transport/src/unix-socket-client.ts
import { type Socket, createConnection } from "node:net";
import { type Envelope, parseEnvelope } from "@repo/protocol";
import type { Transport } from "./transport";

export interface UnixSocketConnectOptions {
  readonly path: string;
  readonly connectTimeoutMs?: number;
}

type Handler<T> = (arg: T) => void;
const NEWLINE = "\n";

export class UnixSocketClientTransport implements Transport {
  private readonly socket: Socket;
  private readonly messageHandlers = new Set<Handler<Envelope>>();
  private readonly connectHandlers = new Set<Handler<void>>();
  private readonly disconnectHandlers = new Set<Handler<Error | undefined>>();
  private closed = false;

  private constructor(socket: Socket) {
    this.socket = socket;
    socket.setEncoding("utf-8");
    let buf = "";
    socket.on("data", (chunk: string) => {
      buf += chunk;
      let idx = buf.indexOf(NEWLINE);
      while (idx !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (frame.length > 0) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(frame);
          } catch {
            idx = buf.indexOf(NEWLINE);
            continue;
          }
          let envelope: Envelope;
          try {
            envelope = parseEnvelope(parsed);
          } catch {
            idx = buf.indexOf(NEWLINE);
            continue;
          }
          for (const h of this.messageHandlers) h(envelope);
        }
        idx = buf.indexOf(NEWLINE);
      }
    });
    socket.on("close", () => {
      if (!this.closed) {
        this.closed = true;
        for (const h of this.disconnectHandlers) h(undefined);
      }
    });
    socket.on("error", (err) => {
      if (!this.closed) {
        for (const h of this.disconnectHandlers) h(err);
      }
    });
  }

  static connect(options: UnixSocketConnectOptions): Promise<UnixSocketClientTransport> {
    const timeoutMs = options.connectTimeoutMs ?? 5_000;
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = createConnection({ path: options.path });
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new Error(`connect timeout: ${options.path}`));
      }, timeoutMs);
      socket.once("connect", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(new UnixSocketClientTransport(socket));
      });
      socket.once("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async send(envelope: Envelope): Promise<void> {
    if (this.closed) throw new Error("transport closed");
    this.socket.write(`${JSON.stringify(envelope)}${NEWLINE}`);
  }

  /** Test-only: write raw bytes without framing. */
  __rawWrite(data: string): void {
    this.socket.write(data);
  }

  onMessage(handler: Handler<Envelope>): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnect(handler: Handler<void>): () => void {
    this.connectHandlers.add(handler);
    if (!this.closed) handler();
    return () => this.connectHandlers.delete(handler);
  }

  onDisconnect(handler: Handler<Error | undefined>): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.socket.end();
  }
}
```

**Step 3: Update `index.ts`**

Add:

```ts
export { UnixSocketServerTransport } from "./unix-socket-server";
export type { UnixSocketListenOptions } from "./unix-socket-server";
export { UnixSocketClientTransport } from "./unix-socket-client";
export type { UnixSocketConnectOptions } from "./unix-socket-client";
```

**Step 4: Run tests** — 5 new + previous 51 = 56 transport tests pass.

**Step 5: Commit**

```bash
git add packages/transport/src/unix-socket-server.ts packages/transport/src/unix-socket-client.ts packages/transport/src/__tests__/unix-socket.test.ts packages/transport/src/index.ts
git commit -m "feat(transport): UnixSocketServerTransport and UnixSocketClientTransport"
```

---

## Task 3.10: Implement lockfile manager (TDD)

**Files:**
- Create: `apps/mcp-server/src/daemon/lockfile.ts`
- Create: `apps/mcp-server/src/daemon/__tests__/lockfile.test.ts`

**Step 1: Tests**

```ts
// apps/mcp-server/src/daemon/__tests__/lockfile.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LockfileManager } from "../lockfile";

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mcp-lock-"));
  path = join(dir, "daemon.lock");
});

describe("LockfileManager", () => {
  it("read() returns null when no lockfile exists", async () => {
    const lf = new LockfileManager({ path, isPidAlive: () => true });
    expect(await lf.read()).toBeNull();
  });

  it("write() then read() returns the same record", async () => {
    const lf = new LockfileManager({ path, isPidAlive: () => true });
    await lf.write({ pid: process.pid, version: "0.0.0", socketPath: "/tmp/x.sock" });
    const r = await lf.read();
    expect(r?.pid).toBe(process.pid);
    expect(r?.version).toBe("0.0.0");
    expect(r?.socketPath).toBe("/tmp/x.sock");
  });

  it("readActive() ignores stale lockfiles whose PID is dead", async () => {
    const lf = new LockfileManager({ path, isPidAlive: () => false });
    await lf.write({ pid: 999999, version: "0.0.0", socketPath: "/tmp/x.sock" });
    expect(await lf.readActive()).toBeNull();
  });

  it("readActive() returns the record when the PID is alive", async () => {
    const lf = new LockfileManager({ path, isPidAlive: () => true });
    await lf.write({ pid: 1, version: "0.0.0", socketPath: "/tmp/x.sock" });
    const r = await lf.readActive();
    expect(r?.pid).toBe(1);
  });

  it("clear() removes the lockfile (idempotent)", async () => {
    const lf = new LockfileManager({ path, isPidAlive: () => true });
    await lf.write({ pid: 1, version: "0.0.0", socketPath: "/tmp/x.sock" });
    await lf.clear();
    expect(await lf.read()).toBeNull();
    await lf.clear(); // second call is a no-op
    expect(await lf.read()).toBeNull();
  });

  it("read() returns null on a corrupted lockfile (treats as missing)", async () => {
    await import("node:fs/promises").then((fs) => fs.writeFile(path, "not json"));
    const lf = new LockfileManager({ path, isPidAlive: () => true });
    expect(await lf.read()).toBeNull();
  });
});
```

**Step 2: Implement**

```ts
// apps/mcp-server/src/daemon/lockfile.ts
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface LockRecord {
  readonly pid: number;
  readonly version: string;
  readonly socketPath: string;
}

export interface LockfileOptions {
  readonly path: string;
  readonly isPidAlive: (pid: number) => boolean;
}

export class LockfileManager {
  constructor(private readonly options: LockfileOptions) {}

  async read(): Promise<LockRecord | null> {
    try {
      const raw = await readFile(this.options.path, "utf-8");
      const parsed = JSON.parse(raw) as Partial<LockRecord>;
      if (
        typeof parsed.pid !== "number" ||
        typeof parsed.version !== "string" ||
        typeof parsed.socketPath !== "string"
      ) {
        return null;
      }
      return { pid: parsed.pid, version: parsed.version, socketPath: parsed.socketPath };
    } catch {
      return null;
    }
  }

  async readActive(): Promise<LockRecord | null> {
    const r = await this.read();
    if (!r) return null;
    return this.options.isPidAlive(r.pid) ? r : null;
  }

  async write(record: LockRecord): Promise<void> {
    await mkdir(dirname(this.options.path), { recursive: true });
    await writeFile(this.options.path, JSON.stringify(record));
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.options.path);
    } catch {
      /* ignore — already gone */
    }
  }
}

/** Default `isPidAlive` for production: `kill 0` semantics. */
export const isPidAliveDefault = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
```

**Step 3: Run tests, commit**

```bash
git add apps/mcp-server/src/daemon/lockfile.ts apps/mcp-server/src/daemon/__tests__/lockfile.test.ts
git commit -m "feat(mcp-server): LockfileManager with stale-PID recovery"
```

---

## Task 3.11: Implement `Daemon` orchestrator (TDD)

The `Daemon` class wires everything together: it owns the IPC server (Unix socket), the WS server transport (idle in Phase 3), the registries, and the routing logic.

**Files:**
- Create: `apps/mcp-server/src/daemon/daemon.ts`
- Create: `apps/mcp-server/src/daemon/__tests__/daemon.test.ts`

**Step 1: Tests**

```ts
// apps/mcp-server/src/daemon/__tests__/daemon.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "@repo/protocol";
import type { RequestEnvelope } from "@repo/protocol";
import { UnixSocketClientTransport, Correlator } from "@repo/transport";
import { FigmaFake } from "@repo/figma-adapter/testing";
import { Daemon } from "../daemon";

const Echo = defineTool({
  name: "echo",
  description: "echo",
  streaming: false,
  input: z.object({ msg: z.string() }),
  output: z.object({ msg: z.string() }),
});

describe("Daemon", () => {
  it("dispatches a server tool call from a connected IPC client", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
      figma: new FigmaFake(),
      packs: [
        {
          name: "echo-pack",
          tools: [Echo],
          registerServer: (reg) => reg.register(Echo, async (args) => ({ msg: args.msg })),
        },
      ],
    });

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    const correlator = new Correlator(client);

    const result = await correlator.request<{ msg: string }>({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "echo",
      args: { msg: "hi" },
    });
    expect(result).toEqual({ msg: "hi" });

    await client.close();
    await daemon.stop();
  });

  it("returns an error envelope for an unknown tool", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
      figma: new FigmaFake(),
      packs: [],
    });

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    const correlator = new Correlator(client);

    await expect(
      correlator.request({
        kind: "request",
        id: "r1",
        sourceClientId: "shim-A",
        tool: "ghost",
        args: {},
      } as RequestEnvelope),
    ).rejects.toMatchObject({ code: "E_PROTOCOL_UNKNOWN_TOOL" });

    await client.close();
    await daemon.stop();
  });

  it("dispatches a plugin tool call against the daemon's FigmaFake", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-"));
    const socketPath = join(dir, "daemon.sock");

    const figma = new FigmaFake();
    figma.__seedComponents([{ id: "c1", name: "Button", key: "btn" }]);

    const daemon = await Daemon.start({
      socketPath,
      figma,
      packs: [
        {
          name: "extract",
          tools: [
            // import from @repo/tools-extract for real
            // (test uses a synthetic stand-in to keep the test self-contained)
          ],
          registerPlugin: () => {},
        },
      ],
    });
    // Skip actual call — this case is covered fully by Task 3.15 e2e test.
    await daemon.stop();
  });

  it("multiplexes multiple clients with sourceClientId routing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
      figma: new FigmaFake(),
      packs: [
        {
          name: "echo",
          tools: [Echo],
          registerServer: (reg) =>
            reg.register(Echo, async (args) => ({ msg: args.msg.toUpperCase() })),
        },
      ],
    });

    const a = new Correlator(await UnixSocketClientTransport.connect({ path: socketPath }));
    const b = new Correlator(await UnixSocketClientTransport.connect({ path: socketPath }));

    const [ra, rb] = await Promise.all([
      a.request<{ msg: string }>({
        kind: "request",
        id: "ra",
        sourceClientId: "A",
        tool: "echo",
        args: { msg: "from-a" },
      }),
      b.request<{ msg: string }>({
        kind: "request",
        id: "rb",
        sourceClientId: "B",
        tool: "echo",
        args: { msg: "from-b" },
      }),
    ]);

    expect(ra.msg).toBe("FROM-A");
    expect(rb.msg).toBe("FROM-B");

    await daemon.stop();
  });
});
```

**Step 2: Implement**

```ts
// apps/mcp-server/src/daemon/daemon.ts
import {
  type Envelope,
  ErrorCode,
  errorCategoryFor,
  type Pack,
  type RequestEnvelope,
  type ResponseEnvelope,
  type ErrorEnvelope,
} from "@repo/protocol";
import type { FigmaAdapter } from "@repo/figma-adapter";
import { UnixSocketServerTransport } from "@repo/transport";
import { ServerRegistryImpl, RegistryError } from "../registries/server-registry";
import { PluginRegistryImpl } from "../registries/plugin-registry";

export interface DaemonStartOptions {
  readonly socketPath: string;
  readonly figma: FigmaAdapter;
  readonly packs: readonly Pack[];
  readonly logger?: import("@repo/protocol").Logger;
}

const noopLogger: import("@repo/protocol").Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class Daemon {
  private readonly ipc: UnixSocketServerTransport;
  private readonly serverRegistry = new ServerRegistryImpl();
  private readonly pluginRegistry = new PluginRegistryImpl();
  private readonly figma: FigmaAdapter;
  private readonly logger: import("@repo/protocol").Logger;
  private readonly startedAt = Date.now();

  static async start(options: DaemonStartOptions): Promise<Daemon> {
    const ipc = await UnixSocketServerTransport.listen({ path: options.socketPath });
    const daemon = new Daemon(ipc, options.figma, options.logger ?? noopLogger);
    for (const pack of options.packs) {
      pack.registerServer?.(daemon.serverRegistry);
      pack.registerPlugin?.(daemon.pluginRegistry);
    }
    ipc.onMessage((env) => {
      if (env.kind === "request") {
        void daemon.handleRequest(env);
      }
    });
    return daemon;
  }

  private constructor(
    ipc: UnixSocketServerTransport,
    figma: FigmaAdapter,
    logger: import("@repo/protocol").Logger,
  ) {
    this.ipc = ipc;
    this.figma = figma;
    this.logger = logger;
  }

  get pid(): number {
    return process.pid;
  }
  get uptimeMs(): number {
    return Date.now() - this.startedAt;
  }

  async stop(): Promise<void> {
    await this.ipc.close();
  }

  private async handleRequest(req: RequestEnvelope): Promise<void> {
    try {
      const result = await this.dispatch(req);
      const response: ResponseEnvelope = {
        kind: "response",
        id: req.id,
        ok: true,
        result,
      };
      await this.ipc.broadcast(response);
    } catch (err) {
      const errEnv = this.toErrorEnvelope(req.id, err);
      await this.ipc.broadcast(errEnv);
    }
  }

  private async dispatch(req: RequestEnvelope): Promise<unknown> {
    if (this.serverRegistry.has(req.tool)) {
      return this.serverRegistry.dispatch(req.tool, req.args, { logger: this.logger });
    }
    if (this.pluginRegistry.has(req.tool)) {
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

  private toErrorEnvelope(id: string, err: unknown): ErrorEnvelope {
    if (err instanceof RegistryError) {
      return {
        kind: "error",
        id,
        ok: false,
        code: err.code,
        category: errorCategoryFor(err.code),
        message: err.message,
      };
    }
    return {
      kind: "error",
      id,
      ok: false,
      code: ErrorCode.E_FIGMA_UNKNOWN,
      category: "figma",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
```

> **Routing note:** Phase 3's `broadcast` sends every response to every connected shim. Each shim's `Correlator` filters by `id`, so non-matching responses are no-ops. Phase 6 (or earlier if the test suite needs it) can switch to per-socket routing keyed by `sourceClientId`. The simplification here is acceptable for ≤10 shims, which is the realistic AI-client-per-developer cap.

**Step 3: Verify, commit**

```bash
git add apps/mcp-server/src/daemon/daemon.ts apps/mcp-server/src/daemon/__tests__/daemon.test.ts
git commit -m "feat(mcp-server): Daemon orchestrator with IPC routing and registry dispatch"
```

---

## Task 3.12: MCP server bridge (Zod → MCP SDK; TDD)

**Goal:** Translate `@repo/protocol` `ToolDefinition`s into `@modelcontextprotocol/sdk` server tool registrations. The bridge takes a list of `ToolDefinition`s and a "resolver" callback (which the stdio shim implements as "forward to daemon over IPC"), and registers each tool on an MCP `Server` instance.

**Files:**
- Create: `apps/mcp-server/src/mcp-bridge.ts`
- Create: `apps/mcp-server/src/__tests__/mcp-bridge.test.ts`

**Step 1: Tests**

```ts
// apps/mcp-server/src/__tests__/mcp-bridge.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool, ErrorCode } from "@repo/protocol";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { registerToolsWithMcp } from "../mcp-bridge";

const Hello = defineTool({
  name: "hello",
  description: "say hi",
  streaming: false,
  input: z.object({ name: z.string() }),
  output: z.object({ greeting: z.string() }),
});

describe("registerToolsWithMcp", () => {
  it("registers tools and routes calls through the resolver", async () => {
    const server = new Server({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
    registerToolsWithMcp({
      mcpServer: server,
      tools: [Hello],
      resolve: async (name, args) => ({ greeting: `hi ${(args as { name: string }).name}` }),
    });
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverT), (async () => {})()]);
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientT);

    const result = await client.callTool({ name: "hello", arguments: { name: "Daisy" } });
    expect(result.isError).not.toBe(true);
    // The MCP SDK wraps `content` for outputs — verify the structured payload
    // ends up in the response.
    expect(JSON.stringify(result)).toContain("Daisy");
  });

  it("translates resolver errors into MCP tool-result errors with isError: true", async () => {
    const server = new Server({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
    registerToolsWithMcp({
      mcpServer: server,
      tools: [Hello],
      resolve: async () => {
        throw Object.assign(new Error("node not found"), {
          code: ErrorCode.E_FIGMA_NODE_NOT_FOUND,
          category: "figma",
        });
      },
    });
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    server.connect(serverT);
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientT);

    const result = await client.callTool({ name: "hello", arguments: { name: "x" } });
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Implement**

```ts
// apps/mcp-server/src/mcp-bridge.ts
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolDefinition } from "@repo/protocol";
import { ErrorCode, errorCategoryFor } from "@repo/protocol";

export interface RegisterToolsOptions {
  readonly mcpServer: Server;
  readonly tools: readonly ToolDefinition[];
  /**
   * Resolver: returns the parsed tool result (matching the tool's
   * output schema). Throws to signal a tool-level error; the bridge
   * translates the error into an MCP tool result with `isError: true`.
   */
  readonly resolve: (name: string, args: unknown) => Promise<unknown>;
}

const TOOL_LEVEL_CATEGORIES = new Set(["figma", "stream", "protocol"]);

export function registerToolsWithMcp(options: RegisterToolsOptions): void {
  const { mcpServer, tools, resolve } = options;

  const byName = new Map<string, ToolDefinition>();
  for (const t of tools) byName.set(t.name, t);

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.input) as Record<string, unknown>,
    })),
  }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = byName.get(req.params.name);
    if (!def) {
      return {
        isError: true,
        content: [
          { type: "text", text: `unknown tool: ${req.params.name}` },
        ],
      };
    }
    try {
      const result = await resolve(req.params.name, req.params.arguments ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (err) {
      const code =
        (err as { code?: ErrorCode }).code ?? ErrorCode.E_FIGMA_UNKNOWN;
      const category =
        (err as { category?: string }).category ?? errorCategoryFor(code);
      const message = err instanceof Error ? err.message : String(err);
      const isToolLevel = TOOL_LEVEL_CATEGORIES.has(category);
      if (isToolLevel) {
        return {
          isError: true,
          content: [{ type: "text", text: `${code}: ${message}` }],
        };
      }
      // Catastrophic — bubble as JSON-RPC error.
      throw err;
    }
  });
}
```

> **Note on `zod-to-json-schema`:** add it as a dep on `apps/mcp-server` (`"zod-to-json-schema": "^3.23.0"` or current). MCP requires JSON Schema for tool input declarations.

Add the dep to `apps/mcp-server/package.json`. Run `bun install`.

**Step 3: Run tests, commit**

```bash
git add apps/mcp-server/src/mcp-bridge.ts apps/mcp-server/src/__tests__/mcp-bridge.test.ts apps/mcp-server/package.json bun.lock
git commit -m "feat(mcp-server): MCP server bridge translates protocol tools to MCP SDK"
```

---

## Task 3.13: Implement stdio shim entrypoint (TDD)

The shim is the in-process side that the AI client spawns. It opens an IPC connection to the daemon, registers tools on an MCP server, and routes every MCP `callTool` over IPC.

**Files:**
- Create: `apps/mcp-server/src/shim/stdio-shim.ts`
- Create: `apps/mcp-server/src/shim/__tests__/stdio-shim.test.ts`

**Step 1: Tests**

```ts
// apps/mcp-server/src/shim/__tests__/stdio-shim.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "@repo/protocol";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import { Daemon } from "../../daemon/daemon";
import { createStdioShim } from "../stdio-shim";

const Echo = defineTool({
  name: "echo",
  description: "echo",
  streaming: false,
  input: z.object({ msg: z.string() }),
  output: z.object({ msg: z.string() }),
});

describe("createStdioShim", () => {
  it("forwards an MCP tool call to the daemon and returns the result", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-shim-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
      figma: new FigmaFake(),
      packs: [
        {
          name: "echo",
          tools: [Echo],
          registerServer: (reg) =>
            reg.register(Echo, async (args) => ({ msg: args.msg.toUpperCase() })),
        },
      ],
    });

    const shim = await createStdioShim({
      socketPath,
      sourceClientId: "test-shim",
      tools: [Echo],
      mcpServerInfo: { name: "test", version: "0.0.0" },
    });

    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    shim.connectMcp(serverT);
    const client = new Client({ name: "tester", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientT);

    const result = await client.callTool({ name: "echo", arguments: { msg: "hello" } });
    expect(JSON.stringify(result)).toContain("HELLO");

    await shim.stop();
    await daemon.stop();
  });
});
```

**Step 2: Implement**

```ts
// apps/mcp-server/src/shim/stdio-shim.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport as McpTransport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  Correlator,
  UnixSocketClientTransport,
  TransportError,
} from "@repo/transport";
import type { RequestEnvelope, ToolDefinition } from "@repo/protocol";
import { registerToolsWithMcp } from "../mcp-bridge";

export interface ShimOptions {
  readonly socketPath: string;
  readonly sourceClientId: string;
  readonly tools: readonly ToolDefinition[];
  readonly mcpServerInfo: { name: string; version: string };
}

let nextRequestId = 0;
const newId = () => `req_${++nextRequestId}_${Date.now()}`;

export class StdioShim {
  private readonly mcpServer: Server;
  private readonly correlator: Correlator;
  private readonly ipc: UnixSocketClientTransport;

  constructor(options: ShimOptions, ipc: UnixSocketClientTransport) {
    this.ipc = ipc;
    this.correlator = new Correlator(ipc);
    this.mcpServer = new Server(options.mcpServerInfo, { capabilities: { tools: {} } });

    registerToolsWithMcp({
      mcpServer: this.mcpServer,
      tools: options.tools,
      resolve: (name, args) =>
        this.correlator.request({
          kind: "request",
          id: newId(),
          sourceClientId: options.sourceClientId,
          tool: name,
          args: (args ?? {}) as Record<string, unknown>,
        } satisfies RequestEnvelope),
    });
  }

  connectMcp(transport: McpTransport): Promise<void> {
    return this.mcpServer.connect(transport);
  }

  async stop(): Promise<void> {
    await this.ipc.close();
    await this.mcpServer.close();
  }
}

export async function createStdioShim(options: ShimOptions): Promise<StdioShim> {
  const ipc = await UnixSocketClientTransport.connect({ path: options.socketPath });
  return new StdioShim(options, ipc);
}
```

> **`Correlator` reuse note:** the shim's `Correlator` resolves on `response`/`error` envelopes whose `id` matches its outgoing requests. Because the daemon broadcasts to all connected sockets (per Task 3.11's note), a shim sees responses for OTHER shims' requests too — they have different ids, so they're silently ignored.

**Step 3: Verify, commit**

```bash
git add apps/mcp-server/src/shim/stdio-shim.ts apps/mcp-server/src/shim/__tests__/stdio-shim.test.ts
git commit -m "feat(mcp-server): stdio shim — MCP server that proxies to the daemon"
```

---

## Task 3.14: First-invocation fork orchestration (TDD)

The orchestrator decides whether to act as a stdio shim or as the daemon, based on a CLI flag. When it acts as a stdio shim, it checks the lockfile, forks a daemon if none is alive, and connects.

**Files:**
- Create: `apps/mcp-server/src/orchestrator.ts`
- Create: `apps/mcp-server/src/__tests__/orchestrator.test.ts`
- Modify: `apps/mcp-server/src/main.ts` (call into the orchestrator)

**Step 1: Tests** (test the orchestrator with a stub `spawn` and a stub `LockfileManager` so no real fork happens):

```ts
// apps/mcp-server/src/__tests__/orchestrator.test.ts
import { describe, expect, it, vi } from "vitest";
import { resolveStartup } from "../orchestrator";

describe("resolveStartup", () => {
  it("uses the existing daemon when the lockfile is active", async () => {
    const lf = {
      readActive: vi.fn().mockResolvedValue({
        pid: 1234,
        version: "0.0.0",
        socketPath: "/tmp/x.sock",
      }),
      write: vi.fn(),
      clear: vi.fn(),
      read: vi.fn(),
    };
    const spawn = vi.fn();
    const result = await resolveStartup({
      argv: ["node", "main.js"],
      version: "0.0.0",
      lockfile: lf as never,
      spawnDaemon: spawn,
      socketPath: "/tmp/x.sock",
    });
    expect(result).toEqual({ mode: "shim", socketPath: "/tmp/x.sock" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawns a daemon when no active lockfile exists", async () => {
    const lf = {
      readActive: vi.fn().mockResolvedValue(null),
      write: vi.fn(),
      clear: vi.fn(),
      read: vi.fn(),
    };
    const spawn = vi.fn().mockResolvedValue({ socketPath: "/tmp/x.sock", pid: 9999 });
    const result = await resolveStartup({
      argv: ["node", "main.js"],
      version: "0.0.0",
      lockfile: lf as never,
      spawnDaemon: spawn,
      socketPath: "/tmp/x.sock",
    });
    expect(spawn).toHaveBeenCalled();
    expect(result).toEqual({ mode: "shim", socketPath: "/tmp/x.sock" });
  });

  it("returns 'daemon' mode when --daemon flag is present", async () => {
    const lf = {
      readActive: vi.fn(),
      write: vi.fn(),
      clear: vi.fn(),
      read: vi.fn(),
    };
    const result = await resolveStartup({
      argv: ["node", "main.js", "--daemon"],
      version: "0.0.0",
      lockfile: lf as never,
      spawnDaemon: vi.fn(),
      socketPath: "/tmp/x.sock",
    });
    expect(result).toEqual({ mode: "daemon", socketPath: "/tmp/x.sock" });
  });

  it("clears a stale lockfile before spawning", async () => {
    const lf = {
      readActive: vi.fn().mockResolvedValue(null),
      read: vi.fn().mockResolvedValue({ pid: 999999, version: "0.0.0", socketPath: "/tmp/x.sock" }),
      write: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const spawn = vi.fn().mockResolvedValue({ socketPath: "/tmp/x.sock", pid: 1 });
    await resolveStartup({
      argv: ["node", "main.js"],
      version: "0.0.0",
      lockfile: lf as never,
      spawnDaemon: spawn,
      socketPath: "/tmp/x.sock",
    });
    expect(lf.clear).toHaveBeenCalled();
    expect(spawn).toHaveBeenCalled();
  });
});
```

**Step 2: Implement**

```ts
// apps/mcp-server/src/orchestrator.ts
import type { LockfileManager } from "./daemon/lockfile";

export type StartupMode = "shim" | "daemon";

export interface SpawnDaemonResult {
  pid: number;
  socketPath: string;
}

export interface ResolveStartupOptions {
  readonly argv: readonly string[];
  readonly version: string;
  readonly lockfile: LockfileManager;
  readonly socketPath: string;
  readonly spawnDaemon: () => Promise<SpawnDaemonResult>;
}

export interface ResolveStartupResult {
  readonly mode: StartupMode;
  readonly socketPath: string;
}

export async function resolveStartup(
  options: ResolveStartupOptions,
): Promise<ResolveStartupResult> {
  if (options.argv.includes("--daemon")) {
    return { mode: "daemon", socketPath: options.socketPath };
  }
  const active = await options.lockfile.readActive();
  if (active) {
    return { mode: "shim", socketPath: active.socketPath };
  }
  // Clear any stale lockfile (read-but-not-active means dead PID).
  const stale = await options.lockfile.read();
  if (stale) await options.lockfile.clear();
  const spawned = await options.spawnDaemon();
  return { mode: "shim", socketPath: spawned.socketPath };
}
```

**Step 3: Wire `main.ts`**

```ts
// apps/mcp-server/src/main.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isPidAliveDefault, LockfileManager } from "./daemon/lockfile";
import { Daemon } from "./daemon/daemon";
import { FigmaFake } from "@repo/figma-adapter/testing";
import {
  ExtractStyles,
  ExtractComponents,
  ExtractLocalVariables,
  BridgeStatus,
  extractStylesPluginHandler,
  extractComponentsPluginHandler,
  extractLocalVariablesPluginHandler,
  createBridgeStatusServerHandler,
} from "@repo/tools-extract";
import { resolveStartup } from "./orchestrator";
import { createStdioShim } from "./shim/stdio-shim";

const VERSION = "0.0.0";
const DEFAULT_DIR = join(homedir(), ".figma-mcp");
const SOCKET_PATH = join(DEFAULT_DIR, "daemon.sock");
const LOCK_PATH = join(DEFAULT_DIR, "daemon.lock");

async function main(): Promise<void> {
  const lockfile = new LockfileManager({ path: LOCK_PATH, isPidAlive: isPidAliveDefault });

  const startup = await resolveStartup({
    argv: process.argv,
    version: VERSION,
    lockfile,
    socketPath: SOCKET_PATH,
    spawnDaemon: async () => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--daemon"], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      // Poll the lockfile until the daemon writes it.
      const start = Date.now();
      while (Date.now() - start < 5_000) {
        const active = await lockfile.readActive();
        if (active) return { pid: active.pid, socketPath: active.socketPath };
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("daemon did not start within 5s");
    },
  });

  if (startup.mode === "daemon") {
    const figma = new FigmaFake();
    const daemon = await Daemon.start({
      socketPath: startup.socketPath,
      figma,
      packs: [
        {
          name: "tools-extract",
          tools: [ExtractStyles, ExtractComponents, ExtractLocalVariables, BridgeStatus],
          registerPlugin: (reg) => {
            reg.register(ExtractStyles, extractStylesPluginHandler);
            reg.register(ExtractComponents, extractComponentsPluginHandler);
            reg.register(ExtractLocalVariables, extractLocalVariablesPluginHandler);
          },
          registerServer: (reg) => {
            const lifeCycleStartedAt = Date.now();
            reg.register(
              BridgeStatus,
              createBridgeStatusServerHandler({
                getDaemonInfo: () => ({
                  pid: process.pid,
                  version: VERSION,
                  uptimeMs: Date.now() - lifeCycleStartedAt,
                }),
                getPluginState: () => ({ connected: false }),
              }),
            );
          },
        },
      ],
    });
    await lockfile.write({
      pid: process.pid,
      version: VERSION,
      socketPath: startup.socketPath,
    });
    process.on("SIGTERM", async () => {
      await daemon.stop();
      await lockfile.clear();
      process.exit(0);
    });
    return;
  }

  const shim = await createStdioShim({
    socketPath: startup.socketPath,
    sourceClientId: `shim-${process.pid}`,
    tools: [ExtractStyles, ExtractComponents, ExtractLocalVariables, BridgeStatus],
    mcpServerInfo: { name: "figma-mcp", version: VERSION },
  });
  await shim.connectMcp(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 4: Verify orchestrator tests pass.** `main.ts` is excluded from coverage, so we don't need a test for it directly — its branches are exercised in Task 3.16's spawn test.

**Step 5: Commit**

```bash
git add apps/mcp-server/src/orchestrator.ts apps/mcp-server/src/__tests__/orchestrator.test.ts apps/mcp-server/src/main.ts
git commit -m "feat(mcp-server): orchestrator decides shim vs daemon and forks if needed"
```

---

## Task 3.15: End-to-end in-memory integration test

**Goal:** A single test that spins up a daemon in-process, connects a stdio shim to it, runs all 4 tools-extract tools through the MCP SDK client, and verifies results. No subprocess spawn — purely in-memory.

**Files:**
- Create: `apps/mcp-server/src/__tests__/e2e.test.ts`

**Step 1: Tests**

```ts
// apps/mcp-server/src/__tests__/e2e.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import {
  ExtractStyles,
  ExtractComponents,
  ExtractLocalVariables,
  BridgeStatus,
  extractStylesPluginHandler,
  extractComponentsPluginHandler,
  extractLocalVariablesPluginHandler,
  createBridgeStatusServerHandler,
} from "@repo/tools-extract";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";

const allTools = [ExtractStyles, ExtractComponents, ExtractLocalVariables, BridgeStatus];

const setupDaemonAndShim = async () => {
  const dir = await mkdtemp(join(tmpdir(), "mcp-e2e-"));
  const socketPath = join(dir, "daemon.sock");

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
  figma.__seedVariables([
    { id: "v1", name: "color/red", resolvedType: "COLOR", valuesByMode: { m1: "#f00" } },
  ]);

  const daemon = await Daemon.start({
    socketPath,
    figma,
    packs: [
      {
        name: "tools-extract",
        tools: allTools,
        registerPlugin: (reg) => {
          reg.register(ExtractStyles, extractStylesPluginHandler);
          reg.register(ExtractComponents, extractComponentsPluginHandler);
          reg.register(ExtractLocalVariables, extractLocalVariablesPluginHandler);
        },
        registerServer: (reg) => {
          reg.register(
            BridgeStatus,
            createBridgeStatusServerHandler({
              getDaemonInfo: () => ({ pid: process.pid, version: "0.0.0", uptimeMs: 0 }),
              getPluginState: () => ({ connected: false }),
            }),
          );
        },
      },
    ],
  });

  const shim = await createStdioShim({
    socketPath,
    sourceClientId: "e2e-shim",
    tools: allTools,
    mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
  });

  const [serverT, clientT] = InMemoryTransport.createLinkedPair();
  await shim.connectMcp(serverT);
  const client = new Client({ name: "e2e", version: "0.0.0" }, { capabilities: {} });
  await client.connect(clientT);

  return { client, daemon, shim };
};

describe("e2e: AI client → stdio shim → daemon → in-process plugin", () => {
  it("extract_styles returns seeded styles", async () => {
    const { client, daemon, shim } = await setupDaemonAndShim();
    const r = await client.callTool({ name: "extract_styles", arguments: {} });
    expect(JSON.stringify(r)).toContain("primary");
    expect(JSON.stringify(r)).toContain("body");
    expect(JSON.stringify(r)).toContain("shadow");
    await shim.stop();
    await daemon.stop();
  });

  it("extract_components returns seeded components", async () => {
    const { client, daemon, shim } = await setupDaemonAndShim();
    const r = await client.callTool({ name: "extract_components", arguments: {} });
    expect(JSON.stringify(r)).toContain("Button");
    expect(JSON.stringify(r)).toContain("btn");
    await shim.stop();
    await daemon.stop();
  });

  it("extract_local_variables returns seeded variables", async () => {
    const { client, daemon, shim } = await setupDaemonAndShim();
    const r = await client.callTool({ name: "extract_local_variables", arguments: {} });
    expect(JSON.stringify(r)).toContain("color/red");
    await shim.stop();
    await daemon.stop();
  });

  it("bridge_status reports daemon state", async () => {
    const { client, daemon, shim } = await setupDaemonAndShim();
    const r = await client.callTool({ name: "bridge_status", arguments: {} });
    expect(JSON.stringify(r)).toContain("\"connected\":false");
    await shim.stop();
    await daemon.stop();
  });
});
```

**Step 2: Verify all 4 pass.** Commit:

```bash
git add apps/mcp-server/src/__tests__/e2e.test.ts
git commit -m "test(mcp-server): end-to-end in-memory test for all 4 extract tools"
```

---

## Task 3.16: Real-process spawn smoke test (CI-stable)

**Goal:** Spawn `apps/mcp-server` as a real subprocess (twice — once daemon, once shim), drive it with the MCP stdio client, and run one tool. Proves the binary works as published.

**Files:**
- Create: `apps/mcp-server/src/__tests__/spawn.smoke.test.ts`

**Step 1: Tests**

```ts
// apps/mcp-server/src/__tests__/spawn.smoke.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let env: Record<string, string>;
let configDir: string;

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), "mcp-spawn-"));
  env = {
    ...process.env,
    HOME: configDir, // redirect ~/.figma-mcp/ for the test
    FIGMA_MCP_DIR: join(configDir, ".figma-mcp"),
  };
});

afterEach(async () => {
  // Kill any straggler daemon by reading the lockfile and signalling its PID.
  try {
    const lockPath = join(configDir, ".figma-mcp", "daemon.lock");
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(lockPath, "utf-8");
    const { pid } = JSON.parse(raw);
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already dead */
    }
  } catch {
    /* no lockfile, nothing to clean */
  }
});

describe("real-process spawn", () => {
  it(
    "shim spawned via the same binary forks a daemon and runs bridge_status",
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [join(__dirname, "..", "main.ts")],
        env,
      });
      const client = new Client({ name: "spawn-test", version: "0.0.0" }, { capabilities: {} });
      await client.connect(transport);

      const result = await client.callTool({ name: "bridge_status", arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result)).toContain("\"connected\":false");

      await client.close();
    },
    20_000, // longer timeout: real subprocess fork + IPC handshake.
  );
});
```

> **Note:** if Bun running TS directly via `bun src/main.ts` differs from Node, adjust `command` to `"bun"` and `args` to `["run", join(__dirname, "..", "main.ts")]`. The repo uses Bun as the package manager — `bun` should be the runtime here too. Pick whichever works on the developer's machine and pin in CI.

> **`HOME` redirect:** the daemon writes its lockfile to `~/.figma-mcp/`. Pointing `HOME` at a temp dir avoids polluting the user's real home and isolates parallel test runs. If `main.ts` reads from `homedir()` instead of `HOME`, switch the redirect to whatever env var honors the override (`USERPROFILE` on Windows, but Phase 7's problem).

**Step 2: Run, debug, commit**

```bash
git add apps/mcp-server/src/__tests__/spawn.smoke.test.ts
git commit -m "test(mcp-server): real-process spawn smoke test for bridge_status"
```

---

## Task 3.17: Coverage gate + Phase 3 changeset + acceptance

**Files:**
- Create: `.changeset/phase-3-daemon-and-canonical-pack.md`

**Step 1: Coverage on each new package + app**

```bash
bun run --filter @repo/tools-extract test --coverage
bun run --filter @repo/mcp-server test --coverage
```

Confirm thresholds (90/85/90/90 for `@repo/tools-extract`; 80/75/80/80 for `apps/mcp-server`).

If any fall short, add a targeted test rather than relaxing the threshold.

**Step 2: Root acceptance**

```bash
bun run lint
bun run types
bun run test
```

All green.

**Step 3: Verify the canonical pack pattern is reusable**

Manually inspect `packages/tools-extract/src/index.ts`. Confirm:
- A single file exports a list of `ToolDefinition`s (one per tool).
- A separate file exports plugin handlers and server handlers.
- Apps consume via a single import: `import { ExtractStyles, ... } from "@repo/tools-extract"`.

This is the pattern Phase 8 mechanically replicates for ~80 tools.

**Step 4: Write the changeset**

Create `.changeset/phase-3-daemon-and-canonical-pack.md`:

```markdown
---
"@repo/tools-extract": minor
"@repo/mcp-server": minor
"@repo/transport": minor
"@repo/figma-adapter": minor
---

Phase 3: daemon + canonical feature pack end-to-end.

- @repo/mcp-server (apps/mcp-server) — daemon process model with
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
```

**Step 5: Commit**

```bash
git add .changeset/phase-3-daemon-and-canonical-pack.md
git commit -m "chore(changeset): record Phase 3 daemon and canonical pack"
```

**Step 6: Final acceptance pass**

```bash
bun run lint && bun run types && bun run test
git log --oneline | head -25
```

Confirm Phase 3's commit progression reads cleanly.

**Phase 3 done.** The full pipeline AI client → MCP stdio shim → daemon → plugin handler → response works end-to-end. Phase 4 introduces the bridge plugin (real WebSocket-side plugin handlers replacing the in-process FigmaFake-backed registry).

---

## Notes on Execution

**TDD discipline:** every task follows red → green → commit. The integration tests (3.15, 3.16) are not strictly TDD — they're acceptance tests on top of already-built components — but they should still be written before claiming the phase done.

**Commit hygiene:** one task = one commit, with one exception. Tasks 3.10/3.11 (daemon scaffolding) sit on Task 3.9 (Unix sockets); Tasks 3.13/3.14 sit on 3.10/3.11/3.12. The dependency chain is linear.

**`@modelcontextprotocol/sdk` quirks to watch:**
- `Server.setRequestHandler` registers per-method-name handlers. Use the `CallToolRequestSchema` and `ListToolsRequestSchema` Zod schemas exported by the SDK.
- `InMemoryTransport.createLinkedPair()` is what test code uses to drive the server without stdio.
- `result.content` must be an array of `{ type: "text" | "resource" | "image"; ... }` items.
- Tool input schemas need to be JSON Schema for MCP — `zod-to-json-schema` is the bridge.

**Logging:** all tasks use a noop logger. Phase 9 adds structured JSON logging to stderr.

**Coverage target adjustment:** apps target 80/75/80/80 (per the design doc), packages target 90/85/90/90. The `main.ts` is excluded from coverage because its branches are exercised by the spawn smoke test (Task 3.16) which runs the file as a real subprocess outside `vitest --coverage`'s instrumentation.

**Single-instance daemon caveat:** if a developer runs `bun apps/mcp-server/src/main.ts` directly (not via an AI client), they get one shim spawning one daemon. That's fine. If they then run a second invocation, the second shim attaches to the same daemon. Killing all shims doesn't kill the daemon — it's detached. They have to `kill $(cat ~/.figma-mcp/daemon.lock | jq .pid)` or wait for the next invocation to detect the stale state and recover. Phase 7's `figma-mcp doctor` will surface this.

**Out of scope reminders:**
- No real Figma plugin yet — Phase 4.
- No streaming variables — Phase 5.
- No cloud relay — Phase 6.
- No setup CLI / `figma-mcp doctor` — Phase 7.
- No additional packs — Phase 8.

---

## References

- Predecessor plans: `docs/plans/2026-05-06-figma-mcp-rewrite-plan.md`, `docs/plans/2026-05-06-figma-mcp-phase-2.md`.
- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md`.
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- `zod-to-json-schema`: https://github.com/StefanTerdell/zod-to-json-schema
- Node `net` module (Unix sockets): https://nodejs.org/api/net.html
- Node `child_process.spawn` (detached): https://nodejs.org/api/child_process.html#optionsdetached
