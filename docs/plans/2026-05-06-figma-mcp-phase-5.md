# Figma MCP Phase 5 — Variable Streaming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `@repo/tools-variables` — chunked, resumable, idempotent variable import (`import_variables`), paginated export (`export_variables`), batch update (`update_variables_batch`), and resume helper (`stream_status`). Adds the server-side stream session manager to `apps/mcp-server`, plugin-side stream runtime to `apps/bridge-plugin`, and wires MCP `notifications/progress` so AI clients see real-time progress on long imports.

**Architecture:** Streaming uses Phase 1's wire envelopes (`stream-open`, `chunk`, `chunk-ack`, `stream-done`). The daemon's new `StreamSessionManager` parses input source → items, generates a `sessionId`, and runs a chunk loop (send chunk N, await ack N, repeat). Each ack triggers an MCP `notifications/progress` via the stdio shim using the original request's `meta.progressToken`. The plugin's new `StreamRuntime` keeps a per-session idempotency `Map<sessionId, { applied: Set<seq>, ackCache: Map<seq, ChunkAckEnvelope>, createdIds: string[], atomic: boolean }>` so retransmitted chunks are no-ops and atomic-mode failures roll back via `figma.variables.deleteVariableAsync`. `BridgePluginRuntime` is extended to detect `stream-open` envelopes and route subsequent chunks to the StreamRuntime; non-streaming tools dispatch unchanged. Source parsing is intentionally narrow for Phase 5: inline (`{ items: VariableInput[] }`) only — W3C tokens JSON and CSV are deferred to Phase 8.

**Tech Stack:** TypeScript, Bun, Vitest 4.1.4, `fast-check` (10k-variable property tests), `@repo/protocol` / `@repo/transport` / `@repo/figma-adapter` / `@repo/tools-extract` (Phases 1–4), `@modelcontextprotocol/sdk` 1.x.

**Predecessors:** Phase 4 is merged. `Daemon` binds a WS server, completes a handshake, and routes plugin-tool requests over WS via `Correlator`. `BridgePluginRuntime` dispatches request envelopes to registered handlers. `RealFigmaAdapter` wraps `figma.*`. The streaming envelopes from Phase 1 (`StreamOpenEnvelope`, `ChunkEnvelope`, `ChunkAckEnvelope`, `StreamDoneEnvelope`) and `StreamSessionBinding` interface exist but no consumers yet — Phase 5 fills that void.

---

## Acceptance Criteria

- `@repo/tools-variables` exists, builds, lints clean, types clean. Coverage ≥90/85/90/90.
- `@repo/figma-adapter` extended with `createVariable`, `createVariableCollection`, `getVariableCollectionsAsync`, `deleteVariableAsync`. Both `FigmaFake` and `RealFigmaAdapter` implement the new methods. Coverage stays ≥90/85/90/90.
- `@repo/protocol`'s `Envelope` discriminated union now includes the four streaming kinds (`stream-open`, `chunk`, `chunk-ack`, `stream-done`). Coverage stays ≥95/90/95/95.
- `import_variables` flows end-to-end: AI calls → daemon parses source → chunked send to plugin → idempotency-tracked apply → ack-driven MCP progress → final summary. Verified by an in-memory e2e test that imports 2k variables and asserts the summary + monotonic progress notifications.
- `export_variables` returns `{ items, nextCursor }` paginated; cursor exhaustion returns `nextCursor: null`.
- `update_variables_batch` is a thin wrapper around per-item `setValueForMode` (no creation, no atomic semantics — just batch mutation).
- `stream_status` returns `{ lastAckedSeq, applied, failed, atomic, completed }` for any active or recently-completed session id.
- Idempotency: replaying any chunk after its ack is a no-op (the cached ack is returned instead of double-applying).
- Atomic mode: on first failure inside an `atomic: true` session, the plugin rolls back via `deleteVariableAsync` for every id it created during the session. The `chunk-ack` for the failing chunk reports the rollback in `failedDetails`. Subsequent chunks are rejected with `E_STREAM_OUT_OF_ORDER` until the session is reopened.
- 10k-variable smoke test imports in <30 s on the developer machine running tests (relax the threshold on slow CI; document the local target).
- `fast-check` property tests prove: chunking invariants (no gaps, no dups, monotonic), idempotency, partial-failure totals, atomic rollback completeness.
- A changeset records Phase 5 minor bumps for the affected packages.
- Commit hygiene: each task ends with one conventional-commit-formatted commit. No multi-task commits, no `git add -A`.

---

## Task Map

| # | Task | Package / App | Type |
|---|------|---------------|------|
| 5.1 | Extend `Envelope` union with streaming kinds | protocol | code |
| 5.2 | Extend `FigmaAdapter` for variable creation/collections/deletion | figma-adapter | code |
| 5.3 | Scaffold `@repo/tools-variables` | tools-variables | infra |
| 5.4 | Define tool schemas (`import_variables`, `export_variables`, `update_variables_batch`, `stream_status`) | tools-variables | code |
| 5.5 | Plugin handlers: `export_variables`, `update_variables_batch`, `stream_status` | tools-variables | code |
| 5.6 | Plugin-side `StreamRuntime` (idempotency + atomic) | bridge-plugin | code |
| 5.7 | Wire `StreamRuntime` into `BridgePluginRuntime` (stream-open dispatch) | bridge-plugin | code |
| 5.8 | Server-side `StreamSessionManager` + `import_variables` server handler factory | mcp-server | code |
| 5.9 | Wire MCP `notifications/progress` through the stdio shim | mcp-server | code |
| 5.10 | Property tests: chunking invariants, idempotency, partial-failure | tools-variables | tests |
| 5.11 | End-to-end + 10k-variable smoke + atomic rollback test | mcp-server | tests |
| 5.12 | Coverage gate + Phase 5 changeset + acceptance | repo | infra |

---

## Task 5.1: Extend `Envelope` union with streaming kinds

**Why first:** every transport hop relies on `parseEnvelope` accepting incoming wire frames. Adding the four streaming kinds early means every subsequent task can rely on them flowing through unchanged.

**Files:**
- Modify: `packages/protocol/src/envelope.ts`
- Modify: `packages/protocol/src/__tests__/envelope.test.ts`

**Step 1: Add the failing assertions** in `envelope.test.ts`:

```ts
it("accepts a stream-open via parseEnvelope", () => {
  const env = parseEnvelope({
    kind: "stream-open",
    id: "req_1",
    sessionId: "ses_a",
    tool: "import_variables",
    total: 100,
    atomic: false,
  });
  expect(env.kind).toBe("stream-open");
});

it("accepts a chunk via parseEnvelope", () => {
  const env = parseEnvelope({
    kind: "chunk",
    id: "req_1",
    sessionId: "ses_a",
    seq: 0,
    total: 100,
    items: [],
    idempotencyKey: "ses_a:0",
  });
  expect(env.kind).toBe("chunk");
});

it("accepts a chunk-ack via parseEnvelope", () => {
  const env = parseEnvelope({
    kind: "chunk-ack",
    id: "req_1",
    sessionId: "ses_a",
    seq: 0,
    applied: 100,
    failed: 0,
  });
  expect(env.kind).toBe("chunk-ack");
});

it("accepts a stream-done via parseEnvelope", () => {
  const env = parseEnvelope({
    kind: "stream-done",
    id: "req_1",
    sessionId: "ses_a",
    summary: { total: 100, applied: 100, failed: 0 },
  });
  expect(env.kind).toBe("stream-done");
});
```

Run: `bun run --filter @repo/protocol test envelope` → FAIL (`Invalid discriminator value`).

**Step 2: Implement** — modify `packages/protocol/src/envelope.ts`:

```ts
import {
  ChunkAckEnvelope,
  ChunkEnvelope,
  StreamDoneEnvelope,
  StreamOpenEnvelope,
} from "./streaming";
import { HandshakeRequestEnvelope, HandshakeResponseEnvelope } from "./handshake";

// ... existing schemas ...

export const Envelope = z.discriminatedUnion("kind", [
  RequestEnvelope,
  ResponseEnvelope,
  ErrorEnvelope,
  HandshakeRequestEnvelope,
  HandshakeResponseEnvelope,
  StreamOpenEnvelope,
  ChunkEnvelope,
  ChunkAckEnvelope,
  StreamDoneEnvelope,
]);
```

**Step 3: Update the type-narrowing test** (if Phase 4 added one similar to Phase 1's pattern) — exhaustive switch must handle the new four kinds. Add a no-op branch each.

**Step 4: Run tests, commit**

`bun run --filter @repo/protocol test` — was 72 (Phase 4), now 76.

```bash
git add packages/protocol/src/envelope.ts packages/protocol/src/__tests__/envelope.test.ts
git commit -m "feat(protocol): include streaming kinds in the Envelope union"
```

---

## Task 5.2: Extend `FigmaAdapter` for variable creation/collections/deletion

**Why now:** Phase 5 plugin handlers create new variables and collections, and atomic mode requires deletion. The existing surface only reads + mutates; we need create + delete.

**Files:**
- Modify: `packages/figma-adapter/src/adapter.ts`
- Modify: `packages/figma-adapter/src/figma-fake.ts`
- Modify: `packages/figma-adapter/src/real-figma-adapter.ts`
- Modify: `packages/figma-adapter/src/__tests__/adapter.test.ts`
- Modify: `packages/figma-adapter/src/__tests__/figma-fake.test.ts`
- Modify: `packages/figma-adapter/src/__tests__/real-figma-adapter.test.ts`
- Modify: `packages/figma-adapter/src/index.ts`

**Step 1: Type contract additions in `adapter.ts`**

```ts
export interface VariableCollection {
  readonly id: string;
  readonly name: string;
  readonly modes: readonly { readonly id: string; readonly name: string }[];
}

export interface FigmaAdapter {
  // ...existing...
  getLocalVariableCollectionsAsync(): Promise<VariableCollection[]>;
  createVariableCollection(args: { name: string }): Promise<VariableCollection>;
  createVariable(args: {
    name: string;
    collectionId: string;
    resolvedType: Variable["resolvedType"];
  }): Promise<Variable>;
  deleteVariableAsync(id: string): Promise<void>;
}
```

Re-export `VariableCollection` from `index.ts`.

**Step 2: Type-contract test** — append to `adapter.test.ts`:

```ts
it("declares getLocalVariableCollectionsAsync", () => {
  expectTypeOf<FigmaAdapter["getLocalVariableCollectionsAsync"]>().returns.resolves
    .toEqualTypeOf<VariableCollection[]>();
});
it("declares createVariableCollection", () => {
  expectTypeOf<FigmaAdapter["createVariableCollection"]>().parameter(0).toEqualTypeOf<{ name: string }>();
});
it("declares createVariable", () => {
  expectTypeOf<FigmaAdapter["createVariable"]>().parameter(0).toEqualTypeOf<{
    name: string;
    collectionId: string;
    resolvedType: Variable["resolvedType"];
  }>();
});
it("declares deleteVariableAsync", () => {
  expectTypeOf<FigmaAdapter["deleteVariableAsync"]>().parameter(0).toEqualTypeOf<string>();
});
```

Run types — fails (FigmaFake and RealFigmaAdapter don't yet implement). Continue.

**Step 3: Implement on `FigmaFake`** — add 4 new methods + a private `Map<string, MutableCollection>` for collections + a counter for new ids. Track variables in the existing Map.

```ts
private readonly collections = new Map<string, VariableCollection>();
private collectionCounter = 0;
private variableCounter = 0;

async getLocalVariableCollectionsAsync(): Promise<VariableCollection[]> {
  return Array.from(this.collections.values());
}
async createVariableCollection(args: { name: string }): Promise<VariableCollection> {
  const id = `vc${++this.collectionCounter}`;
  const collection: VariableCollection = {
    id,
    name: args.name,
    modes: [{ id: `m${id}_default`, name: "Default" }],
  };
  this.collections.set(id, collection);
  return collection;
}
async createVariable(args: {
  name: string;
  collectionId: string;
  resolvedType: Variable["resolvedType"];
}): Promise<Variable> {
  if (!this.collections.has(args.collectionId)) {
    throw new Error(`collection not found: ${args.collectionId}`);
  }
  const id = `v${++this.variableCounter}`;
  const variable: MutableVariable = {
    id,
    name: args.name,
    resolvedType: args.resolvedType,
    valuesByMode: {},
  };
  this.variables.set(id, variable);
  return {
    id,
    name: variable.name,
    resolvedType: variable.resolvedType,
    valuesByMode: { ...variable.valuesByMode },
  };
}
async deleteVariableAsync(id: string): Promise<void> {
  if (!this.variables.has(id)) {
    throw new Error(`variable not found: ${id}`);
  }
  this.variables.delete(id);
}

__seedCollections(collections: readonly VariableCollection[]): void {
  for (const c of collections) this.collections.set(c.id, c);
}
```

**Step 4: Tests on FigmaFake** — append to `figma-fake.test.ts`:

- `createVariableCollection` returns a collection with id starting `vc`, name as passed, default mode.
- `createVariable` with a missing collection rejects.
- `createVariable` with a real collection returns a Variable with id starting `v` and the passed type.
- `deleteVariableAsync` removes the variable; subsequent `getLocalVariablesAsync` doesn't include it.
- `deleteVariableAsync` on a missing id rejects.
- `getLocalVariableCollectionsAsync` returns seeded collections.
- `__seedCollections` round-trips.

**Step 5: Implement on `RealFigmaAdapter`**

```ts
async getLocalVariableCollectionsAsync(): Promise<VariableCollection[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    modes: c.modes.map((m) => ({ id: m.modeId, name: m.name })),
  }));
}
async createVariableCollection(args: { name: string }): Promise<VariableCollection> {
  const c = figma.variables.createVariableCollection(args.name);
  return {
    id: c.id,
    name: c.name,
    modes: c.modes.map((m) => ({ id: m.modeId, name: m.name })),
  };
}
async createVariable(args: {
  name: string;
  collectionId: string;
  resolvedType: Variable["resolvedType"];
}): Promise<Variable> {
  const v = figma.variables.createVariable(
    args.name,
    args.collectionId,
    args.resolvedType as never,
  );
  return {
    id: v.id,
    name: v.name,
    resolvedType: v.resolvedType as Variable["resolvedType"],
    valuesByMode: { ...v.valuesByMode } as Variable["valuesByMode"],
  };
}
async deleteVariableAsync(id: string): Promise<void> {
  const v = await figma.variables.getVariableByIdAsync(id);
  if (!v) throw new Error(`variable not found: ${id}`);
  v.remove();
}
```

> **Note on Figma's API:** `figma.variables.createVariable` returns synchronously (not a Promise) per the typings. We wrap in `async` to match the adapter contract. `Variable.remove()` is the deletion entry point.

**Step 6: Tests on RealFigmaAdapter** — append 4 stub-figma tests mirroring FigmaFake's: collection list, collection creation, variable creation (happy + missing collection), deletion (happy + missing).

**Step 7: Verify, commit**

`bun run --filter @repo/figma-adapter test` — was 33 (Phase 4), now 41+.
`bun run --filter @repo/figma-adapter types` and `lint` — clean.

```bash
git add packages/figma-adapter/src/adapter.ts packages/figma-adapter/src/figma-fake.ts packages/figma-adapter/src/real-figma-adapter.ts packages/figma-adapter/src/__tests__/adapter.test.ts packages/figma-adapter/src/__tests__/figma-fake.test.ts packages/figma-adapter/src/__tests__/real-figma-adapter.test.ts packages/figma-adapter/src/index.ts
git commit -m "feat(figma-adapter): variable creation, collection lookup, and deletion"
```

---

## Task 5.3: Scaffold `@repo/tools-variables`

**Files:**
- Create: `packages/tools-variables/package.json`
- Create: `packages/tools-variables/tsconfig.json`
- Create: `packages/tools-variables/vitest.config.ts`
- Create: `packages/tools-variables/src/index.ts`

**Step 1: `package.json`**

```json
{
  "name": "@repo/tools-variables",
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
    "fast-check": "^3.23.0",
    "typescript": "^6.0.0",
    "vitest": "4.1.4"
  }
}
```

> `fast-check` is a devDep here for the property tests (Task 5.10). Mirrors `@repo/transport`'s pattern.

**Step 2: `tsconfig.json`** — identical to `@repo/tools-extract`'s.

**Step 3: `vitest.config.ts`** — same shape as `@repo/tools-extract`'s. 90/85/90/90 thresholds. `passWithNoTests: true`.

**Step 4: `src/index.ts`**

```ts
/**
 * @repo/tools-variables — streaming feature pack: variable import/export.
 *
 * Tools: import_variables (streaming), export_variables (paginated),
 * update_variables_batch, stream_status. Pattern follows @repo/tools-extract
 * but adds the streaming wire protocol via stream-open/chunk/ack/done envelopes.
 */
export {};
```

**Step 5: Verify**

`bun install`, then run lint/types/test for the new package — all pass.

**Step 6: Commit**

```bash
git add packages/tools-variables bun.lock
git commit -m "feat(tools-variables): scaffold @repo/tools-variables package"
```

---

## Task 5.4: Define tool schemas

**Files:**
- Create: `packages/tools-variables/src/tools.ts`
- Create: `packages/tools-variables/src/__tests__/tools.test.ts`
- Modify: `packages/tools-variables/src/index.ts`

**Step 1: Failing tests**

```ts
// packages/tools-variables/src/__tests__/tools.test.ts
import { describe, expect, it } from "vitest";
import {
  ImportVariables,
  ExportVariables,
  UpdateVariablesBatch,
  StreamStatus,
} from "../tools";

describe("tools-variables tool definitions", () => {
  it("ImportVariables is streaming and accepts an inline source", () => {
    expect(ImportVariables.name).toBe("import_variables");
    expect(ImportVariables.streaming).toBe(true);
    const r = ImportVariables.input.safeParse({
      source: {
        kind: "inline",
        items: [
          {
            name: "color/red",
            collection: "Brand",
            resolvedType: "COLOR",
            valuesByMode: { Default: { r: 1, g: 0, b: 0 } },
          },
        ],
      },
      atomic: false,
      chunkSize: 100,
    });
    expect(r.success).toBe(true);
  });

  it("ExportVariables accepts pageSize + cursor", () => {
    expect(ExportVariables.streaming).toBe(false);
    const r = ExportVariables.input.safeParse({ pageSize: 100, cursor: null });
    expect(r.success).toBe(true);
  });

  it("UpdateVariablesBatch accepts an array of updates", () => {
    expect(UpdateVariablesBatch.streaming).toBe(false);
    const r = UpdateVariablesBatch.input.safeParse({
      updates: [{ variableId: "v1", modeId: "m1", value: "#f00" }],
    });
    expect(r.success).toBe(true);
  });

  it("StreamStatus accepts a sessionId", () => {
    const r = StreamStatus.input.safeParse({ sessionId: "ses_a" });
    expect(r.success).toBe(true);
  });

  it("ImportVariables output reports applied/failed totals + sessionId", () => {
    const r = ImportVariables.output.safeParse({
      sessionId: "ses_a",
      total: 10,
      applied: 9,
      failed: 1,
      failedDetails: [{ index: 0, reason: "name conflict" }],
    });
    expect(r.success).toBe(true);
  });
});
```

Run — FAIL.

**Step 2: Implement `tools.ts`**

```ts
import { z } from "zod";
import { defineTool } from "@repo/protocol";

const ResolvedType = z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]);

const VariableInput = z.object({
  name: z.string().min(1),
  collection: z.string().min(1),
  resolvedType: ResolvedType,
  valuesByMode: z.record(z.unknown()),
});
export type VariableInput = z.infer<typeof VariableInput>;

const InlineSource = z.object({
  kind: z.literal("inline"),
  items: z.array(VariableInput),
});

const ImportSource = z.discriminatedUnion("kind", [InlineSource]);
// Phase 8 will append W3C tokens JSON / CSV variants here.

const FailedDetail = z.object({
  index: z.number().int().nonnegative(),
  reason: z.string(),
  name: z.string().optional(),
});

const ImportSummary = z.object({
  sessionId: z.string(),
  total: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  failedDetails: z.array(FailedDetail).default([]),
});

export const ImportVariables = defineTool({
  name: "import_variables",
  description: "Stream variables into the current Figma file. Resumable + idempotent. Set atomic:true to roll back on first failure.",
  streaming: true,
  input: z.object({
    source: ImportSource,
    atomic: z.boolean().default(false),
    chunkSize: z.number().int().min(1).max(1000).default(100),
  }),
  output: ImportSummary,
});

const VariableSummary = z.object({
  id: z.string(),
  name: z.string(),
  resolvedType: ResolvedType,
  valuesByMode: z.record(z.unknown()),
});

export const ExportVariables = defineTool({
  name: "export_variables",
  description: "Return local variables, paginated. Pass nextCursor to resume.",
  streaming: false,
  input: z.object({
    pageSize: z.number().int().min(1).max(1000).default(100),
    cursor: z.union([z.string(), z.null()]).default(null),
  }),
  output: z.object({
    items: z.array(VariableSummary),
    nextCursor: z.union([z.string(), z.null()]),
  }),
});

export const UpdateVariablesBatch = defineTool({
  name: "update_variables_batch",
  description: "Apply many setValueForMode calls in one request. Non-atomic: per-item failures don't stop the rest.",
  streaming: false,
  input: z.object({
    updates: z.array(
      z.object({
        variableId: z.string(),
        modeId: z.string(),
        value: z.unknown(),
      }),
    ),
  }),
  output: z.object({
    applied: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    failedDetails: z.array(FailedDetail).default([]),
  }),
});

export const StreamStatus = defineTool({
  name: "stream_status",
  description: "Report progress of an in-flight or recently-completed import session.",
  streaming: false,
  input: z.object({ sessionId: z.string() }),
  output: z.object({
    sessionId: z.string(),
    lastAckedSeq: z.number().int().nonnegative(),
    applied: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    atomic: z.boolean(),
    completed: z.boolean(),
  }),
});

// Re-export the input shape for downstream use.
export { VariableInput as VariableInputSchema };
```

**Step 3: Update `index.ts`**

```ts
export {
  ImportVariables,
  ExportVariables,
  UpdateVariablesBatch,
  StreamStatus,
  type VariableInput,
} from "./tools";
```

**Step 4: Run tests, commit**

```bash
git add packages/tools-variables/src/tools.ts packages/tools-variables/src/__tests__/tools.test.ts packages/tools-variables/src/index.ts
git commit -m "feat(tools-variables): define tool schemas (import + export + batch + stream_status)"
```

---

## Task 5.5: Plugin handlers — non-streaming variable tools

**Goal:** Implement `export_variables`, `update_variables_batch`, `stream_status` as PluginHandlers (the streaming `import_variables` is handled by `StreamRuntime` in Tasks 5.6/5.7, not a regular handler).

**Files:**
- Create: `packages/tools-variables/src/plugin-handlers.ts`
- Create: `packages/tools-variables/src/__tests__/plugin-handlers.test.ts`
- Modify: `packages/tools-variables/src/index.ts`

**Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { FigmaFake } from "@repo/figma-adapter/testing";
import {
  exportVariablesPluginHandler,
  updateVariablesBatchPluginHandler,
  createStreamStatusPluginHandler,
} from "../plugin-handlers";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe("exportVariablesPluginHandler", () => {
  it("returns the first page when no cursor is given", async () => {
    const figma = new FigmaFake();
    figma.__seedVariables(
      Array.from({ length: 5 }, (_, i) => ({
        id: `v${i}`,
        name: `var-${i}`,
        resolvedType: "FLOAT" as const,
        valuesByMode: {},
      })),
    );
    const r = await exportVariablesPluginHandler(
      { pageSize: 3, cursor: null },
      { logger: noopLogger, figma },
    );
    expect(r.items).toHaveLength(3);
    expect(r.nextCursor).toBe("3");
  });
  it("returns final page with nextCursor null", async () => {
    const figma = new FigmaFake();
    figma.__seedVariables(
      Array.from({ length: 5 }, (_, i) => ({
        id: `v${i}`,
        name: `var-${i}`,
        resolvedType: "FLOAT" as const,
        valuesByMode: {},
      })),
    );
    const r = await exportVariablesPluginHandler(
      { pageSize: 3, cursor: "3" },
      { logger: noopLogger, figma },
    );
    expect(r.items).toHaveLength(2);
    expect(r.nextCursor).toBeNull();
  });
});

describe("updateVariablesBatchPluginHandler", () => {
  it("applies many updates and reports per-item failures", async () => {
    const figma = new FigmaFake();
    figma.__seedVariables([
      { id: "v1", name: "x", resolvedType: "FLOAT", valuesByMode: { m1: 1 } },
    ]);
    const r = await updateVariablesBatchPluginHandler(
      {
        updates: [
          { variableId: "v1", modeId: "m1", value: 2 },
          { variableId: "missing", modeId: "m1", value: 0 },
        ],
      },
      { logger: noopLogger, figma },
    );
    expect(r.applied).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.failedDetails[0].index).toBe(1);
  });
});

describe("createStreamStatusPluginHandler", () => {
  it("returns the live status from the provided StreamRuntime", async () => {
    const handler = createStreamStatusPluginHandler({
      getStatus: () => ({ lastAckedSeq: 4, applied: 400, failed: 1, atomic: false, completed: false }),
    });
    const r = await handler(
      { sessionId: "ses_a" },
      { logger: noopLogger, figma: new FigmaFake() },
    );
    expect(r.lastAckedSeq).toBe(4);
    expect(r.completed).toBe(false);
    expect(r.sessionId).toBe("ses_a");
  });
});
```

**Step 2: Implement**

```ts
// packages/tools-variables/src/plugin-handlers.ts
import type { PluginHandler } from "@repo/protocol";
import type { ExportVariables, StreamStatus, UpdateVariablesBatch } from "./tools";

export const exportVariablesPluginHandler: PluginHandler<typeof ExportVariables> =
  async ({ pageSize, cursor }, { figma }) => {
    const all = await figma.getLocalVariablesAsync();
    const start = cursor ? Number(cursor) : 0;
    const end = Math.min(start + pageSize, all.length);
    const items = all.slice(start, end).map((v) => ({
      id: v.id,
      name: v.name,
      resolvedType: v.resolvedType,
      valuesByMode: { ...v.valuesByMode },
    }));
    return {
      items,
      nextCursor: end < all.length ? String(end) : null,
    };
  };

export const updateVariablesBatchPluginHandler: PluginHandler<typeof UpdateVariablesBatch> =
  async ({ updates }, { figma }) => {
    let applied = 0;
    let failed = 0;
    const failedDetails: Array<{ index: number; reason: string; name?: string }> = [];
    for (let i = 0; i < updates.length; i++) {
      const u = updates[i];
      try {
        await figma.setValueForMode({
          variableId: u.variableId,
          modeId: u.modeId,
          value: u.value,
        });
        applied++;
      } catch (err) {
        failed++;
        failedDetails.push({
          index: i,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { applied, failed, failedDetails };
  };

export interface StreamStatusProvider {
  readonly getStatus: (sessionId: string) =>
    | { lastAckedSeq: number; applied: number; failed: number; atomic: boolean; completed: boolean }
    | null;
}

export function createStreamStatusPluginHandler(
  providers: StreamStatusProvider,
): PluginHandler<typeof StreamStatus> {
  return async ({ sessionId }) => {
    const status = providers.getStatus(sessionId);
    if (!status) {
      // Treat unknown sessions as completed-with-no-data — caller decides what to do.
      return {
        sessionId,
        lastAckedSeq: 0,
        applied: 0,
        failed: 0,
        atomic: false,
        completed: true,
      };
    }
    return { sessionId, ...status };
  };
}
```

**Step 3: Update `index.ts`**

```ts
export * from "./plugin-handlers";
```

Run tests, commit.

```bash
git add packages/tools-variables/src/plugin-handlers.ts packages/tools-variables/src/__tests__/plugin-handlers.test.ts packages/tools-variables/src/index.ts
git commit -m "feat(tools-variables): plugin handlers for export/update_batch/stream_status"
```

---

## Task 5.6: Plugin-side `StreamRuntime` (idempotency + atomic)

**Goal:** A class that owns the per-session import state. Receives `chunk` envelopes, applies items via the FigmaAdapter, sends back `chunk-ack`. Tracks idempotency via `applied: Set<seq>`. Atomic mode: track every variable id created during the session; on first failure, delete them all.

**Files:**
- Create: `apps/bridge-plugin/src/streaming/stream-runtime.ts`
- Create: `apps/bridge-plugin/src/streaming/__tests__/stream-runtime.test.ts`

**Step 1: Failing tests**

```ts
// apps/bridge-plugin/src/streaming/__tests__/stream-runtime.test.ts
import { describe, expect, it, vi } from "vitest";
import { FigmaFake } from "@repo/figma-adapter/testing";
import type { ChunkEnvelope } from "@repo/protocol";
import { StreamRuntime } from "../stream-runtime";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const itemFor = (name: string, collection = "Brand") => ({
  name,
  collection,
  resolvedType: "FLOAT" as const,
  valuesByMode: { Default: 1 },
});

describe("StreamRuntime", () => {
  it("opens a session and applies a chunk", async () => {
    const figma = new FigmaFake();
    figma.__seedCollections([{ id: "vc1", name: "Brand", modes: [{ id: "m1", name: "Default" }] }]);
    const runtime = new StreamRuntime({ figma, logger: noopLogger });

    runtime.openSession({ sessionId: "ses_a", total: 2, atomic: false });
    const ack = await runtime.applyChunk({
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 2,
      items: [itemFor("a"), itemFor("b")],
      idempotencyKey: "ses_a:0",
    });
    expect(ack.applied).toBe(2);
    expect(ack.failed).toBe(0);
  });

  it("returns the cached ack for a duplicate chunk (idempotency)", async () => {
    const figma = new FigmaFake();
    figma.__seedCollections([{ id: "vc1", name: "Brand", modes: [{ id: "m1", name: "Default" }] }]);
    const runtime = new StreamRuntime({ figma, logger: noopLogger });
    runtime.openSession({ sessionId: "ses_a", total: 1, atomic: false });

    const chunk: ChunkEnvelope = {
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 1,
      items: [itemFor("a")],
      idempotencyKey: "ses_a:0",
    };
    const ack1 = await runtime.applyChunk(chunk);
    const ack2 = await runtime.applyChunk(chunk);
    expect(ack1.applied).toBe(1);
    expect(ack2.applied).toBe(1);
    // Apply was called once, not twice.
    const status = runtime.getStatus("ses_a");
    expect(status?.applied).toBe(1);
  });

  it("captures per-item failures in the ack", async () => {
    const figma = new FigmaFake();
    figma.__seedCollections([{ id: "vc1", name: "Brand", modes: [{ id: "m1", name: "Default" }] }]);
    const createSpy = vi.spyOn(figma, "createVariable");
    createSpy.mockImplementationOnce(async (args) =>
      ({ id: "v1", name: args.name, resolvedType: args.resolvedType, valuesByMode: {} }),
    );
    createSpy.mockRejectedValueOnce(new Error("name conflict"));
    createSpy.mockImplementationOnce(async (args) =>
      ({ id: "v3", name: args.name, resolvedType: args.resolvedType, valuesByMode: {} }),
    );

    const runtime = new StreamRuntime({ figma, logger: noopLogger });
    runtime.openSession({ sessionId: "ses_a", total: 3, atomic: false });
    const ack = await runtime.applyChunk({
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 3,
      items: [itemFor("a"), itemFor("dup"), itemFor("c")],
      idempotencyKey: "ses_a:0",
    });
    expect(ack.applied).toBe(2);
    expect(ack.failed).toBe(1);
    expect(ack.failedDetails[0]).toMatchObject({ index: 1, reason: expect.stringMatching(/conflict/) });
  });

  it("atomic mode rolls back created variables on failure", async () => {
    const figma = new FigmaFake();
    figma.__seedCollections([{ id: "vc1", name: "Brand", modes: [{ id: "m1", name: "Default" }] }]);
    const deleteSpy = vi.spyOn(figma, "deleteVariableAsync");
    const runtime = new StreamRuntime({ figma, logger: noopLogger });
    runtime.openSession({ sessionId: "ses_a", total: 3, atomic: true });

    // Inject a failure on the second item.
    const createSpy = vi.spyOn(figma, "createVariable");
    let count = 0;
    createSpy.mockImplementation(async (args) => {
      if (++count === 2) throw new Error("conflict");
      return { id: `v${count}`, name: args.name, resolvedType: args.resolvedType, valuesByMode: {} };
    });

    const ack = await runtime.applyChunk({
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 3,
      items: [itemFor("a"), itemFor("b"), itemFor("c")],
      idempotencyKey: "ses_a:0",
    });
    expect(ack.failed).toBeGreaterThanOrEqual(1);
    // The successful create from item 0 was rolled back.
    expect(deleteSpy).toHaveBeenCalledWith("v1");
  });

  it("rejects out-of-order chunks with E_STREAM_OUT_OF_ORDER", async () => {
    const figma = new FigmaFake();
    figma.__seedCollections([{ id: "vc1", name: "Brand", modes: [{ id: "m1", name: "Default" }] }]);
    const runtime = new StreamRuntime({ figma, logger: noopLogger });
    runtime.openSession({ sessionId: "ses_a", total: 5, atomic: false });
    await runtime.applyChunk({
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 5,
      items: [itemFor("a")],
      idempotencyKey: "ses_a:0",
    });
    await expect(
      runtime.applyChunk({
        kind: "chunk",
        id: "req_1",
        sessionId: "ses_a",
        seq: 2,
        total: 5,
        items: [itemFor("c")],
        idempotencyKey: "ses_a:2",
      }),
    ).rejects.toThrow(/out of order/i);
  });
});
```

**Step 2: Implement**

```ts
// apps/bridge-plugin/src/streaming/stream-runtime.ts
import type { FigmaAdapter, VariableCollection } from "@repo/figma-adapter";
import {
  type ChunkAckEnvelope,
  type ChunkEnvelope,
  type Logger,
  ErrorCode,
} from "@repo/protocol";
import type { VariableInput } from "@repo/tools-variables";

export interface StreamRuntimeOptions {
  readonly figma: FigmaAdapter;
  readonly logger?: Logger;
}

interface SessionState {
  total: number;
  atomic: boolean;
  appliedSeqs: Set<number>;
  ackCache: Map<number, ChunkAckEnvelope>;
  appliedCount: number;
  failedCount: number;
  createdIds: string[];
  collectionsCache: Map<string, VariableCollection>;
  rolledBack: boolean;
  completed: boolean;
}

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class StreamRuntime {
  private readonly figma: FigmaAdapter;
  private readonly logger: Logger;
  private readonly sessions = new Map<string, SessionState>();

  constructor(options: StreamRuntimeOptions) {
    this.figma = options.figma;
    this.logger = options.logger ?? noopLogger;
  }

  openSession(args: { sessionId: string; total: number; atomic: boolean }): void {
    this.sessions.set(args.sessionId, {
      total: args.total,
      atomic: args.atomic,
      appliedSeqs: new Set(),
      ackCache: new Map(),
      appliedCount: 0,
      failedCount: 0,
      createdIds: [],
      collectionsCache: new Map(),
      rolledBack: false,
      completed: false,
    });
  }

  closeSession(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.completed = true;
    // Keep state so stream_status can report; trim aggressively in production.
  }

  getStatus(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    return {
      lastAckedSeq: s.appliedSeqs.size === 0 ? 0 : Math.max(...s.appliedSeqs),
      applied: s.appliedCount,
      failed: s.failedCount,
      atomic: s.atomic,
      completed: s.completed,
    };
  }

  async applyChunk(env: ChunkEnvelope): Promise<ChunkAckEnvelope> {
    const session = this.sessions.get(env.sessionId);
    if (!session) {
      const err = new Error(`session not found: ${env.sessionId}`);
      (err as { code?: string }).code = ErrorCode.E_STREAM_SESSION_NOT_FOUND;
      throw err;
    }

    // Idempotency: replayed chunk → return cached ack.
    if (session.appliedSeqs.has(env.seq)) {
      const cached = session.ackCache.get(env.seq);
      if (cached) return cached;
    }

    // Out-of-order: only contiguous next-seq accepted.
    const expectedSeq = session.appliedSeqs.size === 0 ? 0 : Math.max(...session.appliedSeqs) + 1;
    if (env.seq !== expectedSeq) {
      const err = new Error(`chunk seq ${env.seq} out of order; expected ${expectedSeq}`);
      (err as { code?: string }).code = ErrorCode.E_STREAM_OUT_OF_ORDER;
      throw err;
    }

    if (session.rolledBack) {
      const err = new Error(`session ${env.sessionId} was rolled back`);
      (err as { code?: string }).code = ErrorCode.E_STREAM_OUT_OF_ORDER;
      throw err;
    }

    const items = env.items as VariableInput[];
    const failedDetails: Array<{ index: number; reason: string; name?: string }> = [];
    let applied = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        await this.applyItem(session, item);
        applied++;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failedDetails.push({ index: i, reason, name: item.name });
        if (session.atomic) {
          await this.rollback(session);
          // Mark the rest of this chunk as failed.
          for (let j = i + 1; j < items.length; j++) {
            failedDetails.push({ index: j, reason: "rolled back", name: items[j].name });
          }
          break;
        }
      }
    }

    const failed = failedDetails.length;
    session.appliedSeqs.add(env.seq);
    session.appliedCount += applied;
    session.failedCount += failed;

    const ack: ChunkAckEnvelope = {
      kind: "chunk-ack",
      id: env.id,
      sessionId: env.sessionId,
      seq: env.seq,
      applied,
      failed,
      failedDetails,
    };
    session.ackCache.set(env.seq, ack);
    return ack;
  }

  private async applyItem(session: SessionState, item: VariableInput): Promise<void> {
    // Resolve collection by name (cached per-session).
    let collection = session.collectionsCache.get(item.collection);
    if (!collection) {
      const all = await this.figma.getLocalVariableCollectionsAsync();
      collection = all.find((c) => c.name === item.collection);
      if (!collection) {
        collection = await this.figma.createVariableCollection({ name: item.collection });
      }
      session.collectionsCache.set(item.collection, collection);
    }

    const variable = await this.figma.createVariable({
      name: item.name,
      collectionId: collection.id,
      resolvedType: item.resolvedType,
    });
    session.createdIds.push(variable.id);

    // Apply each mode value (mode names map to the collection's mode ids — for Phase 5
    // use first mode for unknowns). Production resolution is Phase 8 work.
    for (const [modeName, value] of Object.entries(item.valuesByMode)) {
      const mode = collection.modes.find((m) => m.name === modeName) ?? collection.modes[0];
      await this.figma.setValueForMode({ variableId: variable.id, modeId: mode.id, value });
    }
  }

  private async rollback(session: SessionState): Promise<void> {
    for (const id of session.createdIds) {
      try {
        await this.figma.deleteVariableAsync(id);
      } catch (err) {
        this.logger.warn("rollback: failed to delete", { id, err: String(err) });
      }
    }
    session.createdIds = [];
    session.rolledBack = true;
  }
}
```

> **Note on apply semantics:** For Phase 5 each item is `createVariable` + `setValueForMode` per mode. Updates (`setValueForMode` only) belong in `update_variables_batch`. The boundary keeps this task focused.

**Step 3: Run tests, commit**

```bash
git add apps/bridge-plugin/src/streaming/stream-runtime.ts apps/bridge-plugin/src/streaming/__tests__/stream-runtime.test.ts
git commit -m "feat(bridge-plugin): StreamRuntime applies chunks with idempotency + atomic rollback"
```

---

## Task 5.7: Wire `StreamRuntime` into `BridgePluginRuntime`

**Goal:** `BridgePluginRuntime` already dispatches request envelopes to handlers. Extend it to detect `stream-open` envelopes, instantiate a session in `StreamRuntime`, and route subsequent `chunk` envelopes (matched by `sessionId`) to `streamRuntime.applyChunk`.

**Files:**
- Modify: `apps/bridge-plugin/src/runtime.ts`
- Modify: `apps/bridge-plugin/src/__tests__/runtime.test.ts`

**Step 1: Failing test** — append:

```ts
import { StreamRuntime } from "../streaming/stream-runtime";

it("routes stream-open + chunk envelopes through the StreamRuntime", async () => {
  const [pluginSide, daemonSide] = createInMemoryTransportPair();
  const figma = new FigmaFake();
  figma.__seedCollections([{ id: "vc1", name: "Brand", modes: [{ id: "m1", name: "Default" }] }]);
  const streamRuntime = new StreamRuntime({ figma });
  const runtime = new BridgePluginRuntime({
    transport: pluginSide,
    version: "0.0.0",
    figma,
    streamRuntime,
  });
  runtime.start();

  const acks: unknown[] = [];
  daemonSide.onMessage((env) => {
    if (env.kind === "chunk-ack") acks.push(env);
  });

  await daemonSide.send({
    kind: "stream-open",
    id: "req_1",
    sessionId: "ses_a",
    tool: "import_variables",
    total: 1,
    atomic: false,
  } as never);
  await daemonSide.send({
    kind: "chunk",
    id: "req_1",
    sessionId: "ses_a",
    seq: 0,
    total: 1,
    items: [{ name: "x", collection: "Brand", resolvedType: "FLOAT", valuesByMode: { Default: 1 } }],
    idempotencyKey: "ses_a:0",
  } as never);

  await new Promise((r) => setTimeout(r, 50));
  expect(acks).toHaveLength(1);
  expect((acks[0] as { applied: number }).applied).toBe(1);
});
```

**Step 2: Implement**

In `runtime.ts`, extend `BridgePluginRuntimeOptions`:

```ts
import type { StreamRuntime } from "./streaming/stream-runtime";

export interface BridgePluginRuntimeOptions {
  // ... existing ...
  readonly streamRuntime?: StreamRuntime;
}
```

In `handle`, before the existing kind dispatch:

```ts
private async handle(env: Envelope): Promise<void> {
  // Streaming dispatch (Phase 5).
  if (env.kind === "stream-open" && this.streamRuntime) {
    this.streamRuntime.openSession({
      sessionId: env.sessionId,
      total: env.total,
      atomic: env.atomic,
    });
    return;
  }
  if (env.kind === "chunk" && this.streamRuntime) {
    try {
      const ack = await this.streamRuntime.applyChunk(env);
      await this.transport.send(ack);
    } catch (err) {
      const errEnv: ErrorEnvelope = {
        kind: "error",
        id: env.id,
        ok: false,
        code: (err as { code?: ErrorCode }).code ?? ErrorCode.E_STREAM_OUT_OF_ORDER,
        category: "stream",
        message: err instanceof Error ? err.message : String(err),
      };
      await this.transport.send(errEnv);
    }
    return;
  }
  if (env.kind === "stream-done" && this.streamRuntime) {
    this.streamRuntime.closeSession(env.sessionId);
    return;
  }
  // ... existing handshake + request dispatch ...
}
```

**Step 3: Run tests, commit**

```bash
git add apps/bridge-plugin/src/runtime.ts apps/bridge-plugin/src/__tests__/runtime.test.ts
git commit -m "feat(bridge-plugin): route streaming envelopes through StreamRuntime"
```

---

## Task 5.8: Server-side `StreamSessionManager` + `import_variables` server handler

**Goal:** A class living in `apps/mcp-server/src/streaming/session-manager.ts` that:
1. Receives an `import_variables` request via the daemon's normal request path.
2. Parses `source` (inline only for Phase 5) into items.
3. Generates `sessionId`, sends `stream-open` to the WS plugin.
4. Sends chunks of size `chunkSize`, awaiting each `chunk-ack`.
5. After each ack, invokes a `progress` callback (used by Task 5.9 to emit MCP progress).
6. Sends `stream-done` and resolves with the final summary.

The session manager is exposed as a server handler factory: `createImportVariablesServerHandler({ ws, getProgressEmitter })`. The daemon registers this handler in `apps/mcp-server`'s pack registration.

**Files:**
- Create: `apps/mcp-server/src/streaming/session-manager.ts`
- Create: `apps/mcp-server/src/streaming/__tests__/session-manager.test.ts`
- Create: `apps/mcp-server/src/streaming/import-handler.ts`
- Create: `apps/mcp-server/src/streaming/__tests__/import-handler.test.ts`

**Step 1: Tests for session-manager** — `chunkify` + the chunk-loop machinery:

```ts
import { describe, expect, it, vi } from "vitest";
import { chunkify, runChunkLoop } from "../session-manager";

describe("chunkify", () => {
  it("splits into batches of N", () => {
    expect(chunkify([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });
  it("returns one empty batch for an empty input", () => {
    expect(chunkify([], 100)).toEqual([]);
  });
});

describe("runChunkLoop", () => {
  it("emits stream-open, sends each chunk, awaits ack, emits progress", async () => {
    const sent: unknown[] = [];
    const progress = vi.fn();
    const transport = {
      async send(env: unknown) { sent.push(env); },
      async request<T>(env: unknown): Promise<T> {
        sent.push(env);
        const e = env as { seq: number; total: number };
        return { applied: e.total, failed: 0, failedDetails: [] } as T;
      },
    };
    const summary = await runChunkLoop({
      sessionId: "ses_a",
      tool: "import_variables",
      atomic: false,
      items: [1, 2, 3, 4, 5],
      chunkSize: 2,
      transport,
      onProgress: progress,
    });
    expect(summary.total).toBe(5);
    expect(summary.applied).toBe(5);
    expect(progress).toHaveBeenCalledTimes(3);
    // The wire sequence: stream-open, chunk x3, stream-done.
    expect(sent.filter((e: any) => e.kind === "chunk")).toHaveLength(3);
    expect(sent.filter((e: any) => e.kind === "stream-open")).toHaveLength(1);
    expect(sent.filter((e: any) => e.kind === "stream-done")).toHaveLength(1);
  });
});
```

**Step 2: Implement `session-manager.ts`**

```ts
// apps/mcp-server/src/streaming/session-manager.ts
import {
  type ChunkAckEnvelope,
  type ChunkEnvelope,
  type StreamDoneEnvelope,
  type StreamOpenEnvelope,
} from "@repo/protocol";

export function chunkify<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export interface ChunkLoopTransport {
  send(env: StreamOpenEnvelope | StreamDoneEnvelope): Promise<void>;
  request<T = ChunkAckEnvelope>(env: ChunkEnvelope): Promise<T>;
}

export interface ChunkLoopOptions {
  readonly sessionId: string;
  readonly tool: string;
  readonly atomic: boolean;
  readonly items: readonly unknown[];
  readonly chunkSize: number;
  readonly transport: ChunkLoopTransport;
  readonly onProgress?: (info: { sessionId: string; seq: number; total: number; applied: number; failed: number }) => void;
}

export interface StreamSummary {
  sessionId: string;
  total: number;
  applied: number;
  failed: number;
  failedDetails: Array<{ index: number; reason: string; name?: string }>;
}

let nextRequestId = 0;
const newId = () => `stream_${++nextRequestId}_${Date.now()}`;

export async function runChunkLoop(opts: ChunkLoopOptions): Promise<StreamSummary> {
  const open: StreamOpenEnvelope = {
    kind: "stream-open",
    id: newId(),
    sessionId: opts.sessionId,
    tool: opts.tool,
    total: opts.items.length,
    atomic: opts.atomic,
  };
  await opts.transport.send(open);

  let appliedTotal = 0;
  let failedTotal = 0;
  const failedDetailsTotal: StreamSummary["failedDetails"] = [];

  const batches = chunkify(opts.items, opts.chunkSize);
  for (let seq = 0; seq < batches.length; seq++) {
    const batch = batches[seq];
    const chunk: ChunkEnvelope = {
      kind: "chunk",
      id: newId(),
      sessionId: opts.sessionId,
      seq,
      total: opts.items.length,
      items: batch as unknown[],
      idempotencyKey: `${opts.sessionId}:${seq}`,
    };
    const ack = await opts.transport.request<ChunkAckEnvelope>(chunk);
    appliedTotal += ack.applied;
    failedTotal += ack.failed;
    for (const fd of ack.failedDetails) {
      failedDetailsTotal.push({
        index: seq * opts.chunkSize + fd.index,
        reason: fd.reason,
        name: fd.name,
      });
    }
    opts.onProgress?.({
      sessionId: opts.sessionId,
      seq,
      total: opts.items.length,
      applied: appliedTotal,
      failed: failedTotal,
    });
  }

  const done: StreamDoneEnvelope = {
    kind: "stream-done",
    id: newId(),
    sessionId: opts.sessionId,
    summary: { total: opts.items.length, applied: appliedTotal, failed: failedTotal },
  };
  await opts.transport.send(done);

  return {
    sessionId: opts.sessionId,
    total: opts.items.length,
    applied: appliedTotal,
    failed: failedTotal,
    failedDetails: failedDetailsTotal,
  };
}
```

**Step 3: Implement `import-handler.ts`** — the server handler factory:

```ts
// apps/mcp-server/src/streaming/import-handler.ts
import type { ServerHandler } from "@repo/protocol";
import type { ImportVariables } from "@repo/tools-variables";
import { runChunkLoop, type ChunkLoopTransport } from "./session-manager";

export interface ImportVariablesProviders {
  /** Build a ChunkLoopTransport bound to whatever upstream the daemon manages (WS plugin via Correlator). */
  readonly buildTransport: () => ChunkLoopTransport;
  /** Optional: emit MCP progress for the given progressToken after each ack. */
  readonly onProgress?: (
    progressToken: string | number | undefined,
    info: { sessionId: string; seq: number; total: number; applied: number; failed: number },
  ) => void;
}

let nextSessionId = 0;
const newSessionId = () => `ses_${++nextSessionId}_${Date.now()}`;

export function createImportVariablesServerHandler(
  providers: ImportVariablesProviders,
): ServerHandler<typeof ImportVariables> {
  return async (args) => {
    if (args.source.kind !== "inline") {
      throw new Error(`unsupported source kind: ${args.source.kind}`);
    }
    const sessionId = newSessionId();
    const summary = await runChunkLoop({
      sessionId,
      tool: "import_variables",
      atomic: args.atomic,
      items: args.source.items,
      chunkSize: args.chunkSize,
      transport: providers.buildTransport(),
      onProgress: (info) => providers.onProgress?.(undefined /* token wired in 5.9 */, info),
    });
    return {
      sessionId: summary.sessionId,
      total: summary.total,
      applied: summary.applied,
      failed: summary.failed,
      failedDetails: summary.failedDetails,
    };
  };
}
```

**Step 4: Tests for `import-handler.ts`** — happy path with a stub transport that immediately acks each chunk.

**Step 5: Run tests, commit**

```bash
git add apps/mcp-server/src/streaming/session-manager.ts apps/mcp-server/src/streaming/import-handler.ts apps/mcp-server/src/streaming/__tests__/session-manager.test.ts apps/mcp-server/src/streaming/__tests__/import-handler.test.ts
git commit -m "feat(mcp-server): StreamSessionManager + import_variables server handler"
```

---

## Task 5.9: Wire MCP `notifications/progress` through the stdio shim

**Goal:** When the daemon's `import_variables` server handler emits progress (Task 5.8's `onProgress`), the stdio shim's MCP server emits a corresponding `notifications/progress` MCP message back to the AI client.

**Wire flow:** the MCP bridge (Task 3.12) already routes tool calls. Now it needs to:
1. Capture the request's `_meta.progressToken` when the AI client calls `import_variables`.
2. Allow the resolver to receive a progress callback that emits `notifications/progress` on the MCP server.

**Files:**
- Modify: `apps/mcp-server/src/mcp-bridge.ts`
- Modify: `apps/mcp-server/src/__tests__/mcp-bridge.test.ts`
- Modify: `apps/mcp-server/src/main.ts` (wire the progress callback to the import handler)

**Step 1: Extend the mcp-bridge resolver signature** to optionally accept a progress callback:

```ts
// apps/mcp-server/src/mcp-bridge.ts
export interface RegisterToolsOptions {
  readonly mcpServer: Server;
  readonly tools: readonly ToolDefinition[];
  readonly resolve: (
    name: string,
    args: unknown,
    ctx: { progressToken?: string | number; emitProgress: (info: { progress: number; total?: number; message?: string }) => void },
  ) => Promise<unknown>;
}
```

In `setRequestHandler(CallToolRequestSchema, ...)`:

```ts
const progressToken = req.params._meta?.progressToken;
const emitProgress = progressToken !== undefined
  ? (info) => mcpServer.notification({ method: "notifications/progress", params: { progressToken, ...info } })
  : () => {};

const result = await resolve(req.params.name, req.params.arguments ?? {}, { progressToken, emitProgress });
```

**Step 2: Test in `mcp-bridge.test.ts`** — call a tool with a `progressToken`; resolver emits 3 progress events; verify the MCP client receives 3 notifications.

**Step 3: Update the stdio shim's resolver signature** so it forwards the progress callback to the daemon. The shim's resolver currently is `(name, args) => correlator.request(...)`. Extend it to also subscribe to `chunk-ack` envelopes for the duration of the request and emit progress.

In `apps/mcp-server/src/shim/stdio-shim.ts`:

```ts
resolve: (name, args, ctx) => {
  const sessionIdRef = { value: null as string | null };
  const off = this.ipc.onMessage((env) => {
    if (env.kind === "chunk-ack" && (sessionIdRef.value === null || env.sessionId === sessionIdRef.value)) {
      ctx.emitProgress({
        progress: env.seq + 1,
        total: undefined, // total chunk count not known here; daemon could enrich envelope
        message: `${env.applied} applied / ${env.failed} failed`,
      });
    }
  });
  return this.correlator.request({
    kind: "request",
    id: newId(),
    sourceClientId: options.sourceClientId,
    tool: name,
    args: (args ?? {}) as Record<string, unknown>,
  }).finally(off);
},
```

> The shim sees chunk-acks because Phase 3's daemon broadcasts EVERY envelope to all IPC clients. We filter by sessionId once we know it (the daemon's `import_variables` handler returns the sessionId in its result, but we'd want it earlier — for Phase 5 we accept "early acks may briefly leak across in-flight imports from the same shim", which is fine since shims rarely run two imports at once).

**Step 4: Wire `import_variables` in `main.ts`'s daemon-mode pack registration:**

```ts
import {
  ImportVariables,
  ExportVariables,
  UpdateVariablesBatch,
  StreamStatus,
  exportVariablesPluginHandler,
  updateVariablesBatchPluginHandler,
  createStreamStatusPluginHandler,
} from "@repo/tools-variables";
import { createImportVariablesServerHandler } from "./streaming/import-handler";
import type { ChunkLoopTransport } from "./streaming/session-manager";

// ... in the pack array ...
{
  name: "tools-variables",
  tools: [ImportVariables, ExportVariables, UpdateVariablesBatch, StreamStatus],
  registerPlugin: () => {
    /* registered on the WS plugin side, not in-process */
  },
  registerServer: (reg) => {
    const buildTransport = (): ChunkLoopTransport => {
      // Build a ChunkLoopTransport over the daemon's WS Correlator (Phase 4 added it).
      // The daemon exposes `pluginCorrelator` via a getter for this purpose.
      const correlator = daemon.pluginCorrelator;
      if (!correlator) throw new Error("plugin not connected");
      return {
        async send(env) {
          await daemon.wsBroadcast(env);
        },
        async request(env) {
          return correlator.request(env);
        },
      };
    };
    reg.register(ImportVariables, createImportVariablesServerHandler({ buildTransport }));
  },
},
```

> **Note on daemon API surface:** this requires `Daemon` to expose `pluginCorrelator` (getter) and `wsBroadcast(env)`. Both are ~5-line additions. Do them in this same commit since they're driven by this wiring.

**Step 5: Run tests, commit**

```bash
git add apps/mcp-server/src/mcp-bridge.ts apps/mcp-server/src/__tests__/mcp-bridge.test.ts apps/mcp-server/src/shim/stdio-shim.ts apps/mcp-server/src/main.ts apps/mcp-server/src/daemon/daemon.ts
git commit -m "feat(mcp-server): emit MCP progress for import_variables chunks"
```

---

## Task 5.10: Property tests — chunking invariants, idempotency, partial-failure

**Files:**
- Create: `packages/tools-variables/src/__tests__/streaming.property.test.ts`

**Step 1: Tests**

```ts
import { describe, it } from "vitest";
import fc from "fast-check";
import { FigmaFake } from "@repo/figma-adapter/testing";
import { StreamRuntime } from "../../../apps/bridge-plugin/src/streaming/stream-runtime";
import { chunkify } from "../../../apps/mcp-server/src/streaming/session-manager";

const itemArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  collection: fc.constant("Brand"),
  resolvedType: fc.constant("FLOAT" as const),
  valuesByMode: fc.constant({ Default: 1 }),
});

describe("streaming invariants (property)", () => {
  it("chunkify covers every item exactly once, no gaps, monotonic seqs", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        fc.integer({ min: 1, max: 100 }),
        (items, size) => {
          const batches = chunkify(items, size);
          const flat = batches.flat();
          if (flat.length !== items.length) return false;
          for (let i = 0; i < items.length; i++) {
            if (flat[i] !== items[i]) return false;
          }
          return true;
        },
      ),
      { numRuns: 50 },
    );
  });

  it("StreamRuntime: applying the same chunk twice yields the same final state", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(itemArb, { minLength: 1, maxLength: 20 }).filter((arr) => {
          const names = new Set(arr.map((i) => i.name));
          return names.size === arr.length; // unique names
        }),
        async (items) => {
          const figma = new FigmaFake();
          figma.__seedCollections([{ id: "vc1", name: "Brand", modes: [{ id: "m1", name: "Default" }] }]);
          const runtime = new StreamRuntime({ figma });
          runtime.openSession({ sessionId: "ses_p", total: items.length, atomic: false });
          const chunk = {
            kind: "chunk" as const,
            id: "req",
            sessionId: "ses_p",
            seq: 0,
            total: items.length,
            items,
            idempotencyKey: "ses_p:0",
          };
          const ack1 = await runtime.applyChunk(chunk);
          const ack2 = await runtime.applyChunk(chunk);
          // Idempotency: identical applied count.
          if (ack1.applied !== ack2.applied) return false;
          // No double-creation: variable count equals applied count.
          const vars = await figma.getLocalVariablesAsync();
          return vars.length === ack1.applied;
        },
      ),
      { numRuns: 20 },
    );
  });

  it("chunkify lengths sum to input length", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 500 }),
        fc.integer({ min: 1, max: 50 }),
        (items, size) => {
          const total = chunkify(items, size).reduce((acc, b) => acc + b.length, 0);
          return total === items.length;
        },
      ),
      { numRuns: 50 },
    );
  });
});
```

**Step 2: Run tests, commit**

```bash
git add packages/tools-variables/src/__tests__/streaming.property.test.ts
git commit -m "test(tools-variables): property tests for chunking + idempotency"
```

---

## Task 5.11: End-to-end + 10k-variable smoke + atomic rollback

**Files:**
- Create: `apps/mcp-server/src/__tests__/e2e-import-variables.test.ts`

**Step 1: Tests**

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import {
  ExportVariables,
  ImportVariables,
  StreamStatus,
  UpdateVariablesBatch,
  exportVariablesPluginHandler,
  updateVariablesBatchPluginHandler,
  createStreamStatusPluginHandler,
} from "@repo/tools-variables";
import { WebSocketClientTransport } from "@repo/transport";
import { BridgePluginRuntime } from "@repo/bridge-plugin/src/runtime";
import { StreamRuntime } from "@repo/bridge-plugin/src/streaming/stream-runtime";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";

async function setupPipeline(opts: { atomic?: boolean; injectFailureAt?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "mcp-import-"));
  const socketPath = join(dir, "daemon.sock");

  const figma = new FigmaFake();
  figma.__seedCollections([{ id: "vc1", name: "Brand", modes: [{ id: "m1", name: "Default" }] }]);

  // Inject a failure on the Nth createVariable call (atomic-rollback test).
  if (opts.injectFailureAt !== undefined) {
    let count = 0;
    const original = figma.createVariable.bind(figma);
    figma.createVariable = async (args) => {
      if (++count === opts.injectFailureAt) throw new Error("test-injected failure");
      return original(args);
    };
  }

  const daemon = await Daemon.start({
    socketPath,
    wsPort: 0,
    figma,
    version: "0.0.0",
    packs: [
      // Repeat the wiring from main.ts here directly for the test.
      // (Task 5.9 makes this a one-liner via factory; in the test we inline.)
    ],
  });

  // Plugin side: WS client + StreamRuntime + non-streaming handlers.
  const wsTransport = await WebSocketClientTransport.connect({
    url: `ws://127.0.0.1:${daemon.wsPort}`,
    WebSocketCtor: WebSocket as never,
  });
  const streamRuntime = new StreamRuntime({ figma });
  const runtime = new BridgePluginRuntime({
    transport: wsTransport,
    version: "0.0.0",
    figma,
    streamRuntime,
  });
  runtime.register(ExportVariables, exportVariablesPluginHandler);
  runtime.register(UpdateVariablesBatch, updateVariablesBatchPluginHandler);
  runtime.register(
    StreamStatus,
    createStreamStatusPluginHandler({ getStatus: (id) => streamRuntime.getStatus(id) }),
  );
  runtime.start();

  // Wait for daemon handshake to complete.
  while (!daemon.isPluginConnected) await new Promise((r) => setTimeout(r, 20));

  const shim = await createStdioShim({
    socketPath,
    sourceClientId: "e2e-import-shim",
    tools: [ImportVariables, ExportVariables, UpdateVariablesBatch, StreamStatus],
    mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
  });
  const [serverT, clientT] = InMemoryTransport.createLinkedPair();
  await shim.connectMcp(serverT);
  const client = new Client({ name: "e2e-import", version: "0.0.0" }, { capabilities: {} });
  await client.connect(clientT);

  return { daemon, shim, client, figma, wsTransport, runtime };
}

describe("e2e: import_variables", () => {
  it("imports 2k variables and reports the correct summary", async () => {
    const { client, daemon, shim, wsTransport, figma } = await setupPipeline();
    const items = Array.from({ length: 2000 }, (_, i) => ({
      name: `var-${i}`,
      collection: "Brand",
      resolvedType: "FLOAT" as const,
      valuesByMode: { Default: i },
    }));
    const r = await client.callTool({
      name: "import_variables",
      arguments: { source: { kind: "inline", items }, atomic: false, chunkSize: 100 },
    });
    expect(JSON.stringify(r)).toContain("\\\"applied\\\":2000");
    const vars = await figma.getLocalVariablesAsync();
    expect(vars.length).toBe(2000);
    await wsTransport.close();
    await shim.stop();
    await daemon.stop();
  });

  it("atomic mode rolls back all created variables on first failure", async () => {
    const { client, daemon, shim, wsTransport, figma } = await setupPipeline({
      atomic: true,
      injectFailureAt: 50,
    });
    const items = Array.from({ length: 100 }, (_, i) => ({
      name: `atomic-${i}`,
      collection: "Brand",
      resolvedType: "FLOAT" as const,
      valuesByMode: { Default: 1 },
    }));
    await client.callTool({
      name: "import_variables",
      arguments: { source: { kind: "inline", items }, atomic: true, chunkSize: 25 },
    });
    const vars = await figma.getLocalVariablesAsync();
    expect(vars.length).toBe(0);
    await wsTransport.close();
    await shim.stop();
    await daemon.stop();
  });

  it(
    "10k variables import within 30s on the developer machine",
    async () => {
      const { client, daemon, shim, wsTransport } = await setupPipeline();
      const items = Array.from({ length: 10_000 }, (_, i) => ({
        name: `large-${i}`,
        collection: "Brand",
        resolvedType: "FLOAT" as const,
        valuesByMode: { Default: i },
      }));
      const t0 = Date.now();
      const r = await client.callTool({
        name: "import_variables",
        arguments: { source: { kind: "inline", items }, atomic: false, chunkSize: 200 },
      });
      const elapsed = Date.now() - t0;
      expect(JSON.stringify(r)).toContain("\\\"applied\\\":10000");
      // Local target: <30s. CI is slower — relax to 90s but still bounded.
      expect(elapsed).toBeLessThan(90_000);
      await wsTransport.close();
      await shim.stop();
      await daemon.stop();
    },
    120_000,
  );
});
```

> **Note on the wiring inside `setupPipeline`:** the inline `packs` array is intentionally empty in this snippet because Task 5.8/5.9 already factor `createImportVariablesServerHandler` and the daemon-API hooks (`pluginCorrelator`, `wsBroadcast`). Reproduce the production wiring inline so the test is self-contained.

**Step 2: Run, commit**

```bash
git add apps/mcp-server/src/__tests__/e2e-import-variables.test.ts apps/mcp-server/package.json bun.lock
git commit -m "test(mcp-server): end-to-end import_variables — 2k baseline + atomic rollback + 10k smoke"
```

---

## Task 5.12: Coverage gate + Phase 5 changeset + acceptance

**Files:**
- Create: `.changeset/phase-5-variable-streaming.md`

**Step 1: Coverage**

```bash
bun run --filter @repo/figma-adapter test --coverage
bun run --filter @repo/protocol test --coverage
bun run --filter @repo/tools-variables test --coverage
bun run --filter @repo/mcp-server test --coverage
bun run --filter @repo/bridge-plugin test --coverage
```

Confirm thresholds:
- `@repo/figma-adapter`: ≥90/85/90/90.
- `@repo/protocol`: ≥95/90/95/95.
- `@repo/tools-variables`: ≥90/85/90/90.
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

**Step 3: Verify the wire**

Manually:

```bash
bun run --filter @repo/bridge-plugin build
ls apps/bridge-plugin/dist/  # plugin.js + index.html + manifest.json
```

The bridge-plugin entry now imports `StreamRuntime` and registers it on `BridgePluginRuntime` — the build should still produce the same dist files.

**Step 4: Changeset**

Create `.changeset/phase-5-variable-streaming.md`:

```markdown
---
"@repo/tools-variables": minor
"@repo/mcp-server": minor
"@repo/bridge-plugin": minor
"@repo/figma-adapter": minor
"@repo/protocol": minor
---

Phase 5: variable streaming.

- @repo/tools-variables (new) — import_variables (streaming, resumable,
  idempotent, atomic), export_variables (paginated), update_variables_batch,
  stream_status. Inline source only for Phase 5; W3C tokens / CSV deferred
  to Phase 8.
- @repo/figma-adapter — adds createVariable, createVariableCollection,
  getLocalVariableCollectionsAsync, deleteVariableAsync.
- @repo/protocol — Envelope union now includes stream-open/chunk/chunk-ack/
  stream-done.
- apps/mcp-server — StreamSessionManager, import_variables server handler
  factory, MCP notifications/progress wired through the stdio shim.
- apps/bridge-plugin — StreamRuntime (per-session idempotency, atomic
  rollback, ack cache); BridgePluginRuntime now routes streaming envelopes
  through it.

Verified end-to-end: 2k import, 10k smoke (<30s local), atomic rollback,
property tests for chunking/idempotency invariants.
```

**Step 5: Commit**

```bash
git add .changeset/phase-5-variable-streaming.md
git commit -m "chore(changeset): record Phase 5 variable streaming"
```

**Step 6: Final acceptance**

```bash
bun run lint && bun run types && bun run test
git log master..HEAD --oneline
```

Confirm Phase 5's commit progression reads cleanly.

---

## Notes on Execution

**Execution order:** 5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6 → 5.7 → 5.8 → 5.9 → 5.10 → 5.11 → 5.12. Mostly linear; tasks 5.6/5.7 (plugin streaming) and 5.8/5.9 (server streaming + MCP progress) can run in either order if it helps.

**TDD discipline:** every task with logic follows red → green → commit. Pure infra tasks (5.3 scaffold, 5.12 acceptance) skip the red step.

**Wire-format reuse:** Phase 1's streaming envelopes are the contract. Don't introduce parallel kinds. If a use case doesn't fit, extend the existing schemas with optional fields — don't bypass.

**Source parsing scope:** inline only. Tasks that test parsing should NOT test W3C JSON or CSV — those are Phase 8's problem.

**Resume protocol:** Phase 5 ships the `stream_status` tool but does NOT auto-resume on reconnect. The plumbing exists; Phase 6 (relay) or Phase 7 (setup CLI / diagnostics) will wire the auto-trigger. Manual resume via `stream_status` + a fresh `import_variables` call works today.

**Daemon API additions in Task 5.9:** the inline `buildTransport` in `main.ts`'s pack registration requires `Daemon.pluginCorrelator` and `Daemon.wsBroadcast` to be public. Both are small additions — bundle them in Task 5.9's commit since they exist solely to support this wiring.

**MCP progressToken correlation:** the design doc and Phase 1's `StreamSessionBinding` interface call out a `sessionId → progressToken` map. Task 5.9's stdio-shim resolver does the simpler thing: subscribe to all `chunk-ack`s while the request is in flight and emit progress regardless of session. Multi-import-from-one-shim scenarios may temporarily mis-attribute progress; acceptable for Phase 5. A proper map can land in Phase 6/7 alongside reconnect.

**Out of scope reminders:**
- No W3C tokens / CSV — Phase 8.
- No auto-resume on reconnect — Phase 6/7.
- No additional packs — Phase 8.
- No relay — Phase 6.
- Don't add features to `RealFigmaAdapter` beyond what `tools-variables` needs.

---

## References

- Predecessor plans: `docs/plans/2026-05-06-figma-mcp-rewrite-plan.md`, `docs/plans/2026-05-06-figma-mcp-phase-2.md`, `docs/plans/2026-05-06-figma-mcp-phase-3.md`, `docs/plans/2026-05-06-figma-mcp-phase-4.md`.
- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md` (§ "Streaming variable import" + § "Error Handling" → Stream).
- [Figma Variables API](https://developers.figma.com/docs/plugins/api/properties/figma-variables/) — for `RealFigmaAdapter` extensions.
- [MCP `notifications/progress` spec](https://spec.modelcontextprotocol.io/specification/server/utilities/progress/).
- `fast-check`: https://fast-check.dev/
