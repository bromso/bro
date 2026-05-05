# Figma MCP Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an open-source Figma MCP server (~94 tools) that achieves feature parity with `figma-console-mcp` but uses a schema-first single-source-of-truth architecture, native MCP streaming, daemon-based multi-AI-client coordination, and a one-command install UX.

**Architecture:** Three runtimes (MCP server CLI, Bridge Figma plugin, Cloudflare Worker + Durable Object relay) sharing one Zod-schema source of truth in `@repo/protocol`. Tools are organized as feature packs that register handlers on either or both sides. Streaming uses MCP's native `notifications/progress`. See `docs/plans/2026-05-06-figma-mcp-rewrite-design.md` for the full design.

**Tech Stack:** TypeScript, Bun, Turborepo, Vite, Vitest 4, Biome, Zod 3, `@modelcontextprotocol/sdk` 1.x, `ws`, Cloudflare Workers + Durable Objects (Hibernation API), React 19 (plugin status panel), happy-dom, fast-check, Miniflare 4.

---

## Roadmap (9 Phases)

This document fully details **Phase 1**. Phases 2–9 are sketched as goals + tasks + acceptance criteria; each gets its own plan doc before execution.

| # | Phase | Goal | Status |
|---|-------|------|--------|
| 1 | **Repo cleanup + protocol foundations** | Delete `apps/design-plugin`, scaffold `@repo/protocol` with envelope types, error codes, streaming primitives, and a typed tool-registry contract. | **Detailed below** |
| 2 | Transport + figma-adapter | `@repo/transport` (WebSocket framing, correlation, reconnect/backoff) and `@repo/figma-adapter` (interface + `FigmaFake` test double). | Roadmap |
| 3 | Daemon + canonical feature pack end-to-end | `apps/mcp-server` daemon + IPC + stdio shim. First feature pack `@repo/tools-extract` proves the full pipeline AI → daemon → plugin handler → response. | Roadmap |
| 4 | Bridge plugin | `apps/bridge-plugin` (replaces design-plugin): WS client, manifest with narrow `allowedDomains`, status panel, version handshake. | Roadmap |
| 5 | Variable streaming | `@repo/tools-variables` with chunked import (resumable, idempotent) and paginated export. 10k-variable property tests. | Roadmap |
| 6 | Cloud relay + Streamable HTTP | `apps/relay` Cloudflare Worker + DO with Hibernation API. Pairing flow. AI-side Streamable HTTP transport. Miniflare 4 tests. | Roadmap |
| 7 | Setup CLI + diagnostics | `figma-mcp setup` (auto-detects AI clients, writes configs), `figma-mcp doctor`, `--print-path`, `bridge_status` MCP tool. | Roadmap |
| 8 | Feature pack expansion | Port remaining packs (`-design`, `-figjam`, `-slides`, `-a11y`, `-console`, `-rest`) using the canonical pattern from Phase 3. | Roadmap |
| 9 | Polish + release | Docs site content, changesets-based npm publish pipeline, real-Figma golden tests, Plugin Community submission. | Roadmap |

---

## Phase 1: Repo Cleanup + Protocol Foundations

**Phase goal:** A clean monorepo with `@repo/protocol` containing typed envelope, error, streaming, and tool-registry contracts that all other code in the system will import. By the end of Phase 1, `bun run test` passes with full coverage on the new package, and there are no references to `apps/design-plugin` left.

**Why this phase first:** Every other phase depends on the protocol package. Getting the contracts right here means Phase 2+ becomes mechanical.

**Acceptance criteria:**
- `apps/design-plugin` is deleted.
- `packages/protocol` exists, builds, lints clean, and is consumed by no apps yet (apps come in later phases).
- `bun run test` passes with ≥95% coverage on `packages/protocol`.
- All envelope types, error codes, streaming primitives, and tool-registry contracts are defined as Zod schemas with positive + negative validation tests and roundtrip tests.
- `fast-check` property tests prove streaming envelope invariants (sequences monotonic, no gaps, no duplicates).
- Commit hygiene: each task ends with a conventional-commit-formatted commit.

---

### Task 1.1: Delete `apps/design-plugin`

**Files:**
- Delete: `apps/design-plugin/` (entire directory)
- Modify: `figma-plugin-template.code-workspace` (remove design-plugin folder reference if present)
- Modify: `apps/storybook/` — remove any stories that import from `@repo/design-plugin`

**Step 1: Search for design-plugin references**

Run: `rg -l "design-plugin" --type ts --type tsx --type json --type scss --type md`
Expected: list of files referencing it. Note them.

**Step 2: Delete the app**

Run: `rm -rf apps/design-plugin`

**Step 3: Update workspace file**

Read `figma-plugin-template.code-workspace`. Remove any `apps/design-plugin` folder entry.

**Step 4: Update Storybook**

Run: `rg -l "design-plugin" apps/storybook/`. Edit any matching files to remove the imports/stories.

**Step 5: Verify**

Run: `bun install`
Expected: succeeds (no broken workspace references).

Run: `bun run lint`
Expected: passes.

Run: `bun run test`
Expected: passes (no tests in this commit yet, but no broken test files either).

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove apps/design-plugin

Repo is being repurposed for the Figma MCP product. The generic
plugin starter is no longer needed. See docs/plans/2026-05-06-figma-mcp-rewrite-design.md."
```

---

### Task 1.2: Scaffold `@repo/protocol` package

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/tsconfig.json`
- Create: `packages/protocol/src/index.ts`
- Create: `packages/protocol/vitest.config.ts`
- Create: `packages/protocol/biome.json` (or rely on root)

**Step 1: Create `packages/protocol/package.json`**

```json
{
  "name": "@repo/protocol",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./envelope": "./src/envelope.ts",
    "./errors": "./src/errors.ts",
    "./streaming": "./src/streaming.ts",
    "./tools": "./src/tools.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "types": "tsc --noEmit",
    "lint": "biome check ."
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "fast-check": "^3.23.0",
    "vitest": "^4.0.0",
    "typescript": "^6.0.0"
  }
}
```

**Step 2: Create `packages/protocol/tsconfig.json`**

```json
{
  "extends": "../../apps/design-plugin/tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src/**/*", "*.config.ts"]
}
```

> **Note:** `apps/design-plugin/tsconfig.json` was deleted in Task 1.1. Either copy its config to a new `tsconfig.base.json` at repo root **before** Task 1.1, or pick another existing tsconfig to extend. Pick the cleanest option when executing.

**Step 3: Create empty `src/index.ts`**

```ts
export {};
```

**Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 95,
        branches: 90,
        functions: 95,
        statements: 95,
      },
    },
  },
});
```

**Step 5: Install and verify**

Run: `bun install`
Expected: succeeds; `@repo/protocol` shows as a workspace package.

Run: `bun run --filter @repo/protocol test`
Expected: passes (no tests yet).

Run: `bun run --filter @repo/protocol types`
Expected: passes.

**Step 6: Commit**

```bash
git add packages/protocol
git commit -m "feat(protocol): scaffold @repo/protocol package

Empty package with package.json, tsconfig, and vitest config.
Subsequent tasks fill in envelope, error, streaming, and tool types."
```

---

### Task 1.3: Define error codes (TDD)

**Why first:** error codes are referenced by every other type in the protocol. Defining them up front means later types can use them.

**Files:**
- Create: `packages/protocol/src/errors.ts`
- Create: `packages/protocol/src/__tests__/errors.test.ts`

**Step 1: Write the failing test**

```ts
// packages/protocol/src/__tests__/errors.test.ts
import { describe, it, expect } from "vitest";
import { ErrorCode, ErrorCategory, errorCategoryFor } from "../errors";

describe("ErrorCode enum", () => {
  it("contains all six categories' codes", () => {
    // Spot checks — full enumeration is in code
    expect(ErrorCode.E_PROTOCOL_INVALID).toBeDefined();
    expect(ErrorCode.E_FIGMA_NODE_NOT_FOUND).toBeDefined();
    expect(ErrorCode.E_BRIDGE_UNAVAILABLE).toBeDefined();
    expect(ErrorCode.E_STREAM_IDEMPOTENCY_CONFLICT).toBeDefined();
    expect(ErrorCode.E_DAEMON_LOCKFILE_STALE).toBeDefined();
    expect(ErrorCode.E_RELAY_PAIRING_EXPIRED).toBeDefined();
  });

  it("has no duplicate values", () => {
    const values = Object.values(ErrorCode);
    expect(new Set(values).size).toBe(values.length);
  });

  it("maps each code to a category", () => {
    expect(errorCategoryFor(ErrorCode.E_PROTOCOL_INVALID)).toBe("protocol");
    expect(errorCategoryFor(ErrorCode.E_FIGMA_NODE_NOT_FOUND)).toBe("figma");
    expect(errorCategoryFor(ErrorCode.E_BRIDGE_UNAVAILABLE)).toBe("transport");
    expect(errorCategoryFor(ErrorCode.E_STREAM_IDEMPOTENCY_CONFLICT)).toBe("stream");
    expect(errorCategoryFor(ErrorCode.E_DAEMON_LOCKFILE_STALE)).toBe("daemon");
    expect(errorCategoryFor(ErrorCode.E_RELAY_PAIRING_EXPIRED)).toBe("relay");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run --filter @repo/protocol test errors.test.ts`
Expected: FAIL with `Cannot find module "../errors"`.

**Step 3: Write minimal implementation**

```ts
// packages/protocol/src/errors.ts
export const ErrorCode = {
  // Protocol
  E_PROTOCOL_INVALID: "E_PROTOCOL_INVALID",
  E_PROTOCOL_VERSION_DRIFT: "E_PROTOCOL_VERSION_DRIFT",
  E_PROTOCOL_UNKNOWN_TOOL: "E_PROTOCOL_UNKNOWN_TOOL",
  E_PROTOCOL_OUTPUT_INVALID: "E_PROTOCOL_OUTPUT_INVALID",

  // Figma
  E_FIGMA_NO_PERMISSION: "E_FIGMA_NO_PERMISSION",
  E_FIGMA_NODE_NOT_FOUND: "E_FIGMA_NODE_NOT_FOUND",
  E_FIGMA_PLAN_LIMIT: "E_FIGMA_PLAN_LIMIT",
  E_FIGMA_EDITOR_TYPE_MISMATCH: "E_FIGMA_EDITOR_TYPE_MISMATCH",
  E_FIGMA_SANDBOX: "E_FIGMA_SANDBOX",
  E_FIGMA_UNKNOWN: "E_FIGMA_UNKNOWN",

  // Transport
  E_BRIDGE_UNAVAILABLE: "E_BRIDGE_UNAVAILABLE",
  E_BRIDGE_NOT_CONNECTED: "E_BRIDGE_NOT_CONNECTED",
  E_TRANSPORT_TIMEOUT: "E_TRANSPORT_TIMEOUT",

  // Stream
  E_STREAM_IDEMPOTENCY_CONFLICT: "E_STREAM_IDEMPOTENCY_CONFLICT",
  E_STREAM_SESSION_NOT_FOUND: "E_STREAM_SESSION_NOT_FOUND",
  E_STREAM_OUT_OF_ORDER: "E_STREAM_OUT_OF_ORDER",

  // Daemon
  E_DAEMON_LOCKFILE_STALE: "E_DAEMON_LOCKFILE_STALE",
  E_DAEMON_PORT_BOUND: "E_DAEMON_PORT_BOUND",
  E_DAEMON_VERSION_DRIFT: "E_DAEMON_VERSION_DRIFT",

  // Relay
  E_RELAY_PAIRING_EXPIRED: "E_RELAY_PAIRING_EXPIRED",
  E_RELAY_SESSION_NOT_FOUND: "E_RELAY_SESSION_NOT_FOUND",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ErrorCategory =
  | "protocol"
  | "figma"
  | "transport"
  | "stream"
  | "daemon"
  | "relay";

const CATEGORY_PREFIX_MAP: Record<string, ErrorCategory> = {
  E_PROTOCOL: "protocol",
  E_FIGMA: "figma",
  E_BRIDGE: "transport",
  E_TRANSPORT: "transport",
  E_STREAM: "stream",
  E_DAEMON: "daemon",
  E_RELAY: "relay",
};

export function errorCategoryFor(code: ErrorCode): ErrorCategory {
  for (const [prefix, category] of Object.entries(CATEGORY_PREFIX_MAP)) {
    if (code.startsWith(prefix)) return category;
  }
  throw new Error(`Unknown error code prefix: ${code}`);
}
```

**Step 4: Run test to verify it passes**

Run: `bun run --filter @repo/protocol test errors.test.ts`
Expected: PASS.

**Step 5: Export from index**

Edit `packages/protocol/src/index.ts`:

```ts
export * from "./errors";
```

**Step 6: Commit**

```bash
git add packages/protocol/src/errors.ts packages/protocol/src/__tests__/errors.test.ts packages/protocol/src/index.ts
git commit -m "feat(protocol): add stable error codes and category mapping"
```

---

### Task 1.4: Define core envelope types (TDD)

**Files:**
- Create: `packages/protocol/src/envelope.ts`
- Create: `packages/protocol/src/__tests__/envelope.test.ts`

**Step 1: Write the failing tests**

```ts
// packages/protocol/src/__tests__/envelope.test.ts
import { describe, it, expect } from "vitest";
import {
  RequestEnvelope,
  ResponseEnvelope,
  ErrorEnvelope,
  parseEnvelope,
} from "../envelope";
import { ErrorCode } from "../errors";

describe("RequestEnvelope", () => {
  it("validates a well-formed request", () => {
    const result = RequestEnvelope.safeParse({
      kind: "request",
      id: "req_01HXYZ",
      sourceClientId: "claude-code",
      tool: "extract_styles",
      args: { fileKey: "abc123" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a request missing 'tool'", () => {
    const result = RequestEnvelope.safeParse({
      kind: "request",
      id: "req_01HXYZ",
      sourceClientId: "claude-code",
      args: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown 'kind'", () => {
    const result = RequestEnvelope.safeParse({
      kind: "blah",
      id: "x",
      sourceClientId: "x",
      tool: "x",
      args: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("ErrorEnvelope", () => {
  it("validates a well-formed error", () => {
    const result = ErrorEnvelope.safeParse({
      kind: "error",
      id: "req_01HXYZ",
      ok: false,
      code: ErrorCode.E_FIGMA_NODE_NOT_FOUND,
      category: "figma",
      message: "Node 1:23 was deleted",
      remediation: "Re-fetch selection",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an error envelope with ok: true", () => {
    const result = ErrorEnvelope.safeParse({
      kind: "error",
      id: "x",
      ok: true,
      code: ErrorCode.E_FIGMA_UNKNOWN,
      category: "figma",
      message: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("parseEnvelope (discriminated union)", () => {
  it("dispatches on 'kind'", () => {
    const r = parseEnvelope({
      kind: "request",
      id: "1",
      sourceClientId: "x",
      tool: "y",
      args: {},
    });
    expect(r.kind).toBe("request");
  });

  it("throws on unknown kind", () => {
    expect(() =>
      parseEnvelope({ kind: "nope", id: "1" } as unknown),
    ).toThrow();
  });
});

describe("envelope roundtrip", () => {
  it("encode -> JSON -> decode preserves shape", () => {
    const original = {
      kind: "request" as const,
      id: "req_1",
      sourceClientId: "claude-code",
      tool: "extract_styles",
      args: { fileKey: "abc" },
    };
    const wire = JSON.stringify(original);
    const decoded = parseEnvelope(JSON.parse(wire));
    expect(decoded).toEqual(original);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run --filter @repo/protocol test envelope.test.ts`
Expected: FAIL with `Cannot find module "../envelope"`.

**Step 3: Write the implementation**

```ts
// packages/protocol/src/envelope.ts
import { z } from "zod";
import { ErrorCode, ErrorCategory } from "./errors";

export const RequestEnvelope = z.object({
  kind: z.literal("request"),
  id: z.string().min(1),
  sourceClientId: z.string().min(1),
  tool: z.string().min(1),
  args: z.record(z.unknown()),
  meta: z
    .object({
      progressToken: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
});
export type RequestEnvelope = z.infer<typeof RequestEnvelope>;

export const ResponseEnvelope = z.object({
  kind: z.literal("response"),
  id: z.string().min(1),
  ok: z.literal(true),
  result: z.unknown(),
});
export type ResponseEnvelope = z.infer<typeof ResponseEnvelope>;

export const ErrorEnvelope = z.object({
  kind: z.literal("error"),
  id: z.string().min(1),
  ok: z.literal(false),
  code: z.nativeEnum(ErrorCode as Record<string, string>),
  category: z.enum([
    "protocol",
    "figma",
    "transport",
    "stream",
    "daemon",
    "relay",
  ] as const) satisfies z.ZodType<ErrorCategory>,
  message: z.string().min(1),
  remediation: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export const Envelope = z.discriminatedUnion("kind", [
  RequestEnvelope,
  ResponseEnvelope,
  ErrorEnvelope,
]);
export type Envelope = z.infer<typeof Envelope>;

export function parseEnvelope(input: unknown): Envelope {
  return Envelope.parse(input);
}
```

**Step 4: Run test to verify it passes**

Run: `bun run --filter @repo/protocol test envelope.test.ts`
Expected: PASS.

**Step 5: Update index**

```ts
// packages/protocol/src/index.ts
export * from "./errors";
export * from "./envelope";
```

**Step 6: Commit**

```bash
git add packages/protocol/src/envelope.ts packages/protocol/src/__tests__/envelope.test.ts packages/protocol/src/index.ts
git commit -m "feat(protocol): add request/response/error envelope schemas"
```

---

### Task 1.5: Streaming envelope types + property tests (TDD)

**Files:**
- Create: `packages/protocol/src/streaming.ts`
- Create: `packages/protocol/src/__tests__/streaming.test.ts`
- Create: `packages/protocol/src/__tests__/streaming.property.test.ts`

**Step 1: Write the unit tests**

```ts
// packages/protocol/src/__tests__/streaming.test.ts
import { describe, it, expect } from "vitest";
import {
  StreamOpenEnvelope,
  ChunkEnvelope,
  ChunkAckEnvelope,
  StreamDoneEnvelope,
  isMonotonic,
} from "../streaming";

describe("StreamOpenEnvelope", () => {
  it("validates open with sessionId, tool, total", () => {
    const r = StreamOpenEnvelope.safeParse({
      kind: "stream-open",
      id: "req_1",
      sessionId: "ses_abc",
      tool: "import_variables",
      total: 10000,
      atomic: false,
    });
    expect(r.success).toBe(true);
  });
});

describe("ChunkEnvelope", () => {
  it("validates chunk with seq + items + idempotencyKey", () => {
    const r = ChunkEnvelope.safeParse({
      kind: "chunk",
      id: "req_2",
      sessionId: "ses_abc",
      seq: 0,
      total: 100,
      items: [{ name: "color/red", value: "#f00" }],
      idempotencyKey: "ses_abc:0",
    });
    expect(r.success).toBe(true);
  });

  it("rejects negative seq", () => {
    const r = ChunkEnvelope.safeParse({
      kind: "chunk",
      id: "x",
      sessionId: "x",
      seq: -1,
      total: 1,
      items: [],
      idempotencyKey: "x:0",
    });
    expect(r.success).toBe(false);
  });
});

describe("ChunkAckEnvelope", () => {
  it("validates ack with applied + failed counts", () => {
    const r = ChunkAckEnvelope.safeParse({
      kind: "chunk-ack",
      id: "req_3",
      sessionId: "ses_abc",
      seq: 0,
      applied: 99,
      failed: 1,
      failedDetails: [
        { index: 47, reason: "duplicate name", name: "color/red" },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("StreamDoneEnvelope", () => {
  it("validates done with summary", () => {
    const r = StreamDoneEnvelope.safeParse({
      kind: "stream-done",
      id: "req_4",
      sessionId: "ses_abc",
      summary: { total: 100, applied: 99, failed: 1 },
    });
    expect(r.success).toBe(true);
  });
});

describe("isMonotonic", () => {
  it("returns true for [0,1,2,3]", () => {
    expect(isMonotonic([0, 1, 2, 3])).toBe(true);
  });
  it("returns false for [0,1,1,2] (duplicate)", () => {
    expect(isMonotonic([0, 1, 1, 2])).toBe(false);
  });
  it("returns false for [0,2] (gap)", () => {
    expect(isMonotonic([0, 2])).toBe(false);
  });
  it("returns false for [1,0] (out of order)", () => {
    expect(isMonotonic([1, 0])).toBe(false);
  });
  it("returns true for empty array", () => {
    expect(isMonotonic([])).toBe(true);
  });
});
```

**Step 2: Write the property tests**

```ts
// packages/protocol/src/__tests__/streaming.property.test.ts
import { describe, it } from "vitest";
import fc from "fast-check";
import { ChunkEnvelope, isMonotonic } from "../streaming";

describe("streaming chunk invariants (property)", () => {
  it("any sequence of chunks with correct seqs is monotonic", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), (count) => {
        const seqs = Array.from({ length: count }, (_, i) => i);
        return isMonotonic(seqs);
      }),
    );
  });

  it("inserting duplicate seq breaks monotonicity", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 99 }),
        (count, dupAt) => {
          if (dupAt >= count) return true;
          const seqs = Array.from({ length: count }, (_, i) => i);
          seqs.splice(dupAt + 1, 0, dupAt);
          return !isMonotonic(seqs);
        },
      ),
    );
  });

  it("any well-formed chunk passes schema validation", () => {
    fc.assert(
      fc.property(
        fc.record({
          kind: fc.constant("chunk" as const),
          id: fc.string({ minLength: 1 }),
          sessionId: fc.string({ minLength: 1 }),
          seq: fc.nat(),
          total: fc.integer({ min: 1, max: 100000 }),
          items: fc.array(fc.record({ name: fc.string(), value: fc.string() })),
          idempotencyKey: fc.string({ minLength: 1 }),
        }),
        (chunk) => {
          const r = ChunkEnvelope.safeParse(chunk);
          return r.success === true;
        },
      ),
    );
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `bun run --filter @repo/protocol test streaming`
Expected: FAIL with `Cannot find module "../streaming"`.

**Step 4: Write the implementation**

```ts
// packages/protocol/src/streaming.ts
import { z } from "zod";

export const StreamOpenEnvelope = z.object({
  kind: z.literal("stream-open"),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  tool: z.string().min(1),
  total: z.number().int().nonnegative(),
  atomic: z.boolean(),
});
export type StreamOpenEnvelope = z.infer<typeof StreamOpenEnvelope>;

export const ChunkEnvelope = z.object({
  kind: z.literal("chunk"),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  items: z.array(z.unknown()),
  idempotencyKey: z.string().min(1),
});
export type ChunkEnvelope = z.infer<typeof ChunkEnvelope>;

export const ChunkAckEnvelope = z.object({
  kind: z.literal("chunk-ack"),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  failedDetails: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        reason: z.string(),
        name: z.string().optional(),
      }),
    )
    .default([]),
});
export type ChunkAckEnvelope = z.infer<typeof ChunkAckEnvelope>;

export const StreamDoneEnvelope = z.object({
  kind: z.literal("stream-done"),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  summary: z.object({
    total: z.number().int().nonnegative(),
    applied: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
});
export type StreamDoneEnvelope = z.infer<typeof StreamDoneEnvelope>;

export function isMonotonic(seqs: readonly number[]): boolean {
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] !== seqs[i - 1] + 1) return false;
  }
  return true;
}
```

**Step 5: Run tests to verify they pass**

Run: `bun run --filter @repo/protocol test streaming`
Expected: PASS (both unit and property tests).

**Step 6: Update index**

```ts
// packages/protocol/src/index.ts
export * from "./errors";
export * from "./envelope";
export * from "./streaming";
```

**Step 7: Commit**

```bash
git add packages/protocol/src/streaming.ts packages/protocol/src/__tests__/streaming.test.ts packages/protocol/src/__tests__/streaming.property.test.ts packages/protocol/src/index.ts
git commit -m "feat(protocol): add streaming envelope schemas + property tests"
```

---

### Task 1.6: Tool registry contracts (TDD)

**Files:**
- Create: `packages/protocol/src/tools.ts`
- Create: `packages/protocol/src/__tests__/tools.test.ts`

**Goal:** define a `ToolDefinition<Input, Output>` type that pairs a name with input/output Zod schemas, a `streaming` flag, and metadata. Define `ServerHandler<T>` and `PluginHandler<T>` contracts. Define a `Pack` interface that exports both.

**Step 1: Write the failing test**

```ts
// packages/protocol/src/__tests__/tools.test.ts
import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";
import { defineTool, type ToolDefinition, type Pack } from "../tools";

describe("defineTool", () => {
  const ExtractStyles = defineTool({
    name: "extract_styles",
    input: z.object({ fileKey: z.string() }),
    output: z.object({ styles: z.array(z.string()) }),
    streaming: false,
    description: "Extract paint/text/effect styles from a Figma file.",
  });

  it("returns a ToolDefinition with the supplied name", () => {
    expect(ExtractStyles.name).toBe("extract_styles");
  });

  it("infers Input/Output types from the schemas", () => {
    expectTypeOf<ExtractStylesInput>().toEqualTypeOf<{ fileKey: string }>();
    expectTypeOf<ExtractStylesOutput>().toEqualTypeOf<{ styles: string[] }>();
  });
});

type ExtractStylesInput = z.infer<typeof ExtractStyles.input>;
type ExtractStylesOutput = z.infer<typeof ExtractStyles.output>;

declare const ExtractStyles: ToolDefinition<
  z.ZodObject<{ fileKey: z.ZodString }>,
  z.ZodObject<{ styles: z.ZodArray<z.ZodString> }>
>;

describe("Pack interface", () => {
  it("a pack can declare empty server/plugin registers", () => {
    const empty: Pack = {
      name: "test-pack",
      tools: [],
      registerServer: () => {},
      registerPlugin: () => {},
    };
    expect(empty.name).toBe("test-pack");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run --filter @repo/protocol test tools`
Expected: FAIL with `Cannot find module "../tools"`.

**Step 3: Write the implementation**

```ts
// packages/protocol/src/tools.ts
import type { z } from "zod";

export interface ToolDefinition<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly name: string;
  readonly input: TInput;
  readonly output: TOutput;
  readonly streaming: boolean;
  readonly description: string;
}

export function defineTool<
  TInput extends z.ZodTypeAny,
  TOutput extends z.ZodTypeAny,
>(definition: ToolDefinition<TInput, TOutput>): ToolDefinition<TInput, TOutput> {
  return definition;
}

export type ServerHandlerContext = {
  readonly logger: { debug(msg: string, meta?: object): void };
  readonly figmaApiKey?: string;
};

export type ServerHandler<T extends ToolDefinition> = (
  args: z.infer<T["input"]>,
  ctx: ServerHandlerContext,
) => Promise<z.infer<T["output"]>>;

export type PluginHandlerContext = {
  readonly logger: { debug(msg: string, meta?: object): void };
  readonly figma: import("../../figma-adapter/src").FigmaAdapter;
};

export type PluginHandler<T extends ToolDefinition> = (
  args: z.infer<T["input"]>,
  ctx: PluginHandlerContext,
) => Promise<z.infer<T["output"]>>;

export interface ServerRegistry {
  register<T extends ToolDefinition>(
    tool: T,
    handler: ServerHandler<T>,
  ): void;
}

export interface PluginRegistry {
  register<T extends ToolDefinition>(
    tool: T,
    handler: PluginHandler<T>,
  ): void;
}

export interface Pack {
  readonly name: string;
  readonly tools: readonly ToolDefinition[];
  readonly registerServer?: (registry: ServerRegistry) => void;
  readonly registerPlugin?: (registry: PluginRegistry) => void;
}
```

> **Note:** the import of `FigmaAdapter` from `@repo/figma-adapter` is forward-looking; that package gets created in Phase 2. For Phase 1, replace this import with a placeholder type and replace it with the real import in Phase 2:
>
> ```ts
> export type FigmaAdapterPlaceholder = unknown; // replaced in Phase 2
> export type PluginHandlerContext = {
>   readonly logger: { debug(msg: string, meta?: object): void };
>   readonly figma: FigmaAdapterPlaceholder;
> };
> ```

**Step 4: Run test to verify it passes**

Run: `bun run --filter @repo/protocol test tools`
Expected: PASS.

**Step 5: Update index**

```ts
// packages/protocol/src/index.ts
export * from "./errors";
export * from "./envelope";
export * from "./streaming";
export * from "./tools";
```

**Step 6: Commit**

```bash
git add packages/protocol/src/tools.ts packages/protocol/src/__tests__/tools.test.ts packages/protocol/src/index.ts
git commit -m "feat(protocol): add typed ToolDefinition + Pack contracts"
```

---

### Task 1.7: Coverage check + Phase 1 acceptance

**Files:**
- Modify: `packages/protocol/vitest.config.ts` (already at 95% line threshold)

**Step 1: Run full test suite with coverage**

Run: `bun run --filter @repo/protocol test --coverage`
Expected: PASS with ≥95% lines, ≥90% branches, ≥95% functions.

**Step 2: Run lint and typecheck**

Run: `bun run --filter @repo/protocol lint`
Expected: PASS.

Run: `bun run --filter @repo/protocol types`
Expected: PASS.

**Step 3: Run root tasks**

Run: `bun run lint && bun run test && bun run types`
Expected: all pass across all workspaces.

**Step 4: Verify no design-plugin references remain**

Run: `rg "design-plugin"`
Expected: only references in `docs/plans/2026-05-06-figma-mcp-rewrite-design.md` (historical context); no source references.

**Step 5: Add a changeset**

Run: `bun changeset`
Choose: minor bump on the (yet-to-be-named) MCP server package — but since no published package exists yet, this changeset documents the foundation work. Description: "Establish protocol package: envelope, error, streaming, and tool contracts."

**Step 6: Commit the changeset**

```bash
git add .changeset
git commit -m "chore(changeset): record Phase 1 protocol foundations"
```

**Phase 1 done.** The codebase now has a clean monorepo, a fully-tested `@repo/protocol` package with envelope/error/streaming/tool contracts, and zero design-plugin residue. Phase 2 builds on this foundation.

---

## Phase 2 (Roadmap): Transport + figma-adapter

**Goal:** Build `@repo/transport` (WebSocket framing, request/response correlation, reconnect/backoff) and `@repo/figma-adapter` (interface + `FigmaFake` test double). Both are pure libraries — no apps yet.

**Tasks:**
1. Scaffold `@repo/transport` package.
2. Define `Transport` interface (send, receive, on connect/disconnect).
3. Implement `WebSocketServerTransport` (Node, using `ws`).
4. Implement `WebSocketClientTransport` (browser, for plugin).
5. Implement request/response correlation (id → resolve/reject map).
6. Implement timeout + cancellation.
7. Implement reconnect with exponential backoff.
8. Inject failures: drops, reorderings, duplicate messages — all tested.
9. Scaffold `@repo/figma-adapter` package.
10. Define `FigmaAdapter` interface (subset of `figma.*`).
11. Implement `FigmaFake` in `@repo/figma-adapter/testing` export.
12. Tests of `FigmaFake` itself (it's the test double; it must behave correctly).
13. Replace `FigmaAdapterPlaceholder` in `@repo/protocol/tools.ts` with the real import.

**Acceptance criteria:**
- Transport handles drops, reorderings, duplicates, timeouts cleanly under fuzz testing.
- `FigmaFake` supports `getLocalVariablesAsync`, `setValueForMode`, `createRectangle`, `currentPage.selection`, and the `editorType` switch.
- ≥90% coverage on both packages.

---

## Phase 3 (Roadmap): Daemon + canonical feature pack end-to-end

**Goal:** Bring `apps/mcp-server` online with the daemon model and IPC scaffolding. Build `@repo/tools-extract` as the canonical feature pack — 3–4 tools that prove the full pipeline AI client → MCP server → daemon → plugin handler → response works. No real Figma plugin yet — the "plugin handler" is invoked in-process via `FigmaFake` for now.

**Tasks (high level):**
1. Scaffold `apps/mcp-server` with stdio entry, daemon entry, lockfile/PID management.
2. Implement Unix domain socket / named pipe IPC layer.
3. Wire MCP TypeScript SDK to the tool registry (translate `@repo/protocol` schemas to MCP tool registrations).
4. Implement WebSocket server in the daemon for plugin connections.
5. Build `@repo/tools-extract` with: `extract_styles`, `extract_components`, `extract_local_variables`, `bridge_status`.
6. Each tool tested at unit level (handler with `FigmaFake`) and integration level (end-to-end via in-memory transport).
7. MCP-level integration tests using `@modelcontextprotocol/sdk` test client.
8. Smoke test in CI: real daemon, real stdio shim, run all 4 tools, exit cleanly.

**Acceptance criteria:**
- Single-instance daemon model works on macOS and Linux (Windows handled in Phase 7).
- `extract_*` tools return correct results when the daemon is fed a `FigmaFake`-backed plugin connection.
- Coverage targets met (handlers 90%, mcp-server app 80%).

---

## Phase 4 (Roadmap): Bridge plugin

**Goal:** Replace the deleted `apps/design-plugin` with `apps/bridge-plugin`. WebSocket client + status panel UI + version handshake + narrow `allowedDomains`.

**Tasks (high level):**
1. Scaffold `apps/bridge-plugin` with Vite single-file output.
2. Implement WebSocket client transport using `@repo/transport`.
3. Build status panel with React + `@repo/ui` (connection state, pairing code input, recent errors).
4. Wire each `@repo/tools-extract` plugin handler.
5. Implement version handshake on connect; reject mismatched server versions with `E_PROTOCOL_VERSION_DRIFT`.
6. Manifest with narrow `allowedDomains`: `ws://127.0.0.1:9223` (dev) and `wss://*.our-relay-domain.com` (cloud — placeholder until Phase 6).
7. End-to-end smoke test: real plugin in Figma Desktop talking to a real daemon (manual test, recorded as a video for the README).

**Acceptance criteria:**
- Plugin connects to daemon on first run, persists pairing across Figma sessions.
- Status panel surfaces connection state and recent errors.
- Manifest passes Figma's automated review checks for `allowedDomains` policy.

---

## Phase 5 (Roadmap): Variable streaming

**Goal:** Build `@repo/tools-variables` — chunked import (resumable, idempotent) and paginated export. This is the streaming spine the user explicitly asked for.

**Tasks (high level):**
1. Define `import_variables`, `export_variables`, `update_variables_batch` tools in protocol.
2. Server-side: stream session manager. Parses input source (W3C tokens JSON, CSV, inline). Chunks at configurable size.
3. Plugin handler: tight sandbox loop calling `setValueForMode` per item; per-variable error capture.
4. Idempotency tracking on plugin side: `(sessionId, seq) → applied` map.
5. Resume protocol: server queries `streamStatus(sessionId)` on reconnect.
6. `--atomic` mode: plugin tracks creations, rolls back on first failure.
7. MCP `notifications/progress` wired to chunk acks.
8. 10k-variable property tests (`fast-check`): chunking invariants, resume correctness, idempotency, partial-failure totals.
9. Atomic rollback test: inject failure mid-stream, assert no variables written.

**Acceptance criteria:**
- 10k variables import in <30s on a developer machine.
- Mid-stream disconnect resumes from last-acked seq with zero duplicates.
- `--atomic` rolls back cleanly on first failure.

---

## Phase 6 (Roadmap): Cloud relay + Streamable HTTP

**Goal:** `apps/relay` Cloudflare Worker + Durable Object using the Hibernation API. Pairing flow. AI-side Streamable HTTP transport.

**Tasks (high level):**
1. Scaffold `apps/relay` with Wrangler.
2. Implement Durable Object per pairing session using Hibernation API.
3. Pairing endpoint: short-lived 6-digit code → opaque session id.
4. WSS endpoint for plugin: `wss://relay/pair?code=...`.
5. Streamable HTTP endpoint for AI clients.
6. Pure pass-through routing of envelopes; no business logic.
7. `serializeAttachment` for hibernate/restore state.
8. `{allowHalfOpen: true}` on `accept()` for `web_socket_auto_reply_to_close` compat.
9. Miniflare 4 tests: pairing, routing, hibernation/restore.
10. Setup CLI gains `--cloud` flag that calls relay for pairing code.

**Acceptance criteria:**
- Pairing code flow works end-to-end from `npx @scope/figma-mcp setup --cloud` to plugin paired.
- DO hibernates after 60s idle and restores correctly on next message.
- Relay deployed to a staging Cloudflare account for manual testing.

---

## Phase 7 (Roadmap): Setup CLI + diagnostics

**Goal:** One-command install. `figma-mcp setup` detects AI clients and writes their MCP configs. `figma-mcp doctor` diagnoses problems.

**Tasks (high level):**
1. AI client detection: Claude Code, Claude Desktop, Cursor, Windsurf, Copilot. Detect by config file path conventions.
2. Write/merge MCP config entries (preserving existing entries).
3. Open Figma manifest path with OS file picker pre-filled (`open` on macOS, `xdg-open` on Linux, `start` on Windows).
4. `--cloud` mode: prints pairing code prominently.
5. `doctor` subcommand: daemon liveness, plugin pairing, AI client configs, port conflicts, recent errors.
6. `--print-path` resolves bundled plugin manifest.
7. Windows path/IPC handling (named pipes instead of Unix sockets).

**Acceptance criteria:**
- `npx @scope/figma-mcp setup` succeeds on macOS, Linux, Windows with at least Claude Code installed.
- `doctor` accurately reports the 8 failure modes from the design's "specific gotchas" list.

---

## Phase 8 (Roadmap): Feature pack expansion

**Goal:** Port the remaining ~80 tools across packs `-design`, `-figjam`, `-slides`, `-a11y`, `-console`, `-rest`. With the canonical pattern from Phase 3 in place, this is mechanical.

**Tasks per pack (high level):**
1. Define tool schemas in pack.
2. Implement plugin handler against `figma-adapter`.
3. Implement server handler if applicable (REST-API-backed read tools).
4. Unit tests against `FigmaFake` (90% coverage).
5. Smoke test the pack against a real Figma Desktop instance once.

**Estimated tool counts per pack** (matching reference parity):
- `-design`: ~12 tools (create rectangle/frame/text/component, set fills/strokes/text, resize, clone, etc.)
- `-figjam`: ~10 tools (create sticky/section/connector/code-block, get board contents, etc.)
- `-slides`: ~15 tools (create slide, add shape/text, set background/transition, focus, list, etc.)
- `-a11y`: ~13 tools (audit component, scan code, lint design, set/get annotations, etc.)
- `-console`: ~6 tools (get console logs, capture screenshot, watch console, clear, etc.)
- `-rest`: ~22 tools (read-only tools the reference exposes in cloud-mode-without-bridge)

**Acceptance criteria:**
- ≥85 total tools shipped (matching or exceeding reference parity for the modes we support).
- Per-pack coverage ≥90%.

---

## Phase 9 (Roadmap): Polish + release

**Goal:** Documentation site content, release pipeline, real-Figma golden tests, public launch.

**Tasks (high level):**
1. Repurpose `apps/docs` content for the product. Quickstart, install for each AI client, architecture overview, troubleshooting.
2. Changesets-based release pipeline: PRs add changesets; merge to main triggers GitHub Actions to publish on version-bumping PRs.
3. Real-Figma golden tests: manual workflow trigger using `FIGMA_API_KEY` and a public test file. Records fixtures for offline replay.
4. Submit Bridge plugin to Figma Plugin Community.
5. Write the `CONTRIBUTING.md` for the new product (the existing one is plugin-template-flavored).
6. Cut v1.0.0 release.

**Acceptance criteria:**
- Docs site live with quickstart that works for at least 3 AI clients.
- npm publish pipeline green.
- Plugin approved on Figma Community.

---

## Notes on Execution

**Worktree:** This plan was written on branch `docs/figma-mcp-design`. Phase 1 execution should happen on a feature branch `feat/phase-1-protocol-foundations` cut from `docs/figma-mcp-design`, or a worktree (per @superpowers:using-git-worktrees) if the executor wants isolation.

**TDD discipline:** Phase 1 strictly follows TDD: red → green → commit per task. Phases 2–9 should preserve this discipline when planned in detail.

**Per-phase planning:** before executing each subsequent phase, create its own plan doc (`docs/plans/YYYY-MM-DD-figma-mcp-phase-N.md`) using @superpowers:writing-plans, with the same bite-sized TDD task structure used in Phase 1.

**DRY/YAGNI reminders:**
- Don't build feature flags or backwards-compat shims; v1 has no users yet.
- Don't add error handling for scenarios outside the design's six error categories.
- Don't add docstrings or comments unless the WHY is non-obvious.
- Resist abstraction beyond the protocol/transport/adapter seams already designed.

---

## References

- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md`
- [southleft/figma-console-mcp](https://github.com/southleft/figma-console-mcp)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Figma Plugin Manifest](https://developers.figma.com/docs/plugins/manifest/)
- [Cloudflare WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/)
