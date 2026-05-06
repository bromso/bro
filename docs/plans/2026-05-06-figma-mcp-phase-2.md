# Figma MCP Phase 2 — Transport + figma-adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `@repo/transport` (WebSocket framing, request/response correlation, reconnect/backoff) and `@repo/figma-adapter` (interface + `FigmaFake` test double), then replace the `FigmaAdapterPlaceholder` seam in `@repo/protocol/tools.ts` with the real adapter type. Both packages are pure libraries — no apps consume them yet.

**Architecture:** Two new workspace packages, both JIT TypeScript (no build step), both reusing the protocol's envelope schemas as the wire shape. `@repo/transport` exposes a `Transport` interface and Node + browser WebSocket implementations, plus a `Correlator` that turns request/response envelopes into Promises. `@repo/figma-adapter` exposes a small `FigmaAdapter` interface (the subset actually used by Phase 3+ tools) and a fully in-memory `FigmaFake` exported from `@repo/figma-adapter/testing`.

**Tech Stack:** TypeScript, Bun, Vitest 4.1.4 (pinned to match protocol), Zod 3 (only for re-exporting protocol envelopes — no new schemas in this phase), `ws` 8.x (Node WebSocket server + client used in tests), `fast-check` 3.x (transport fuzz tests), Biome (root config).

**Predecessors:** This plan assumes Phase 1 (`docs/plans/2026-05-06-figma-mcp-rewrite-plan.md`) has landed: `@repo/protocol` exists with `Envelope`, `RequestEnvelope`, `ResponseEnvelope`, `ErrorEnvelope`, `parseEnvelope`, `ErrorCode`, `errorCategoryFor`, and the `FigmaAdapterPlaceholder` seam in `tools.ts`.

---

## Acceptance Criteria

- `packages/transport` exists, builds, lints clean, types clean.
- `packages/figma-adapter` exists, builds, lints clean, types clean, with a `./testing` subpath export.
- `bun run test` passes with ≥90% line coverage on **both** new packages and unchanged ≥95% on `@repo/protocol`.
- `Transport` interface and `Correlator` are tested for: drops, reorderings, duplicates, timeouts, parallel requests, and cancellation via `AbortSignal`. `fast-check` property tests prove invariants under fuzzed message sequences.
- `WebSocketServerTransport` and `WebSocketClientTransport` survive a real `ws`-backed integration test (random port, single client, full request/response loop).
- Reconnect wrapper retries with exponential backoff plus jitter, stops after a bounded attempt count, and is tested with a fake clock.
- `FigmaFake` supports `getLocalVariablesAsync`, `setValueForMode`, `createRectangle`, `currentPage.selection`, and an `editorType` switch (`"figma" | "figjam" | "slides"`).
- `@repo/protocol/tools.ts` imports `FigmaAdapter` from `@repo/figma-adapter` (type-only); the `FigmaAdapterPlaceholder` interface is deleted.
- A changeset records Phase 2 with the same minor-bump intent used for Phase 1.
- Commit hygiene: each task ends with one conventional-commit-formatted commit. No multi-task commits, no `git add -A`.

---

## Task Map

| # | Task | Package | Type |
|---|------|---------|------|
| 2.1 | Scaffold `@repo/transport` | transport | infra |
| 2.2 | Define `Transport` interface + in-memory pair (TDD) | transport | code |
| 2.3 | Implement `Correlator` with timeouts + cancellation (TDD) | transport | code |
| 2.4 | Implement `WebSocketServerTransport` (TDD) | transport | code |
| 2.5 | Implement `WebSocketClientTransport` (TDD) | transport | code |
| 2.6 | Reconnect wrapper with exponential backoff + jitter (TDD) | transport | code |
| 2.7 | Property tests: drops/reorders/duplicates | transport | tests |
| 2.8 | Coverage gate + lint pass for `@repo/transport` | transport | infra |
| 2.9 | Scaffold `@repo/figma-adapter` | figma-adapter | infra |
| 2.10 | Define `FigmaAdapter` interface (TDD via `expectTypeOf`) | figma-adapter | code |
| 2.11 | Implement `FigmaFake` (TDD) | figma-adapter | code |
| 2.12 | `editorType` switch on `FigmaFake` (TDD) | figma-adapter | code |
| 2.13 | Replace `FigmaAdapterPlaceholder` in `@repo/protocol` | protocol | refactor |
| 2.14 | Coverage gate + changeset + Phase 2 acceptance | repo | infra |

---

## Task 2.1: Scaffold `@repo/transport`

**Files:**
- Create: `packages/transport/package.json`
- Create: `packages/transport/tsconfig.json`
- Create: `packages/transport/vitest.config.ts`
- Create: `packages/transport/src/index.ts`

**Step 1: Create `packages/transport/package.json`**

Mirror the protocol package's structure. Pin `vitest` to `4.1.4` (identical pin used in `@repo/protocol`) and `@vitest/coverage-v8` to the same version. Add `ws` as a dependency and `@types/ws` as a devDependency.

```json
{
  "name": "@repo/transport",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./correlator": "./src/correlator.ts",
    "./websocket-server": "./src/websocket-server.ts",
    "./websocket-client": "./src/websocket-client.ts",
    "./reconnect": "./src/reconnect.ts",
    "./testing": "./src/testing.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "types": "tsc --noEmit",
    "lint": "biome check ."
  },
  "dependencies": {
    "@repo/protocol": "workspace:*",
    "ws": "^8.18.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/ws": "^8.5.13",
    "@vitest/coverage-v8": "4.1.4",
    "fast-check": "^3.23.0",
    "typescript": "^6.0.0",
    "vitest": "4.1.4"
  }
}
```

**Step 2: Create `packages/transport/tsconfig.json`**

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
    "isolatedModules": true
  },
  "include": ["src/**/*.ts"]
}
```

**Step 3: Create `packages/transport/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "src/testing.ts"],
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

> **Why `src/testing.ts` is excluded from coverage:** it's a public test-doubles export (the in-memory transport pair below). Test-doubles are exercised *by* tests in this package and elsewhere, but coverage on the double itself is meaningless — it has no production codepath.

**Step 4: Create `packages/transport/src/index.ts`**

```ts
/**
 * @repo/transport — WebSocket framing, request/response correlation,
 * reconnect/backoff. Wire format reuses @repo/protocol envelopes.
 *
 * Out of scope (intentional):
 * - MCP SDK glue (Phase 3's apps/mcp-server).
 * - Figma plugin manifest / allowedDomains (Phase 4's apps/bridge-plugin).
 * - Cloudflare relay routing (Phase 6's apps/relay).
 */
export {};
```

**Step 5: Install and verify**

Run: `bun install`
Expected: succeeds; `@repo/transport` appears as a workspace package.

Run: `bun run --filter @repo/transport test`
Expected: passes (no tests yet — vitest exits 0 because of `passWithNoTests` not being set, but the empty `include` glob will match nothing; if vitest 4 fails on no-tests, add `passWithNoTests: true` to the config).

Run: `bun run --filter @repo/transport types`
Expected: passes.

Run: `bun run --filter @repo/transport lint`
Expected: passes.

**Step 6: Commit**

```bash
git add packages/transport bun.lock
git commit -m "feat(transport): scaffold @repo/transport package

Empty package with package.json, tsconfig, and vitest config. Pins vitest
to 4.1.4 to match @repo/protocol. Adds ws + @types/ws + fast-check dev
deps. Subsequent tasks fill in Transport, Correlator, WebSocket impls,
and reconnect."
```

---

## Task 2.2: Define `Transport` interface + in-memory pair (TDD)

**Why first:** every subsequent transport task is a concrete implementation of the same interface. Pinning the contract here means the WebSocket impls in 2.4/2.5 are mechanical.

**Files:**
- Create: `packages/transport/src/transport.ts`
- Create: `packages/transport/src/testing.ts`
- Create: `packages/transport/src/__tests__/transport.test.ts`

**Step 1: Write the failing test**

```ts
// packages/transport/src/__tests__/transport.test.ts
import { describe, expect, it } from "vitest";
import type { RequestEnvelope } from "@repo/protocol";
import type { Transport } from "../transport";
import { createInMemoryTransportPair } from "../testing";

const sampleRequest: RequestEnvelope = {
  kind: "request",
  id: "req_1",
  sourceClientId: "test",
  tool: "ping",
  args: {},
};

describe("Transport (contract)", () => {
  it("delivers a sent envelope to the peer's onMessage handler", async () => {
    const [a, b] = createInMemoryTransportPair();
    const received: unknown[] = [];
    b.onMessage((env) => received.push(env));

    await a.send(sampleRequest);

    expect(received).toEqual([sampleRequest]);
  });

  it("delivers in both directions", async () => {
    const [a, b] = createInMemoryTransportPair();
    const onA: unknown[] = [];
    const onB: unknown[] = [];
    a.onMessage((e) => onA.push(e));
    b.onMessage((e) => onB.push(e));

    await a.send(sampleRequest);
    await b.send({ ...sampleRequest, id: "req_2" });

    expect(onB).toHaveLength(1);
    expect(onA).toHaveLength(1);
  });

  it("fires onConnect once per registered listener", () => {
    const [a] = createInMemoryTransportPair();
    let count = 0;
    a.onConnect(() => {
      count++;
    });
    expect(count).toBe(1);
  });

  it("fires onDisconnect on close", async () => {
    const [a, b] = createInMemoryTransportPair();
    let closed = false;
    b.onDisconnect(() => {
      closed = true;
    });
    await a.close();
    expect(closed).toBe(true);
  });

  it("rejects send after close", async () => {
    const [a] = createInMemoryTransportPair();
    await a.close();
    await expect(a.send(sampleRequest)).rejects.toThrow(/closed/i);
  });

  it("supports multiple onMessage subscribers", async () => {
    const [a, b] = createInMemoryTransportPair();
    const r1: unknown[] = [];
    const r2: unknown[] = [];
    b.onMessage((e) => r1.push(e));
    b.onMessage((e) => r2.push(e));

    await a.send(sampleRequest);

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
  });

  it("returns an unsubscribe function from onMessage", async () => {
    const [a, b] = createInMemoryTransportPair();
    const received: unknown[] = [];
    const unsub = b.onMessage((e) => received.push(e));

    await a.send(sampleRequest);
    unsub();
    await a.send({ ...sampleRequest, id: "req_2" });

    expect(received).toHaveLength(1);
  });

  it("typeof Transport interface", () => {
    const _x: Transport = {} as Transport;
    expect(_x).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run --filter @repo/transport test transport`
Expected: FAIL with `Cannot find module "../transport"` or similar.

**Step 3: Write the implementation**

```ts
// packages/transport/src/transport.ts
import type { Envelope } from "@repo/protocol";

/**
 * Newline-free, structured-message transport. Implementations are
 * responsible for framing on the wire (WebSocket gives us message
 * boundaries for free; raw TCP would need length-prefixing). The
 * envelope is always a parsed, validated @repo/protocol Envelope —
 * framing/parsing happens inside the implementation.
 */
export interface Transport {
  /**
   * Send an envelope to the remote peer. Resolves when the message has
   * been handed to the underlying transport (not when the peer has
   * received it). Rejects if the transport is closed or in a terminal
   * error state.
   */
  send(envelope: Envelope): Promise<void>;

  /**
   * Subscribe to incoming envelopes. The handler receives already-parsed
   * envelopes — implementations call `parseEnvelope` (or equivalent) on
   * the wire bytes before invoking the handler. Malformed messages are
   * dropped with a warning, never delivered.
   *
   * Returns an unsubscribe function.
   */
  onMessage(handler: (envelope: Envelope) => void): () => void;

  /** Subscribe to connect events. Fires once for every listener if the transport is already connected. */
  onConnect(handler: () => void): () => void;

  /** Subscribe to disconnect events. */
  onDisconnect(handler: (reason?: Error) => void): () => void;

  /** Close the transport. Idempotent. */
  close(): Promise<void>;
}
```

```ts
// packages/transport/src/testing.ts
import type { Envelope } from "@repo/protocol";
import type { Transport } from "./transport";

type Handler<T> = (arg: T) => void;

class InMemoryTransport implements Transport {
  private peer: InMemoryTransport | null = null;
  private messageHandlers = new Set<Handler<Envelope>>();
  private connectHandlers = new Set<Handler<void>>();
  private disconnectHandlers = new Set<Handler<Error | undefined>>();
  private closed = false;

  setPeer(peer: InMemoryTransport): void {
    this.peer = peer;
  }

  async send(envelope: Envelope): Promise<void> {
    if (this.closed) throw new Error("transport closed");
    if (!this.peer) throw new Error("transport unpaired");
    // Deliver synchronously on the next microtask so callers can subscribe first.
    const peer = this.peer;
    queueMicrotask(() => peer.deliver(envelope));
  }

  deliver(envelope: Envelope): void {
    for (const h of this.messageHandlers) h(envelope);
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
    for (const h of this.disconnectHandlers) h(undefined);
    if (this.peer && !this.peer.closed) await this.peer.close();
  }
}

/**
 * Returns a paired pair of transports that deliver to each other in
 * memory. Useful for end-to-end tests of higher-level layers
 * (Correlator, MCP wiring, etc.) without spinning up a WebSocket.
 */
export function createInMemoryTransportPair(): [Transport, Transport] {
  const a = new InMemoryTransport();
  const b = new InMemoryTransport();
  a.setPeer(b);
  b.setPeer(a);
  return [a, b];
}
```

**Step 4: Update index.ts**

```ts
// packages/transport/src/index.ts
/**
 * @repo/transport — WebSocket framing, request/response correlation,
 * reconnect/backoff. Wire format reuses @repo/protocol envelopes.
 *
 * Out of scope (intentional):
 * - MCP SDK glue (Phase 3's apps/mcp-server).
 * - Figma plugin manifest / allowedDomains (Phase 4's apps/bridge-plugin).
 * - Cloudflare relay routing (Phase 6's apps/relay).
 */
export type { Transport } from "./transport";
```

**Step 5: Run tests to verify they pass**

Run: `bun run --filter @repo/transport test transport`
Expected: PASS (8 tests).

**Step 6: Commit**

```bash
git add packages/transport/src/transport.ts packages/transport/src/testing.ts packages/transport/src/__tests__/transport.test.ts packages/transport/src/index.ts
git commit -m "feat(transport): add Transport interface and in-memory pair test double"
```

---

## Task 2.3: Implement `Correlator` (TDD)

**Goal:** Take a `Transport` and turn request/response/error envelopes into Promises by tracking pending request IDs. Support timeouts and `AbortSignal` cancellation.

**Files:**
- Create: `packages/transport/src/correlator.ts`
- Create: `packages/transport/src/__tests__/correlator.test.ts`

**Step 1: Write the failing tests**

```ts
// packages/transport/src/__tests__/correlator.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  ErrorCode,
  type RequestEnvelope,
  type ResponseEnvelope,
  type ErrorEnvelope,
} from "@repo/protocol";
import { Correlator } from "../correlator";
import { createInMemoryTransportPair } from "../testing";

const baseRequest = (id: string): RequestEnvelope => ({
  kind: "request",
  id,
  sourceClientId: "test",
  tool: "ping",
  args: {},
});

describe("Correlator", () => {
  it("resolves when the matching response arrives", async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new Correlator(client);

    server.onMessage(async (env) => {
      if (env.kind !== "request") return;
      const response: ResponseEnvelope = {
        kind: "response",
        id: env.id,
        ok: true,
        result: { pong: true },
      };
      await server.send(response);
    });

    const result = await correlator.request(baseRequest("req_1"));
    expect(result).toEqual({ pong: true });
  });

  it("rejects with a typed error when an error envelope arrives", async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new Correlator(client);

    server.onMessage(async (env) => {
      if (env.kind !== "request") return;
      const err: ErrorEnvelope = {
        kind: "error",
        id: env.id,
        ok: false,
        code: ErrorCode.E_FIGMA_NODE_NOT_FOUND,
        category: "figma",
        message: "Node 1:23 was deleted",
      };
      await server.send(err);
    });

    await expect(correlator.request(baseRequest("req_2"))).rejects.toMatchObject({
      code: ErrorCode.E_FIGMA_NODE_NOT_FOUND,
      category: "figma",
    });
  });

  it("times out after the configured deadline", async () => {
    vi.useFakeTimers();
    const [client] = createInMemoryTransportPair();
    const correlator = new Correlator(client, { timeoutMs: 50 });

    const promise = correlator.request(baseRequest("req_3"));
    vi.advanceTimersByTime(51);

    await expect(promise).rejects.toMatchObject({
      code: ErrorCode.E_TRANSPORT_TIMEOUT,
    });
    vi.useRealTimers();
  });

  it("cancels via AbortSignal", async () => {
    const [client] = createInMemoryTransportPair();
    const correlator = new Correlator(client);
    const ac = new AbortController();

    const promise = correlator.request(baseRequest("req_4"), { signal: ac.signal });
    ac.abort();

    await expect(promise).rejects.toThrow(/abort/i);
  });

  it("does not resolve a request twice if a duplicate response arrives", async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new Correlator(client);

    let serverSent = 0;
    server.onMessage(async (env) => {
      if (env.kind !== "request") return;
      const response: ResponseEnvelope = {
        kind: "response",
        id: env.id,
        ok: true,
        result: serverSent++,
      };
      await server.send(response);
      // Send a second time on purpose — duplicate.
      await server.send(response);
    });

    const result = await correlator.request(baseRequest("req_5"));
    expect(result).toBe(0);
    // No throw, no second resolution.
  });

  it("delivers the right response when many requests are in flight", async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new Correlator(client);

    server.onMessage(async (env) => {
      if (env.kind !== "request") return;
      const response: ResponseEnvelope = {
        kind: "response",
        id: env.id,
        ok: true,
        result: env.id,
      };
      await server.send(response);
    });

    const results = await Promise.all([
      correlator.request(baseRequest("req_a")),
      correlator.request(baseRequest("req_b")),
      correlator.request(baseRequest("req_c")),
    ]);
    expect(results).toEqual(["req_a", "req_b", "req_c"]);
  });

  it("ignores responses for unknown ids without crashing", async () => {
    const [client, server] = createInMemoryTransportPair();
    new Correlator(client);

    await server.send({
      kind: "response",
      id: "ghost",
      ok: true,
      result: null,
    });

    // No assertion needed — the test passes if no error is thrown.
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun run --filter @repo/transport test correlator`
Expected: FAIL with `Cannot find module "../correlator"`.

**Step 3: Write the implementation**

```ts
// packages/transport/src/correlator.ts
import {
  type Envelope,
  type ErrorEnvelope,
  ErrorCode,
  type RequestEnvelope,
  type ResponseEnvelope,
} from "@repo/protocol";
import type { Transport } from "./transport";

export interface CorrelatorOptions {
  /** Default request timeout in ms. Defaults to 30000. */
  readonly timeoutMs?: number;
}

export interface RequestOptions {
  /** Per-request timeout override. */
  readonly timeoutMs?: number;
  /** AbortSignal to cancel the in-flight request. */
  readonly signal?: AbortSignal;
}

/**
 * Strongly-typed error thrown by `Correlator.request` when the server
 * returns an `ErrorEnvelope`. Mirrors the envelope's fields verbatim
 * so callers can switch on `.code` without re-parsing JSON.
 */
export class TransportError extends Error {
  readonly code: ErrorEnvelope["code"];
  readonly category: ErrorEnvelope["category"];
  readonly remediation?: string;
  readonly details?: ErrorEnvelope["details"];

  constructor(envelope: ErrorEnvelope) {
    super(envelope.message);
    this.name = "TransportError";
    this.code = envelope.code;
    this.category = envelope.category;
    this.remediation = envelope.remediation;
    this.details = envelope.details;
  }
}

interface PendingEntry {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  abortHandler: (() => void) | null;
}

export class Correlator {
  private readonly transport: Transport;
  private readonly defaultTimeoutMs: number;
  private readonly pending = new Map<string, PendingEntry>();

  constructor(transport: Transport, options: CorrelatorOptions = {}) {
    this.transport = transport;
    this.defaultTimeoutMs = options.timeoutMs ?? 30_000;
    transport.onMessage((env) => this.dispatch(env));
  }

  async request<T = unknown>(
    envelope: RequestEnvelope,
    options: RequestOptions = {},
  ): Promise<T> {
    const id = envelope.id;
    if (this.pending.has(id)) {
      throw new Error(`duplicate request id: ${id}`);
    }

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.settle(id, () =>
                reject(
                  new TransportError({
                    kind: "error",
                    id,
                    ok: false,
                    code: ErrorCode.E_TRANSPORT_TIMEOUT,
                    category: "transport",
                    message: `request ${id} timed out after ${timeoutMs}ms`,
                  }),
                ),
              );
            }, timeoutMs)
          : null;

      const abortHandler = options.signal
        ? () => {
            this.settle(id, () =>
              reject(
                Object.assign(new Error("request aborted"), {
                  name: "AbortError",
                }),
              ),
            );
          }
        : null;

      if (options.signal && abortHandler) {
        options.signal.addEventListener("abort", abortHandler, { once: true });
      }

      this.pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
        timer,
        abortHandler,
      });

      this.transport.send(envelope).catch((err) => {
        this.settle(id, () => reject(err));
      });

      if (options.signal?.aborted) abortHandler?.();
    });
  }

  private dispatch(envelope: Envelope): void {
    if (envelope.kind === "response") {
      this.handleResponse(envelope);
    } else if (envelope.kind === "error") {
      this.handleError(envelope);
    }
  }

  private handleResponse(env: ResponseEnvelope): void {
    const entry = this.pending.get(env.id);
    if (!entry) return;
    this.cleanup(env.id, entry);
    entry.resolve(env.result);
  }

  private handleError(env: ErrorEnvelope): void {
    const entry = this.pending.get(env.id);
    if (!entry) return;
    this.cleanup(env.id, entry);
    entry.reject(new TransportError(env));
  }

  private settle(id: string, fn: () => void): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.cleanup(id, entry);
    fn();
  }

  private cleanup(id: string, entry: PendingEntry): void {
    if (entry.timer) clearTimeout(entry.timer);
    this.pending.delete(id);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `bun run --filter @repo/transport test correlator`
Expected: PASS (7 tests).

**Step 5: Update index.ts**

```ts
// packages/transport/src/index.ts
/**
 * @repo/transport — WebSocket framing, request/response correlation,
 * reconnect/backoff. Wire format reuses @repo/protocol envelopes.
 */
export type { Transport } from "./transport";
export { Correlator, TransportError } from "./correlator";
export type { CorrelatorOptions, RequestOptions } from "./correlator";
```

**Step 6: Commit**

```bash
git add packages/transport/src/correlator.ts packages/transport/src/__tests__/correlator.test.ts packages/transport/src/index.ts
git commit -m "feat(transport): add Correlator with timeouts and AbortSignal cancellation"
```

---

## Task 2.4: Implement `WebSocketServerTransport` (TDD)

**Goal:** Wrap `ws.WebSocketServer` for the daemon side. Single-client (the daemon owns one plugin connection at a time — see design doc §"How the daemon coordinates").

**Files:**
- Create: `packages/transport/src/websocket-server.ts`
- Create: `packages/transport/src/__tests__/websocket-server.test.ts`

**Step 1: Write the failing tests**

```ts
// packages/transport/src/__tests__/websocket-server.test.ts
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { RequestEnvelope } from "@repo/protocol";
import { WebSocketServerTransport } from "../websocket-server";

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

describe("WebSocketServerTransport", () => {
  it("accepts a single client and round-trips an envelope", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const port = server.port;

    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.send(JSON.stringify(sample));

    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received[0]).toEqual(sample);

    client.close();
    await server.close();
  });

  it("delivers an envelope from server to client", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const port = server.port;

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => client.once("open", () => r()));
    const clientReceived: unknown[] = [];
    client.on("message", (raw) => clientReceived.push(JSON.parse(String(raw))));

    // Wait for the server-side connection to register.
    await waitFor(() => (server.isConnected ? true : undefined));
    await server.send(sample);

    await waitFor(() =>
      clientReceived.length > 0 ? clientReceived : undefined,
    );
    expect(clientReceived[0]).toEqual(sample);

    client.close();
    await server.close();
  });

  it("rejects a second connection while one is active", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const port = server.port;

    const a = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => a.once("open", () => r()));

    const b = new WebSocket(`ws://127.0.0.1:${port}`);
    const closeReason = await new Promise<number>((r) =>
      b.once("close", (code) => r(code)),
    );
    expect(closeReason).toBeGreaterThan(0);

    a.close();
    await server.close();
  });

  it("drops malformed messages and stays connected", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const port = server.port;

    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.send("not json");
    client.send(JSON.stringify({ kind: "nope" }));
    client.send(JSON.stringify(sample));

    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(sample);

    client.close();
    await server.close();
  });

  it("fires onDisconnect when the client closes", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const port = server.port;

    let disconnected = false;
    server.onDisconnect(() => {
      disconnected = true;
    });

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.close();

    await waitFor(() => (disconnected ? true : undefined));
    expect(disconnected).toBe(true);

    await server.close();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun run --filter @repo/transport test websocket-server`
Expected: FAIL with `Cannot find module "../websocket-server"`.

**Step 3: Write the implementation**

```ts
// packages/transport/src/websocket-server.ts
import { type AddressInfo } from "node:net";
import { type WebSocket, WebSocketServer } from "ws";
import { type Envelope, parseEnvelope } from "@repo/protocol";
import type { Transport } from "./transport";

export interface ListenOptions {
  /** TCP port; pass 0 to bind to a random free port. */
  readonly port: number;
  /** Bind address; defaults to 127.0.0.1 (loopback only). */
  readonly host?: string;
}

type Handler<T> = (arg: T) => void;

/**
 * Daemon-side WebSocket transport. Accepts at most one client at a
 * time; subsequent connection attempts are rejected immediately.
 *
 * Loopback-only by default (127.0.0.1). The daemon model assumes the
 * plugin and the daemon live on the same machine; the relay handles
 * remote pairing in Phase 6.
 */
export class WebSocketServerTransport implements Transport {
  private readonly wss: WebSocketServer;
  private socket: WebSocket | null = null;
  private readonly messageHandlers = new Set<Handler<Envelope>>();
  private readonly connectHandlers = new Set<Handler<void>>();
  private readonly disconnectHandlers = new Set<Handler<Error | undefined>>();
  private closed = false;

  readonly port: number;

  private constructor(wss: WebSocketServer, port: number) {
    this.wss = wss;
    this.port = port;
    wss.on("connection", (ws) => this.onConnection(ws));
  }

  static listen(options: ListenOptions): Promise<WebSocketServerTransport> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({
        port: options.port,
        host: options.host ?? "127.0.0.1",
      });
      wss.once("error", reject);
      wss.once("listening", () => {
        wss.removeListener("error", reject);
        const address = wss.address() as AddressInfo;
        resolve(new WebSocketServerTransport(wss, address.port));
      });
    });
  }

  get isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === 1;
  }

  async send(envelope: Envelope): Promise<void> {
    if (this.closed) throw new Error("transport closed");
    if (!this.socket || this.socket.readyState !== 1) {
      throw new Error("no client connected");
    }
    this.socket.send(JSON.stringify(envelope));
  }

  onMessage(handler: Handler<Envelope>): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnect(handler: Handler<void>): () => void {
    this.connectHandlers.add(handler);
    if (this.isConnected) handler();
    return () => this.connectHandlers.delete(handler);
  }

  onDisconnect(handler: Handler<Error | undefined>): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  private onConnection(ws: WebSocket): void {
    if (this.socket) {
      ws.close(4000, "single-client server");
      return;
    }
    this.socket = ws;
    for (const h of this.connectHandlers) h();

    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
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

    ws.on("close", () => {
      this.socket = null;
      for (const h of this.disconnectHandlers) h(undefined);
    });

    ws.on("error", (err) => {
      for (const h of this.disconnectHandlers) h(err);
    });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `bun run --filter @repo/transport test websocket-server`
Expected: PASS (5 tests).

> **Flake-mitigation note:** the tests use `waitFor` to poll for state instead of `setTimeout`. If a test flakes in CI, raise the `timeoutMs` argument; do **not** add a fixed `setTimeout` — fixed waits are the #1 source of CI flake.

**Step 5: Commit**

```bash
git add packages/transport/src/websocket-server.ts packages/transport/src/__tests__/websocket-server.test.ts
git commit -m "feat(transport): add single-client WebSocketServerTransport"
```

---

## Task 2.5: Implement `WebSocketClientTransport` (TDD)

**Goal:** Plugin/CLI side. Wraps a WebSocket constructor (browser global or `ws.WebSocket` in Node tests).

**Files:**
- Create: `packages/transport/src/websocket-client.ts`
- Create: `packages/transport/src/__tests__/websocket-client.test.ts`

**Step 1: Write the failing tests**

```ts
// packages/transport/src/__tests__/websocket-client.test.ts
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { RequestEnvelope } from "@repo/protocol";
import { WebSocketServerTransport } from "../websocket-server";
import { WebSocketClientTransport } from "../websocket-client";

const sample: RequestEnvelope = {
  kind: "request",
  id: "req_1",
  sourceClientId: "client",
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

describe("WebSocketClientTransport", () => {
  it("connects to a server and sends an envelope", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${server.port}`,
      WebSocketCtor: WebSocket,
    });

    await client.send(sample);
    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received[0]).toEqual(sample);

    await client.close();
    await server.close();
  });

  it("receives envelopes from the server", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });

    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${server.port}`,
      WebSocketCtor: WebSocket,
    });

    const received: unknown[] = [];
    client.onMessage((env) => received.push(env));

    await waitFor(() => (server.isConnected ? true : undefined));
    await server.send(sample);
    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received[0]).toEqual(sample);

    await client.close();
    await server.close();
  });

  it("rejects connect() when the server is unreachable", async () => {
    await expect(
      WebSocketClientTransport.connect({
        url: "ws://127.0.0.1:1",
        WebSocketCtor: WebSocket,
        connectTimeoutMs: 100,
      }),
    ).rejects.toThrow();
  });

  it("rejects send after close", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${server.port}`,
      WebSocketCtor: WebSocket,
    });
    await client.close();
    await expect(client.send(sample)).rejects.toThrow(/closed/i);
    await server.close();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun run --filter @repo/transport test websocket-client`
Expected: FAIL with `Cannot find module "../websocket-client"`.

**Step 3: Write the implementation**

```ts
// packages/transport/src/websocket-client.ts
import { type Envelope, parseEnvelope } from "@repo/protocol";
import type { Transport } from "./transport";

interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(event: "open", handler: () => void): void;
  addEventListener(event: "message", handler: (e: { data: unknown }) => void): void;
  addEventListener(event: "close", handler: () => void): void;
  addEventListener(event: "error", handler: (e: unknown) => void): void;
}

type WebSocketCtor = new (url: string) => WebSocketLike;

export interface ConnectOptions {
  readonly url: string;
  /** Constructor for the WebSocket implementation. Pass `globalThis.WebSocket` in browser, `ws.WebSocket` in Node tests. */
  readonly WebSocketCtor: WebSocketCtor;
  /** ms to wait for the open event. Defaults to 5000. */
  readonly connectTimeoutMs?: number;
}

type Handler<T> = (arg: T) => void;

export class WebSocketClientTransport implements Transport {
  private readonly socket: WebSocketLike;
  private readonly messageHandlers = new Set<Handler<Envelope>>();
  private readonly connectHandlers = new Set<Handler<void>>();
  private readonly disconnectHandlers = new Set<Handler<Error | undefined>>();
  private closed = false;

  private constructor(socket: WebSocketLike) {
    this.socket = socket;
    socket.addEventListener("message", (e) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String((e as { data: unknown }).data));
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
    socket.addEventListener("close", () => {
      this.closed = true;
      for (const h of this.disconnectHandlers) h(undefined);
    });
    socket.addEventListener("error", (err) => {
      for (const h of this.disconnectHandlers) h(err as Error);
    });
  }

  static connect(options: ConnectOptions): Promise<WebSocketClientTransport> {
    const timeoutMs = options.connectTimeoutMs ?? 5_000;
    return new Promise((resolve, reject) => {
      const socket = new options.WebSocketCtor(options.url);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`connect timeout: ${options.url}`));
      }, timeoutMs);

      socket.addEventListener("open", () => {
        clearTimeout(timer);
        const transport = new WebSocketClientTransport(socket);
        for (const h of transport.connectHandlers) h();
        resolve(transport);
      });

      socket.addEventListener("error", (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error("websocket error"));
      });
    });
  }

  async send(envelope: Envelope): Promise<void> {
    if (this.closed) throw new Error("transport closed");
    this.socket.send(JSON.stringify(envelope));
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
    this.socket.close();
  }
}
```

> **Why a `WebSocketCtor` parameter:** the plugin runs in Figma's iframe and uses the browser global `WebSocket`. Node tests use `ws.WebSocket`. Passing the constructor explicitly avoids both a `globalThis` shim and a runtime check, and the test boundary stays clean. The plugin code in Phase 4 will pass `globalThis.WebSocket`.

**Step 4: Run tests to verify they pass**

Run: `bun run --filter @repo/transport test websocket-client`
Expected: PASS (4 tests).

**Step 5: Update index.ts**

```ts
// packages/transport/src/index.ts
export type { Transport } from "./transport";
export { Correlator, TransportError } from "./correlator";
export type { CorrelatorOptions, RequestOptions } from "./correlator";
export { WebSocketServerTransport } from "./websocket-server";
export type { ListenOptions } from "./websocket-server";
export { WebSocketClientTransport } from "./websocket-client";
export type { ConnectOptions } from "./websocket-client";
```

**Step 6: Commit**

```bash
git add packages/transport/src/websocket-client.ts packages/transport/src/__tests__/websocket-client.test.ts packages/transport/src/index.ts
git commit -m "feat(transport): add WebSocketClientTransport with pluggable WebSocket ctor"
```

---

## Task 2.6: Reconnect with exponential backoff + jitter (TDD)

**Goal:** A `withReconnect(connect, options)` higher-order function that wraps an async connect call. On disconnect it re-runs the connect with exponential backoff + jitter, up to a bounded attempt count. Surfaces `E_BRIDGE_UNAVAILABLE` as a terminal error after exhaustion.

**Files:**
- Create: `packages/transport/src/reconnect.ts`
- Create: `packages/transport/src/__tests__/reconnect.test.ts`

**Step 1: Write the failing tests**

```ts
// packages/transport/src/__tests__/reconnect.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@repo/protocol";
import { computeBackoff, withReconnect } from "../reconnect";
import { TransportError } from "../correlator";

describe("computeBackoff", () => {
  it("doubles base delay per attempt", () => {
    const random = () => 0.5; // jitter to midpoint
    expect(computeBackoff(0, { baseMs: 100, maxMs: 10_000, random })).toBe(100);
    expect(computeBackoff(1, { baseMs: 100, maxMs: 10_000, random })).toBe(200);
    expect(computeBackoff(2, { baseMs: 100, maxMs: 10_000, random })).toBe(400);
    expect(computeBackoff(3, { baseMs: 100, maxMs: 10_000, random })).toBe(800);
  });

  it("clamps to maxMs", () => {
    const random = () => 0.5;
    expect(computeBackoff(20, { baseMs: 100, maxMs: 10_000, random })).toBe(10_000);
  });

  it("applies jitter as +/- 50% of delay", () => {
    expect(computeBackoff(0, { baseMs: 100, maxMs: 10_000, random: () => 0 })).toBe(50);
    expect(computeBackoff(0, { baseMs: 100, maxMs: 10_000, random: () => 1 })).toBe(150);
  });
});

describe("withReconnect", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns a connection on first success", async () => {
    const connect = vi.fn().mockResolvedValueOnce("conn");
    const result = await withReconnect(connect, { maxAttempts: 3, baseMs: 10, maxMs: 100, random: () => 0.5 });
    expect(result).toBe("conn");
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("conn");

    const promise = withReconnect(connect, { maxAttempts: 5, baseMs: 10, maxMs: 100, random: () => 0.5 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("conn");
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it("gives up after maxAttempts and throws E_BRIDGE_UNAVAILABLE", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("boom"));
    const promise = withReconnect(connect, { maxAttempts: 3, baseMs: 10, maxMs: 100, random: () => 0.5 });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({
      code: ErrorCode.E_BRIDGE_UNAVAILABLE,
    });
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it("aborts via AbortSignal between retries", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("boom"));
    const ac = new AbortController();
    const promise = withReconnect(connect, {
      maxAttempts: 10,
      baseMs: 10,
      maxMs: 100,
      random: () => 0.5,
      signal: ac.signal,
    });
    ac.abort();
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/abort/i);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun run --filter @repo/transport test reconnect`
Expected: FAIL with `Cannot find module "../reconnect"`.

**Step 3: Write the implementation**

```ts
// packages/transport/src/reconnect.ts
import { ErrorCode } from "@repo/protocol";
import { TransportError } from "./correlator";

export interface BackoffOptions {
  /** Initial delay in ms before the second attempt. */
  readonly baseMs: number;
  /** Cap on delay. */
  readonly maxMs: number;
  /** Random source — `Math.random` in production, deterministic in tests. */
  readonly random?: () => number;
}

export interface ReconnectOptions extends BackoffOptions {
  /** Total number of attempts including the first. */
  readonly maxAttempts: number;
  /** Cancel pending retries. */
  readonly signal?: AbortSignal;
}

/**
 * Exponential backoff with +/- 50% jitter. `attempt` is 0-indexed:
 * attempt 0 returns ~baseMs, attempt 1 returns ~2*baseMs, etc.
 */
export function computeBackoff(attempt: number, options: BackoffOptions): number {
  const random = options.random ?? Math.random;
  const exp = Math.min(options.maxMs, options.baseMs * 2 ** attempt);
  const jitter = exp * (random() - 0.5); // [-0.5, 0.5] * exp
  return Math.max(0, Math.round(exp + jitter));
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function withReconnect<T>(
  connect: () => Promise<T>,
  options: ReconnectOptions,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await connect();
    } catch (err) {
      lastErr = err;
      if (attempt === options.maxAttempts - 1) break;
      const delay = computeBackoff(attempt, options);
      await sleep(delay, options.signal);
    }
  }
  throw new TransportError({
    kind: "error",
    id: "reconnect",
    ok: false,
    code: ErrorCode.E_BRIDGE_UNAVAILABLE,
    category: "transport",
    message: `connect failed after ${options.maxAttempts} attempts`,
    details: { lastError: String(lastErr) },
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `bun run --filter @repo/transport test reconnect`
Expected: PASS (7 tests).

**Step 5: Update index.ts**

```ts
export type { Transport } from "./transport";
export { Correlator, TransportError } from "./correlator";
export type { CorrelatorOptions, RequestOptions } from "./correlator";
export { WebSocketServerTransport } from "./websocket-server";
export type { ListenOptions } from "./websocket-server";
export { WebSocketClientTransport } from "./websocket-client";
export type { ConnectOptions } from "./websocket-client";
export { computeBackoff, withReconnect } from "./reconnect";
export type { BackoffOptions, ReconnectOptions } from "./reconnect";
```

**Step 6: Commit**

```bash
git add packages/transport/src/reconnect.ts packages/transport/src/__tests__/reconnect.test.ts packages/transport/src/index.ts
git commit -m "feat(transport): add withReconnect helper with jittered exponential backoff"
```

---

## Task 2.7: Property tests — drops, reorderings, duplicates

**Goal:** Use `fast-check` to fuzz the `Correlator` against arbitrary message sequences. Prove: no resolved request resolves twice; no request resolves with a result belonging to a different request; out-of-order responses still pair correctly.

**Files:**
- Create: `packages/transport/src/__tests__/correlator.property.test.ts`

**Step 1: Write the property tests**

```ts
// packages/transport/src/__tests__/correlator.property.test.ts
import { describe, it } from "vitest";
import fc from "fast-check";
import type { RequestEnvelope, ResponseEnvelope, ErrorEnvelope } from "@repo/protocol";
import { ErrorCode } from "@repo/protocol";
import { Correlator } from "../correlator";
import { createInMemoryTransportPair } from "../testing";

const arbId = fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0);

describe("Correlator (property)", () => {
  it("each request resolves exactly once even with duplicate responses", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(arbId, { minLength: 1, maxLength: 20 }),
        async (ids) => {
          const [client, server] = createInMemoryTransportPair();
          const correlator = new Correlator(client, { timeoutMs: 5_000 });

          server.onMessage(async (env) => {
            if (env.kind !== "request") return;
            const response: ResponseEnvelope = {
              kind: "response",
              id: env.id,
              ok: true,
              result: env.id,
            };
            // Send the same response twice — the Correlator must ignore the dup.
            await server.send(response);
            await server.send(response);
          });

          const results = await Promise.all(
            ids.map((id) =>
              correlator.request<string>({
                kind: "request",
                id,
                sourceClientId: "test",
                tool: "echo",
                args: {},
              } satisfies RequestEnvelope),
            ),
          );

          if (results.length !== ids.length) return false;
          for (let i = 0; i < ids.length; i++) {
            if (results[i] !== ids[i]) return false;
          }
          return true;
        },
      ),
      { numRuns: 30 },
    );
  });

  it("interleaved success + error responses route correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(arbId, { minLength: 2, maxLength: 12 }),
        fc.array(fc.boolean(), { minLength: 2, maxLength: 12 }),
        async (ids, errorMask) => {
          const [client, server] = createInMemoryTransportPair();
          const correlator = new Correlator(client, { timeoutMs: 5_000 });

          server.onMessage(async (env) => {
            if (env.kind !== "request") return;
            const idx = ids.indexOf(env.id);
            const isError = errorMask[idx % errorMask.length];
            if (isError) {
              const err: ErrorEnvelope = {
                kind: "error",
                id: env.id,
                ok: false,
                code: ErrorCode.E_FIGMA_UNKNOWN,
                category: "figma",
                message: "fail",
              };
              await server.send(err);
            } else {
              const response: ResponseEnvelope = {
                kind: "response",
                id: env.id,
                ok: true,
                result: env.id,
              };
              await server.send(response);
            }
          });

          const settled = await Promise.allSettled(
            ids.map((id) =>
              correlator.request<string>({
                kind: "request",
                id,
                sourceClientId: "test",
                tool: "echo",
                args: {},
              }),
            ),
          );

          for (let i = 0; i < ids.length; i++) {
            const isError = errorMask[i % errorMask.length];
            const r = settled[i];
            if (isError && r.status !== "rejected") return false;
            if (!isError && r.status !== "fulfilled") return false;
            if (!isError && r.status === "fulfilled" && r.value !== ids[i]) return false;
          }
          return true;
        },
      ),
      { numRuns: 20 },
    );
  });
});
```

**Step 2: Run the tests**

Run: `bun run --filter @repo/transport test correlator.property`
Expected: PASS.

**Step 3: Commit**

```bash
git add packages/transport/src/__tests__/correlator.property.test.ts
git commit -m "test(transport): add property tests for Correlator under dups/errors"
```

---

## Task 2.8: Coverage gate + lint pass for `@repo/transport`

**Files:** none new — verification only.

**Step 1: Run with coverage**

Run: `bun run --filter @repo/transport test --coverage`
Expected: PASS with ≥90% lines, ≥85% branches, ≥90% functions.

If coverage falls short on a specific file, add a targeted unit test rather than relaxing the threshold. The most likely gap is `reconnect.ts`'s `DOMException` path — make sure both the no-signal and aborted-during-sleep branches are tested.

**Step 2: Run lint and typecheck**

Run: `bun run --filter @repo/transport lint`
Expected: PASS.

Run: `bun run --filter @repo/transport types`
Expected: PASS.

**Step 3: Run root tasks**

Run: `bun run lint && bun run test && bun run types`
Expected: all pass across all workspaces.

**Step 4: Commit (if anything changed)**

If you added a coverage-closing test:

```bash
git add <files>
git commit -m "test(transport): close coverage gap on <area>"
```

If nothing changed, skip — no empty commits.

---

## Task 2.9: Scaffold `@repo/figma-adapter`

**Files:**
- Create: `packages/figma-adapter/package.json`
- Create: `packages/figma-adapter/tsconfig.json`
- Create: `packages/figma-adapter/vitest.config.ts`
- Create: `packages/figma-adapter/src/index.ts`
- Create: `packages/figma-adapter/src/testing.ts`

**Step 1: Create `packages/figma-adapter/package.json`**

```json
{
  "name": "@repo/figma-adapter",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "types": "tsc --noEmit",
    "lint": "biome check ."
  },
  "devDependencies": {
    "@vitest/coverage-v8": "4.1.4",
    "typescript": "^6.0.0",
    "vitest": "4.1.4"
  }
}
```

> **No protocol dependency:** the adapter is intentionally protocol-agnostic. Tools that consume both depend on both, but the adapter itself is just a wrapper around the figma plugin runtime.

**Step 2: `packages/figma-adapter/tsconfig.json`**

Identical to `packages/transport/tsconfig.json`.

**Step 3: `packages/figma-adapter/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**"],
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

> **Note:** `src/testing.ts` is **not** excluded from coverage here — `FigmaFake` is the production behaviour for this package (it's what consumers actually run in their tests). Its quality determines the quality of every downstream tool's tests.

**Step 4: Create empty `src/index.ts` and `src/testing.ts`**

```ts
// packages/figma-adapter/src/index.ts
/**
 * @repo/figma-adapter — typed seam over the Figma plugin runtime.
 *
 * Out of scope (intentional):
 * - `RealFigmaAdapter` (lands in Phase 4 alongside `apps/bridge-plugin`).
 * - REST API client (lands in Phase 8 with `@repo/tools-rest`).
 */
export {};
```

```ts
// packages/figma-adapter/src/testing.ts
export {};
```

**Step 5: Install + verify**

Run: `bun install`
Run: `bun run --filter @repo/figma-adapter types`
Run: `bun run --filter @repo/figma-adapter lint`
Expected: all pass.

**Step 6: Commit**

```bash
git add packages/figma-adapter bun.lock
git commit -m "feat(figma-adapter): scaffold @repo/figma-adapter package"
```

---

## Task 2.10: Define `FigmaAdapter` interface (TDD via `expectTypeOf`)

**Goal:** Lock the interface shape. We don't need runtime behaviour yet; TypeScript-level tests pin the contract. Limit the interface to **only** what Phase 2's acceptance criteria call out — extending it as Phase 3+ tools land is mechanical.

**Files:**
- Create: `packages/figma-adapter/src/adapter.ts`
- Create: `packages/figma-adapter/src/__tests__/adapter.test.ts`

**Step 1: Write the failing tests**

```ts
// packages/figma-adapter/src/__tests__/adapter.test.ts
import { describe, expectTypeOf, it } from "vitest";
import type {
  FigmaAdapter,
  EditorType,
  Variable,
  RectangleNode,
  PageSelection,
} from "../adapter";

describe("FigmaAdapter (type contract)", () => {
  it("declares the editorType discriminator", () => {
    expectTypeOf<FigmaAdapter["editorType"]>().toEqualTypeOf<EditorType>();
  });

  it("declares getLocalVariablesAsync", () => {
    expectTypeOf<FigmaAdapter["getLocalVariablesAsync"]>().toBeFunction();
    expectTypeOf<FigmaAdapter["getLocalVariablesAsync"]>().returns.resolves.toEqualTypeOf<Variable[]>();
  });

  it("declares setValueForMode", () => {
    expectTypeOf<FigmaAdapter["setValueForMode"]>()
      .parameter(0)
      .toEqualTypeOf<{ variableId: string; modeId: string; value: unknown }>();
    expectTypeOf<FigmaAdapter["setValueForMode"]>().returns.resolves.toEqualTypeOf<void>();
  });

  it("declares createRectangle", () => {
    expectTypeOf<FigmaAdapter["createRectangle"]>().returns.toEqualTypeOf<RectangleNode>();
  });

  it("declares currentPageSelection", () => {
    expectTypeOf<FigmaAdapter["currentPageSelection"]>().toEqualTypeOf<PageSelection>();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run --filter @repo/figma-adapter test adapter`
Expected: FAIL with `Cannot find module "../adapter"`.

**Step 3: Write the implementation**

```ts
// packages/figma-adapter/src/adapter.ts
/**
 * Editor-type discriminator — mirrors `figma.editorType` from the
 * Figma plugin API. Tools that branch on editor (e.g. FigJam-only
 * stickies) use this to short-circuit with `E_FIGMA_EDITOR_TYPE_MISMATCH`
 * before touching the API.
 */
export type EditorType = "figma" | "figjam" | "slides";

/**
 * Subset of `figma.Variable` used by Phase 2/3 tools. Extend as new
 * tools land — keep this surface minimal, not a leaky 1:1 mirror of
 * the plugin types.
 */
export interface Variable {
  readonly id: string;
  readonly name: string;
  readonly resolvedType: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
  readonly valuesByMode: Readonly<Record<string, unknown>>;
}

export interface RectangleNode {
  readonly id: string;
  readonly type: "RECTANGLE";
  readonly width: number;
  readonly height: number;
}

export interface PageSelection {
  readonly nodeIds: readonly string[];
}

/**
 * The Phase 2 surface. Every plugin-side tool handler ultimately
 * depends on this interface — the `RealFigmaAdapter` (lands in
 * Phase 4) calls `figma.*`, and `FigmaFake` (this package's
 * `./testing` export) is purely in-memory.
 */
export interface FigmaAdapter {
  readonly editorType: EditorType;

  getLocalVariablesAsync(): Promise<Variable[]>;

  setValueForMode(args: {
    readonly variableId: string;
    readonly modeId: string;
    readonly value: unknown;
  }): Promise<void>;

  createRectangle(): RectangleNode;

  readonly currentPageSelection: PageSelection;
}
```

**Step 4: Run test to verify it passes**

Run: `bun run --filter @repo/figma-adapter test adapter`
Expected: PASS (5 tests).

**Step 5: Update index.ts**

```ts
// packages/figma-adapter/src/index.ts
/**
 * @repo/figma-adapter — typed seam over the Figma plugin runtime.
 */
export type {
  FigmaAdapter,
  EditorType,
  Variable,
  RectangleNode,
  PageSelection,
} from "./adapter";
```

**Step 6: Commit**

```bash
git add packages/figma-adapter/src/adapter.ts packages/figma-adapter/src/__tests__/adapter.test.ts packages/figma-adapter/src/index.ts
git commit -m "feat(figma-adapter): add FigmaAdapter type contract"
```

---

## Task 2.11: Implement `FigmaFake` (TDD)

**Goal:** Fully in-memory `FigmaAdapter` for testing. Behaves correctly enough that downstream packs can write their handler tests against it without ever touching the real plugin runtime.

**Files:**
- Create: `packages/figma-adapter/src/figma-fake.ts`
- Create: `packages/figma-adapter/src/__tests__/figma-fake.test.ts`

**Step 1: Write the failing tests**

```ts
// packages/figma-adapter/src/__tests__/figma-fake.test.ts
import { describe, expect, it } from "vitest";
import { FigmaFake } from "../figma-fake";

describe("FigmaFake.getLocalVariablesAsync", () => {
  it("returns an empty array on a fresh instance", async () => {
    const fake = new FigmaFake();
    expect(await fake.getLocalVariablesAsync()).toEqual([]);
  });

  it("returns variables seeded via __seedVariables", async () => {
    const fake = new FigmaFake();
    fake.__seedVariables([
      {
        id: "v1",
        name: "color/red",
        resolvedType: "COLOR",
        valuesByMode: { mode1: "#ff0000" },
      },
    ]);
    const result = await fake.getLocalVariablesAsync();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("v1");
  });
});

describe("FigmaFake.setValueForMode", () => {
  it("mutates the value at the given mode", async () => {
    const fake = new FigmaFake();
    fake.__seedVariables([
      {
        id: "v1",
        name: "color/red",
        resolvedType: "COLOR",
        valuesByMode: { mode1: "#ff0000" },
      },
    ]);
    await fake.setValueForMode({
      variableId: "v1",
      modeId: "mode1",
      value: "#aa0000",
    });
    const [v] = await fake.getLocalVariablesAsync();
    expect(v.valuesByMode.mode1).toBe("#aa0000");
  });

  it("rejects when the variable does not exist", async () => {
    const fake = new FigmaFake();
    await expect(
      fake.setValueForMode({ variableId: "missing", modeId: "mode1", value: 0 }),
    ).rejects.toThrow(/not found/i);
  });

  it("creates a new mode entry on a known variable", async () => {
    const fake = new FigmaFake();
    fake.__seedVariables([
      {
        id: "v1",
        name: "x",
        resolvedType: "FLOAT",
        valuesByMode: { mode1: 1 },
      },
    ]);
    await fake.setValueForMode({ variableId: "v1", modeId: "mode2", value: 2 });
    const [v] = await fake.getLocalVariablesAsync();
    expect(v.valuesByMode).toEqual({ mode1: 1, mode2: 2 });
  });
});

describe("FigmaFake.createRectangle", () => {
  it("returns a node with a unique id and the RECTANGLE type", () => {
    const fake = new FigmaFake();
    const a = fake.createRectangle();
    const b = fake.createRectangle();
    expect(a.type).toBe("RECTANGLE");
    expect(a.id).not.toBe(b.id);
  });

  it("appears in currentPageSelection only when explicitly selected", () => {
    const fake = new FigmaFake();
    const node = fake.createRectangle();
    expect(fake.currentPageSelection.nodeIds).toEqual([]);
    fake.__select([node.id]);
    expect(fake.currentPageSelection.nodeIds).toEqual([node.id]);
  });
});

describe("FigmaFake editor type", () => {
  it("defaults to figma", () => {
    expect(new FigmaFake().editorType).toBe("figma");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run --filter @repo/figma-adapter test figma-fake`
Expected: FAIL with `Cannot find module "../figma-fake"`.

**Step 3: Write the implementation**

```ts
// packages/figma-adapter/src/figma-fake.ts
import type {
  EditorType,
  FigmaAdapter,
  PageSelection,
  RectangleNode,
  Variable,
} from "./adapter";

interface MutableVariable {
  id: string;
  name: string;
  resolvedType: Variable["resolvedType"];
  valuesByMode: Record<string, unknown>;
}

/**
 * In-memory FigmaAdapter implementation for tests. Methods prefixed
 * with `__` are seeding hooks for tests; production code never calls
 * them.
 */
export class FigmaFake implements FigmaAdapter {
  private _editorType: EditorType = "figma";
  private readonly variables = new Map<string, MutableVariable>();
  private readonly nodes = new Map<string, RectangleNode>();
  private selection: readonly string[] = [];
  private nodeCounter = 0;

  get editorType(): EditorType {
    return this._editorType;
  }

  async getLocalVariablesAsync(): Promise<Variable[]> {
    return Array.from(this.variables.values()).map((v) => ({
      id: v.id,
      name: v.name,
      resolvedType: v.resolvedType,
      valuesByMode: { ...v.valuesByMode },
    }));
  }

  async setValueForMode(args: {
    variableId: string;
    modeId: string;
    value: unknown;
  }): Promise<void> {
    const v = this.variables.get(args.variableId);
    if (!v) throw new Error(`variable not found: ${args.variableId}`);
    v.valuesByMode[args.modeId] = args.value;
  }

  createRectangle(): RectangleNode {
    const id = `r${++this.nodeCounter}`;
    const node: RectangleNode = { id, type: "RECTANGLE", width: 100, height: 100 };
    this.nodes.set(id, node);
    return node;
  }

  get currentPageSelection(): PageSelection {
    return { nodeIds: [...this.selection] };
  }

  // ---- Test seeding API ----

  __seedVariables(variables: readonly Variable[]): void {
    for (const v of variables) {
      this.variables.set(v.id, {
        id: v.id,
        name: v.name,
        resolvedType: v.resolvedType,
        valuesByMode: { ...v.valuesByMode },
      });
    }
  }

  __select(nodeIds: readonly string[]): void {
    this.selection = [...nodeIds];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun run --filter @repo/figma-adapter test figma-fake`
Expected: PASS (8 tests).

**Step 5: Wire `testing.ts`**

```ts
// packages/figma-adapter/src/testing.ts
export { FigmaFake } from "./figma-fake";
```

**Step 6: Commit**

```bash
git add packages/figma-adapter/src/figma-fake.ts packages/figma-adapter/src/__tests__/figma-fake.test.ts packages/figma-adapter/src/testing.ts
git commit -m "feat(figma-adapter): add in-memory FigmaFake test double"
```

---

## Task 2.12: `editorType` switch on `FigmaFake` (TDD)

**Files:**
- Modify: `packages/figma-adapter/src/figma-fake.ts`
- Modify: `packages/figma-adapter/src/__tests__/figma-fake.test.ts`

**Step 1: Add the failing test**

Append to `figma-fake.test.ts`:

```ts
describe("FigmaFake.__setEditorType", () => {
  it("switches editorType after construction", () => {
    const fake = new FigmaFake();
    fake.__setEditorType("figjam");
    expect(fake.editorType).toBe("figjam");
    fake.__setEditorType("slides");
    expect(fake.editorType).toBe("slides");
  });

  it("accepts editorType in the constructor", () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    expect(fake.editorType).toBe("figjam");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run --filter @repo/figma-adapter test figma-fake`
Expected: FAIL — `__setEditorType` doesn't exist; constructor doesn't accept options.

**Step 3: Update the implementation**

In `figma-fake.ts`, replace the class declaration with:

```ts
export interface FigmaFakeOptions {
  readonly editorType?: EditorType;
}

export class FigmaFake implements FigmaAdapter {
  private _editorType: EditorType;
  private readonly variables = new Map<string, MutableVariable>();
  private readonly nodes = new Map<string, RectangleNode>();
  private selection: readonly string[] = [];
  private nodeCounter = 0;

  constructor(options: FigmaFakeOptions = {}) {
    this._editorType = options.editorType ?? "figma";
  }

  // ... existing members unchanged ...

  __setEditorType(type: EditorType): void {
    this._editorType = type;
  }
}
```

Also export `FigmaFakeOptions` from `testing.ts`:

```ts
export { FigmaFake, type FigmaFakeOptions } from "./figma-fake";
```

**Step 4: Run tests**

Run: `bun run --filter @repo/figma-adapter test`
Expected: PASS (10 tests total).

**Step 5: Commit**

```bash
git add packages/figma-adapter/src/figma-fake.ts packages/figma-adapter/src/__tests__/figma-fake.test.ts packages/figma-adapter/src/testing.ts
git commit -m "feat(figma-adapter): add editorType switch to FigmaFake"
```

---

## Task 2.13: Replace `FigmaAdapterPlaceholder` in `@repo/protocol`

**Goal:** Wire the real `FigmaAdapter` type into `@repo/protocol/tools.ts`. Type-only import, so the runtime dependency direction stays one-way and there's no bundling impact.

**Files:**
- Modify: `packages/protocol/package.json`
- Modify: `packages/protocol/src/tools.ts`
- Modify: `packages/protocol/src/__tests__/tools.test.ts` (only if a test asserts the placeholder name)

**Step 1: Add `@repo/figma-adapter` to the protocol package**

Edit `packages/protocol/package.json` — add the dependency:

```json
"dependencies": {
  "@repo/figma-adapter": "workspace:*",
  "zod": "^3.23.8"
}
```

Run: `bun install`

**Step 2: Update the failing test**

Look for any test in `packages/protocol/src/__tests__/tools.test.ts` that mentions `FigmaAdapterPlaceholder` directly. If found, update it to assert against the real `FigmaAdapter` import:

```ts
import type { FigmaAdapter } from "@repo/figma-adapter";
import { expectTypeOf } from "vitest";
import type { PluginHandlerContext } from "../tools";

it("PluginHandlerContext.figma is a FigmaAdapter", () => {
  expectTypeOf<PluginHandlerContext["figma"]>().toEqualTypeOf<FigmaAdapter>();
});
```

If the existing tests don't reference the placeholder by name, just add the new assertion above to the existing `describe("Pack interface", ...)` block — it's a stronger contract.

**Step 3: Run test to verify the new assertion fails**

Run: `bun run --filter @repo/protocol test tools`
Expected: FAIL — `PluginHandlerContext["figma"]` is `FigmaAdapterPlaceholder`, not `FigmaAdapter`.

**Step 4: Update `tools.ts`**

Replace:

```ts
export interface FigmaAdapterPlaceholder {
  readonly [method: string]: (...args: readonly unknown[]) => Promise<unknown>;
}

export type PluginHandlerContext = {
  readonly logger: Logger;
  readonly figma: FigmaAdapterPlaceholder;
};
```

With:

```ts
import type { FigmaAdapter } from "@repo/figma-adapter";

export type PluginHandlerContext = {
  readonly logger: Logger;
  readonly figma: FigmaAdapter;
};
```

Delete the entire `FigmaAdapterPlaceholder` interface and the long JSDoc disclaimer above it.

**Step 5: Update protocol's index.ts**

Remove the "FigmaAdapter (Phase 2's …)" line from the out-of-scope list at the top of `packages/protocol/src/index.ts` since that seam now exists.

**Step 6: Run tests + types + lint**

Run: `bun run --filter @repo/protocol test`
Expected: PASS (all tests, including the new contract assertion).

Run: `bun run --filter @repo/protocol types`
Expected: PASS.

Run: `bun run --filter @repo/protocol lint`
Expected: PASS.

Run: `bun run test`
Expected: PASS across the whole monorepo.

**Step 7: Commit**

```bash
git add packages/protocol/package.json packages/protocol/src/tools.ts packages/protocol/src/index.ts packages/protocol/src/__tests__/tools.test.ts bun.lock
git commit -m "refactor(protocol): replace FigmaAdapterPlaceholder with real FigmaAdapter

Now that @repo/figma-adapter exists (Phase 2), @repo/protocol's
PluginHandlerContext can hold a typed FigmaAdapter instead of the
placeholder index-signature. Type-only import keeps the dependency
direction one-way and adds no runtime cost."
```

---

## Task 2.14: Coverage gate + changeset + Phase 2 acceptance

**Files:**
- Create: `.changeset/phase-2-transport-and-figma-adapter.md`

**Step 1: Run full test suite with coverage on both new packages**

Run: `bun run --filter @repo/transport test --coverage`
Expected: PASS with ≥90% lines/branches/functions.

Run: `bun run --filter @repo/figma-adapter test --coverage`
Expected: PASS with ≥90% lines/branches/functions.

If either falls short, add a targeted test rather than dropping the threshold.

**Step 2: Run root tasks**

Run: `bun run lint`
Run: `bun run types`
Run: `bun run test`
Expected: all pass.

**Step 3: Verify the placeholder is gone**

Run: `rg "FigmaAdapterPlaceholder"`
Expected: zero matches anywhere.

Run: `rg "FigmaAdapter" packages/`
Expected: matches only in `packages/figma-adapter` and `packages/protocol/src/tools.ts`.

**Step 4: Add a changeset**

Run: `bun changeset`
- Pick: minor bump (consistent with Phase 1's record)
- Description: `Phase 2 — transport + figma-adapter packages, FigmaAdapter wired into @repo/protocol/tools.`

Or write the file directly:

```markdown
---
"@repo/transport": minor
"@repo/figma-adapter": minor
"@repo/protocol": minor
---

Phase 2: WebSocket transport (server + client + correlator + reconnect),
FigmaAdapter type contract with FigmaFake test double, and protocol's
PluginHandlerContext now holds a real FigmaAdapter instead of a
placeholder. No published package consumes these yet — all `private: true`.
```

**Step 5: Commit the changeset**

```bash
git add .changeset/phase-2-transport-and-figma-adapter.md
git commit -m "chore(changeset): record Phase 2 transport and figma-adapter"
```

**Step 6: Final acceptance pass**

Run: `bun run lint && bun run types && bun run test`
Expected: green across the workspace.

```bash
git log --oneline | head -20
```

Spot-check that Phase 2 commits read cleanly: scaffold → contract → impls → property tests → coverage → adapter scaffold → adapter contract → fake → editor switch → placeholder removal → changeset.

**Phase 2 done.** Two new packages, full TDD coverage, the protocol's `FigmaAdapterPlaceholder` seam is closed, and the foundation for Phase 3's daemon + canonical feature pack is in place.

---

## Notes on Execution

**TDD discipline:** every task follows red → green → commit. No skipping the red step "to save time" — the red verifies the test actually exercises the code.

**Commit hygiene:** one task = one commit. `git add` specific files, never `git add -A`.

**WS test flake:** the WebSocket tests use `waitFor` polling rather than fixed `setTimeout`. If a test flakes in CI, raise the polling timeout — never paper over with `setTimeout(resolve, 200)`.

**Coverage exclusions:** `src/testing.ts` is excluded in `@repo/transport` (it's a public test double with no production codepath), but **included** in `@repo/figma-adapter` (the fake *is* the production behaviour for that package).

**Out-of-scope reminders for this phase:**
- No `RealFigmaAdapter` — that lands with `apps/bridge-plugin` in Phase 4.
- No daemon/IPC — Phase 3.
- No MCP SDK glue — Phase 3.
- No relay — Phase 6.
- Don't add tools to `@repo/figma-adapter` beyond the five Phase 2 acceptance points; extending the surface is mechanical and lands per-pack later.

**Per-phase planning reminder:** before executing Phase 3 (daemon + canonical feature pack), create `docs/plans/YYYY-MM-DD-figma-mcp-phase-3.md` using superpowers:writing-plans with the same TDD task structure.

---

## References

- Predecessor plan: `docs/plans/2026-05-06-figma-mcp-rewrite-plan.md` (Phase 1 + Phase 2–9 sketches)
- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md`
- `@repo/protocol` source: `packages/protocol/src/`
- [`ws` library docs](https://github.com/websockets/ws)
- [`fast-check` docs](https://fast-check.dev/)
- MCP TypeScript SDK (Phase 3+): https://github.com/modelcontextprotocol/typescript-sdk
