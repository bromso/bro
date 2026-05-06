# Figma MCP Phase 6 — Cloud Relay + Streamable HTTP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `apps/relay` — a Cloudflare Worker + Durable Object that pairs an AI client (over Streamable HTTP) with a Figma plugin (over WSS) using a 6-digit pairing code, then routes envelopes between them via the WebSocket Hibernation API. Includes Miniflare 4 tests for the pairing flow, message routing, hibernation/restore, and code expiry.

**Architecture:** One Worker, one DO class (`RelayDurableObject`), one DO instance per pairing session. AI clients POST a JSON-RPC request to `https://relay/mcp/{sessionId}` and read responses + notifications back as Server-Sent Events (SSE) over the same response. Plugins open a WSS to `wss://relay/pair?code={code}` which upgrades and is attached to the matching DO. The DO uses `state.acceptWebSocket(ws)` (Hibernation API) so it can hibernate when idle and survive Cloudflare's eviction window. State is persisted via `state.storage.put` (pairing code, expiry) and via `ws.serializeAttachment` (per-connection metadata). Pure pass-through routing — no protocol/schema knowledge beyond delivering envelopes verbatim. The relay does NOT validate Zod envelopes or implement business logic; that stays in `@repo/protocol` consumed by daemon and plugin.

**Tech Stack:** TypeScript, Bun, Vitest 4.1.4 with Miniflare 4 (`@cloudflare/vitest-pool-workers`), Wrangler 3.x, Cloudflare Workers + Durable Objects (Hibernation API). No Node-specific code on the relay side.

**Predecessors:** Phases 1–5 are merged. `@repo/protocol` defines the wire envelopes the relay forwards. `@repo/transport` defines the WS framing the plugin uses to talk to the relay. The relay does NOT depend on `@repo/protocol` at runtime — it forwards bytes — but it DOES import the types in tests to assert envelope shapes round-trip cleanly.

---

## Out of scope (call-out so the executor doesn't drift)

- **Setup CLI integration (`figma-mcp setup --cloud`)** — Phase 7's territory.
- **AI-side Streamable HTTP client transport** — the relay tests use plain `fetch` with SSE parsing. The MCP SDK's Streamable HTTP client transport gets wired in Phase 7.
- **Multiple shims per session** — Phase 6 supports one AI connection + one plugin connection per DO. Multi-AI-client coordination over relay (analog to the daemon's multi-shim) is a Phase 8+ enhancement.
- **Production deployment** — the relay runs in Miniflare for tests. Manual deploy to a staging Cloudflare account happens in Phase 9.
- **Auth beyond pairing codes** — anyone who knows the session id can connect. That's the design (short-lived codes + ephemeral session ids); productionizing access control is post-v1.
- **Bridge plugin's `allowedDomains` update for cloud** — the plugin manifest lists `wss://*.our-relay-domain.com` as a placeholder; pinning a real domain is Phase 9.

---

## Acceptance Criteria

- `apps/relay` exists, builds, lints clean, types clean.
- `bun run --filter @repo/relay test` runs Miniflare-backed tests; coverage ≥80/75/80/80 on the relay app.
- POST `/pair` returns `{ code, sessionId, expiresAt }` with a 6-digit numeric `code` and a unique `sessionId`. Multiple calls return distinct codes/sessions.
- The pairing code is valid for **5 minutes** (configurable via env var `PAIRING_CODE_TTL_MS`, default 300_000). Expired codes return 410 Gone with `{ error: "E_RELAY_PAIRING_EXPIRED" }`.
- A pairing code is **single-use** — a successful plugin connect retires it. A second connect with the same code returns 410 Gone.
- WSS `/pair?code={code}` upgrades and attaches the WS to the DO via `state.acceptWebSocket`. Without a valid code → 401 Unauthorized.
- POST `/mcp/{sessionId}` accepts a JSON-RPC body (or batch), forwards it to the plugin over the DO's WS, and streams back any response/notification frames the plugin emits as SSE events on the same response. The response stays open until the matching JSON-RPC response arrives or a configurable timeout (`RPC_TIMEOUT_MS`, default 30_000) elapses.
- DO hibernates after 60 s of inactivity (Hibernation API default for paid plans; Miniflare simulates this). State survives via `serializeAttachment`. After restore, message routing continues.
- `accept()` is called with `{ allowHalfOpen: true }` per design doc.
- Six categorized error codes from `@repo/protocol`'s `E_RELAY_*` are surfaced where appropriate (`E_RELAY_PAIRING_EXPIRED`, `E_RELAY_SESSION_NOT_FOUND`).
- A changeset records Phase 6.
- Commit hygiene: each task ends with one conventional-commit-formatted commit. No multi-task commits, no `git add -A`.

---

## Task Map

| # | Task | Package / App | Type |
|---|------|---------------|------|
| 6.1 | Scaffold `apps/relay` (Wrangler + vitest-pool-workers) | relay | infra |
| 6.2 | Pairing code generator + TTL store (TDD; pure logic) | relay | code |
| 6.3 | `RelayDurableObject` skeleton (constructor, alarm, basic state) | relay | code |
| 6.4 | POST `/pair` Worker handler + DO seeding | relay | code |
| 6.5 | WSS `/pair?code=...` plugin connect handler | relay | code |
| 6.6 | DO Hibernation API integration (`state.acceptWebSocket`, `webSocketMessage`/`Close`/`Error`) | relay | code |
| 6.7 | POST `/mcp/{sessionId}` AI Streamable HTTP endpoint | relay | code |
| 6.8 | Bidirectional envelope routing (AI ↔ plugin) | relay | code |
| 6.9 | Hibernation persistence — `serializeAttachment` state + restore tests | relay | code/tests |
| 6.10 | End-to-end pairing test (Miniflare): pair → plugin connect → AI request flows through | relay | tests |
| 6.11 | Error-path tests: expired code, double-use, unknown session, plugin disconnect mid-request | relay | tests |
| 6.12 | Coverage gate + Phase 6 changeset + acceptance | repo | infra |

---

## Task 6.1: Scaffold `apps/relay`

**Files:**
- Create: `apps/relay/package.json`
- Create: `apps/relay/tsconfig.json`
- Create: `apps/relay/wrangler.toml`
- Create: `apps/relay/vitest.config.ts`
- Create: `apps/relay/src/index.ts` (Worker entry stub)
- Create: `apps/relay/src/__tests__/.gitkeep` (so the test dir exists for vitest's include glob)

**Step 1: `package.json`**

```json
{
  "name": "@repo/relay",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "types": "tsc --noEmit",
    "lint": "biome check .",
    "deploy": "wrangler deploy"
  },
  "dependencies": {},
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "@cloudflare/workers-types": "^4.20240620.0",
    "@vitest/coverage-v8": "4.1.4",
    "typescript": "^6.0.0",
    "vitest": "4.1.4",
    "wrangler": "^3.78.0"
  }
}
```

> **Version pins:** Wrangler 3.x is current (4.x exists at execution time but 3.x is the most-tested with the Vitest pool). Confirm at execution and adjust if 4.x is the modern stable.

**Step 2: `tsconfig.json`** — Workers-aware:

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
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types/2024-12-30"]
  },
  "include": ["src/**/*.ts"]
}
```

> The dated `@cloudflare/workers-types/2024-12-30` import gives the `compatibility_date`-aligned type set. Adjust to the date pinned in `wrangler.toml`.

**Step 3: `wrangler.toml`**

```toml
name = "figma-mcp-relay"
main = "src/index.ts"
compatibility_date = "2024-12-30"
compatibility_flags = ["nodejs_compat"]

[[durable_objects.bindings]]
name = "RELAY"
class_name = "RelayDurableObject"

[[migrations]]
tag = "v1"
new_classes = ["RelayDurableObject"]

[vars]
PAIRING_CODE_TTL_MS = "300000"
RPC_TIMEOUT_MS = "30000"
```

> `nodejs_compat` is needed for `Buffer`/`crypto` if used. Drop it if unused. The DO migration tag is required for any DO class deploy.

**Step 4: `vitest.config.ts`**

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Hibernation API requires DO bindings; Miniflare picks them up from wrangler.toml.
        },
      },
    },
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**"],
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

> Note: this uses `defineWorkersConfig` from the Workers vitest pool — NOT `defineConfig` from `vitest/config`. The pool runs tests INSIDE the Workers runtime via Miniflare so DO bindings + Hibernation work as in production.

**Step 5: `src/index.ts`** (Worker entry stub)

```ts
/**
 * Figma MCP cloud relay — Cloudflare Worker + Durable Object.
 *
 * Routes:
 *   POST /pair                  → create a pairing session (Task 6.4)
 *   WSS  /pair?code={code}      → plugin connect (Task 6.5)
 *   POST /mcp/{sessionId}       → AI Streamable HTTP (Task 6.7)
 */

export interface Env {
  RELAY: DurableObjectNamespace;
  PAIRING_CODE_TTL_MS: string;
  RPC_TIMEOUT_MS: string;
}

export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response("relay scaffold", { status: 200 });
  },
};

// DO class lands in Task 6.3.
export class RelayDurableObject {
  constructor(_state: DurableObjectState, _env: Env) {}
  async fetch(_request: Request): Promise<Response> {
    return new Response("DO scaffold", { status: 200 });
  }
}
```

**Step 6: Verify**

```bash
bun install
bun run --filter @repo/relay lint
bun run --filter @repo/relay types
bun run --filter @repo/relay test
```

All exit 0.

**Step 7: Commit**

```bash
git add apps/relay bun.lock
git commit -m "feat(relay): scaffold apps/relay with Wrangler + Miniflare 4"
```

---

## Task 6.2: Pairing code generator + TTL store (TDD)

**Goal:** Pure logic unit-testable without Workers runtime. A 6-digit numeric code is generated using `crypto.getRandomValues` (Workers global), stored alongside `expiresAt`, `consumed: boolean`. Methods: `generate()`, `validate(code)`, `consume(code)`.

**Files:**
- Create: `apps/relay/src/pairing.ts`
- Create: `apps/relay/src/__tests__/pairing.test.ts`

**Step 1: Failing tests**

```ts
// apps/relay/src/__tests__/pairing.test.ts
import { describe, expect, it, vi } from "vitest";
import { PairingCodeStore } from "../pairing";

describe("PairingCodeStore.generate", () => {
  it("returns a 6-digit code", () => {
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => 0 });
    const { code } = store.generate("ses_a");
    expect(code).toMatch(/^\d{6}$/);
  });

  it("each call returns a distinct code", () => {
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => 0 });
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) codes.add(store.generate(`ses_${i}`).code);
    expect(codes.size).toBeGreaterThan(80); // 6-digit space is 1M, low collisions expected
  });

  it("returns expiresAt = now + ttl", () => {
    const store = new PairingCodeStore({ ttlMs: 30_000, now: () => 1_000 });
    const { expiresAt } = store.generate("ses_a");
    expect(expiresAt).toBe(31_000);
  });
});

describe("PairingCodeStore.validate", () => {
  it("returns the sessionId for a valid code", () => {
    let t = 0;
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => t });
    const { code } = store.generate("ses_a");
    expect(store.validate(code)).toEqual({ sessionId: "ses_a", consumed: false });
  });

  it("returns null for an unknown code", () => {
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => 0 });
    expect(store.validate("000000")).toBeNull();
  });

  it("returns null for an expired code", () => {
    let t = 0;
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => t });
    const { code } = store.generate("ses_a");
    t = 60_001;
    expect(store.validate(code)).toBeNull();
  });
});

describe("PairingCodeStore.consume", () => {
  it("returns the sessionId on first call", () => {
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => 0 });
    const { code } = store.generate("ses_a");
    expect(store.consume(code)).toBe("ses_a");
  });

  it("returns null on the second call (single-use)", () => {
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => 0 });
    const { code } = store.generate("ses_a");
    store.consume(code);
    expect(store.consume(code)).toBeNull();
  });
});
```

Run: `bun run --filter @repo/relay test pairing` → FAIL.

**Step 2: Implement**

```ts
// apps/relay/src/pairing.ts
export interface PairingCodeStoreOptions {
  readonly ttlMs: number;
  readonly now?: () => number;
}

interface Entry {
  sessionId: string;
  expiresAt: number;
  consumed: boolean;
}

export class PairingCodeStore {
  private readonly entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: PairingCodeStoreOptions) {
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? (() => Date.now());
  }

  generate(sessionId: string): { code: string; expiresAt: number } {
    const code = generateSixDigitCode();
    const expiresAt = this.now() + this.ttlMs;
    this.entries.set(code, { sessionId, expiresAt, consumed: false });
    return { code, expiresAt };
  }

  validate(code: string): { sessionId: string; consumed: boolean } | null {
    const entry = this.entries.get(code);
    if (!entry) return null;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(code);
      return null;
    }
    return { sessionId: entry.sessionId, consumed: entry.consumed };
  }

  consume(code: string): string | null {
    const entry = this.entries.get(code);
    if (!entry) return null;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(code);
      return null;
    }
    if (entry.consumed) return null;
    entry.consumed = true;
    return entry.sessionId;
  }
}

function generateSixDigitCode(): string {
  // crypto.getRandomValues exists in the Workers runtime AND Node 19+.
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const n = arr[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}
```

**Step 3: Verify, commit**

`bun run --filter @repo/relay test pairing` → PASS.

```bash
git add apps/relay/src/pairing.ts apps/relay/src/__tests__/pairing.test.ts
git commit -m "feat(relay): pairing code generator + TTL store with single-use semantics"
```

---

## Task 6.3: `RelayDurableObject` skeleton

**Goal:** Class with `constructor(state, env)` that stores `state` and `env`, plus a `fetch(request)` method that routes to internal handlers (`/seed-pair`, `/connect-plugin`, `/mcp`). The seed/connect/mcp handlers are stubs filled in by Tasks 6.4/6.5/6.7.

**Files:**
- Modify: `apps/relay/src/index.ts` (replace the DO stub)
- Create: `apps/relay/src/durable-object.ts`
- Create: `apps/relay/src/__tests__/durable-object.test.ts`

**Step 1: Tests**

```ts
// apps/relay/src/__tests__/durable-object.test.ts
import { describe, expect, it } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    RELAY: DurableObjectNamespace;
  }
}

describe("RelayDurableObject (routing)", () => {
  it("returns 404 for unknown internal paths", async () => {
    const id = env.RELAY.idFromName("test-1");
    const stub = env.RELAY.get(id);
    const response = await stub.fetch("https://relay/__unknown__");
    expect(response.status).toBe(404);
  });
});
```

> The `cloudflare:test` import is the Vitest Workers pool's helper. It exposes `env` (bindings from `wrangler.toml`) and `runInDurableObject` (run a callback inside the DO). See [Cloudflare's vitest pool docs](https://developers.cloudflare.com/workers/testing/vitest-integration/recipes/#durable-objects).

**Step 2: Implement**

```ts
// apps/relay/src/durable-object.ts
export interface Env {
  RELAY: DurableObjectNamespace;
  PAIRING_CODE_TTL_MS: string;
  RPC_TIMEOUT_MS: string;
}

export class RelayDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/seed-pair" && request.method === "POST") {
      return this.handleSeedPair(request);
    }
    if (url.pathname === "/connect-plugin") {
      return this.handleConnectPlugin(request);
    }
    if (url.pathname === "/mcp" && request.method === "POST") {
      return this.handleMcp(request);
    }
    return new Response("not found", { status: 404 });
  }

  private async handleSeedPair(_request: Request): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  }

  private async handleConnectPlugin(_request: Request): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  }

  private async handleMcp(_request: Request): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  }
}
```

In `src/index.ts`, replace the inline DO stub with:

```ts
export { RelayDurableObject } from "./durable-object";
```

**Step 3: Verify, commit**

`bun run --filter @repo/relay test durable-object` → PASS (1 test).

```bash
git add apps/relay/src/durable-object.ts apps/relay/src/index.ts apps/relay/src/__tests__/durable-object.test.ts
git commit -m "feat(relay): RelayDurableObject skeleton with internal routing"
```

---

## Task 6.4: POST `/pair` Worker handler + DO seeding

**Goal:** Worker's top-level `fetch` handler routes `POST /pair` requests by:
1. Generating a fresh `sessionId`.
2. Getting/creating the DO for that sessionId.
3. Calling `stub.fetch(POST /seed-pair)` which returns `{ code, sessionId, expiresAt }`.
4. Returning that JSON to the AI client.

The DO's `/seed-pair` uses `PairingCodeStore` (instance per DO, persisted via `state.storage`).

**Files:**
- Modify: `apps/relay/src/index.ts` (Worker fetch routes `POST /pair`)
- Modify: `apps/relay/src/durable-object.ts` (implement `handleSeedPair`)
- Create: `apps/relay/src/__tests__/pair-endpoint.test.ts`

**Step 1: Tests**

```ts
import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

describe("POST /pair", () => {
  it("returns 6-digit code + sessionId + expiresAt", async () => {
    const response = await SELF.fetch("https://relay/pair", { method: "POST" });
    expect(response.status).toBe(200);
    const body = await response.json<{ code: string; sessionId: string; expiresAt: number }>();
    expect(body.code).toMatch(/^\d{6}$/);
    expect(body.sessionId).toMatch(/^ses_/);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("returns 405 for GET /pair", async () => {
    const response = await SELF.fetch("https://relay/pair", { method: "GET" });
    expect(response.status).toBe(405);
  });

  it("each POST returns a different sessionId", async () => {
    const a = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{ sessionId: string }>();
    const b = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{ sessionId: string }>();
    expect(a.sessionId).not.toBe(b.sessionId);
  });
});
```

> `SELF.fetch` from `cloudflare:test` invokes the Worker as if from outside.

**Step 2: Implement**

`src/index.ts`:

```ts
export interface Env {
  RELAY: DurableObjectNamespace;
  PAIRING_CODE_TTL_MS: string;
  RPC_TIMEOUT_MS: string;
}

export { RelayDurableObject } from "./durable-object";

const newSessionId = (): string =>
  `ses_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/pair") {
      if (request.method !== "POST") {
        return new Response("method not allowed", { status: 405 });
      }
      const sessionId = newSessionId();
      const id = env.RELAY.idFromName(sessionId);
      const stub = env.RELAY.get(id);
      // Forward an internal seed-pair request that the DO will handle.
      return stub.fetch(`https://do/seed-pair?sessionId=${sessionId}`, { method: "POST" });
    }

    return new Response("not found", { status: 404 });
  },
};
```

`src/durable-object.ts` — implement `handleSeedPair`:

```ts
import { PairingCodeStore } from "./pairing";

// ... existing imports ...

export class RelayDurableObject {
  private readonly pairing: PairingCodeStore;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    const ttlMs = Number.parseInt(env.PAIRING_CODE_TTL_MS, 10);
    this.pairing = new PairingCodeStore({ ttlMs });
  }

  // ... existing fetch ...

  private async handleSeedPair(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("missing sessionId", { status: 400 });

    const { code, expiresAt } = this.pairing.generate(sessionId);
    await this.state.storage.put("pairing", {
      code,
      sessionId,
      expiresAt,
      consumed: false,
    });
    return Response.json({ code, sessionId, expiresAt });
  }
}
```

> The DO persists the pairing entry in `state.storage` because `PairingCodeStore`'s in-memory map doesn't survive hibernation. On restore, the DO rehydrates the store from storage in its constructor (Task 6.9).

**Step 3: Verify, commit**

```bash
git add apps/relay/src/index.ts apps/relay/src/durable-object.ts apps/relay/src/__tests__/pair-endpoint.test.ts
git commit -m "feat(relay): POST /pair returns 6-digit code + sessionId"
```

---

## Task 6.5: WSS `/pair?code=...` plugin connect

**Goal:** When a plugin sends `Upgrade: websocket` to `/pair?code={code}`:
1. Worker resolves the code → sessionId via the DO.
2. Worker calls the matching DO with the WS upgrade request.
3. DO accepts the WS via Hibernation API (`state.acceptWebSocket(server, ["plugin"])`), retires the code, and returns the WS to the client.

The DO's plugin-side WS is tagged `["plugin"]` so we can identify it later.

**Files:**
- Modify: `apps/relay/src/index.ts` (route WSS `/pair`)
- Modify: `apps/relay/src/durable-object.ts` (implement `handleConnectPlugin`)
- Create: `apps/relay/src/__tests__/plugin-connect.test.ts`

**Step 1: Tests**

```ts
import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

describe("WSS /pair?code=...", () => {
  it("upgrades when the code is valid", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
      sessionId: string;
    }>();

    const response = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(response.status).toBe(101);
    expect(response.webSocket).toBeDefined();
    response.webSocket?.accept();
    response.webSocket?.close();
  });

  it("returns 401 when the code is unknown", async () => {
    const response = await SELF.fetch("https://relay/pair?code=000000", {
      headers: { Upgrade: "websocket" },
    });
    expect(response.status).toBe(401);
  });

  it("rejects a second connect with the same code (single-use)", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
      sessionId: string;
    }>();

    const a = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(a.status).toBe(101);
    a.webSocket?.accept();
    a.webSocket?.close();

    const b = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(b.status).toBe(401);
  });

  it("returns 426 if the upgrade header is missing", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
    }>();
    const response = await SELF.fetch(`https://relay/pair?code=${pair.code}`);
    expect(response.status).toBe(426);
  });
});
```

> Cloudflare's `Response` shape includes `webSocket?: WebSocket` for upgrade responses. Miniflare 4 supports the same.

**Step 2: Implement**

`src/index.ts` — extend the Worker fetch:

```ts
if (url.pathname === "/pair" && request.method === "GET") {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("upgrade required", { status: 426 });
  }
  const code = url.searchParams.get("code");
  if (!code) return new Response("missing code", { status: 400 });

  // To resolve code → sessionId we need a DO. But we don't know which DO yet
  // because the DO is keyed by sessionId. Solution: a singleton "lookup DO"
  // keyed by a fixed name that owns the code → sessionId mapping. That's a
  // Phase 8 elaboration; for Phase 6 keep the code/session pair in DO storage
  // PER session, and accept the simpler invariant: the AI client passes the
  // sessionId AND code together when the plugin is invited.
  //
  // Per design: the AI client gets {code, sessionId} from POST /pair, then
  // hands the user the code only — the user types it into the plugin. The
  // plugin connects to /pair?code={code}. Without sessionId on the WS URL,
  // the relay needs a global lookup.
  //
  // For Phase 6 we add a global lookup DO (named "lookup") that maps
  // code → sessionId. POST /pair writes to it; WSS /pair reads from it.
  return await routePluginConnect(env, code, request);
}
```

This needs a small lookup DO. Let me restructure:

```ts
// src/index.ts — final shape

export interface Env {
  RELAY: DurableObjectNamespace;
  LOOKUP: DurableObjectNamespace;
  PAIRING_CODE_TTL_MS: string;
  RPC_TIMEOUT_MS: string;
}

export { RelayDurableObject } from "./durable-object";
export { LookupDurableObject } from "./lookup-do";

// ... newSessionId() ...

const lookupId = (env: Env) => env.LOOKUP.idFromName("global");

async function routePluginConnect(env: Env, code: string, request: Request): Promise<Response> {
  // Resolve code → sessionId via global lookup DO.
  const lookup = env.LOOKUP.get(lookupId(env));
  const resolveResp = await lookup.fetch(`https://lookup/resolve?code=${code}`, {
    method: "POST",
  });
  if (!resolveResp.ok) {
    return new Response("invalid code", { status: 401 });
  }
  const { sessionId } = await resolveResp.json<{ sessionId: string }>();
  // Forward the WS upgrade to the session DO.
  const sessionDo = env.RELAY.get(env.RELAY.idFromName(sessionId));
  return sessionDo.fetch(`https://do/connect-plugin?sessionId=${sessionId}`, {
    headers: request.headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/pair") {
      if (request.method === "POST") {
        return await handlePairCreate(env);
      }
      if (request.method === "GET") {
        if (request.headers.get("Upgrade") !== "websocket") {
          return new Response("upgrade required", { status: 426 });
        }
        const code = url.searchParams.get("code");
        if (!code) return new Response("missing code", { status: 400 });
        return await routePluginConnect(env, code, request);
      }
      return new Response("method not allowed", { status: 405 });
    }

    return new Response("not found", { status: 404 });
  },
};

async function handlePairCreate(env: Env): Promise<Response> {
  const sessionId = newSessionId();
  const sessionDo = env.RELAY.get(env.RELAY.idFromName(sessionId));
  const seedResp = await sessionDo.fetch(`https://do/seed-pair?sessionId=${sessionId}`, {
    method: "POST",
  });
  const { code, expiresAt } = await seedResp.json<{ code: string; expiresAt: number }>();

  // Register code → sessionId in the global lookup DO.
  const lookup = env.LOOKUP.get(lookupId(env));
  const ttlMs = Number.parseInt(env.PAIRING_CODE_TTL_MS, 10);
  await lookup.fetch(`https://lookup/register`, {
    method: "POST",
    body: JSON.stringify({ code, sessionId, expiresAt, ttlMs }),
  });

  return Response.json({ code, sessionId, expiresAt });
}
```

`src/lookup-do.ts`:

```ts
import { PairingCodeStore } from "./pairing";

export interface Env {
  PAIRING_CODE_TTL_MS: string;
}

interface LookupEntry {
  sessionId: string;
  expiresAt: number;
  consumed: boolean;
}

export class LookupDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/register" && request.method === "POST") {
      const body = await request.json<{ code: string; sessionId: string; expiresAt: number }>();
      await this.state.storage.put(`code:${body.code}`, {
        sessionId: body.sessionId,
        expiresAt: body.expiresAt,
        consumed: false,
      } satisfies LookupEntry);
      return new Response("ok");
    }
    if (url.pathname === "/resolve" && request.method === "POST") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("missing code", { status: 400 });
      const entry = await this.state.storage.get<LookupEntry>(`code:${code}`);
      if (!entry) return new Response("unknown code", { status: 404 });
      if (Date.now() >= entry.expiresAt) {
        await this.state.storage.delete(`code:${code}`);
        return new Response("expired", { status: 410 });
      }
      if (entry.consumed) return new Response("already used", { status: 410 });
      // Mark consumed (single-use).
      entry.consumed = true;
      await this.state.storage.put(`code:${code}`, entry);
      return Response.json({ sessionId: entry.sessionId });
    }
    return new Response("not found", { status: 404 });
  }
}
```

Update `wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "RELAY"
class_name = "RelayDurableObject"

[[durable_objects.bindings]]
name = "LOOKUP"
class_name = "LookupDurableObject"

[[migrations]]
tag = "v1"
new_classes = ["RelayDurableObject", "LookupDurableObject"]
```

`src/durable-object.ts` — implement `handleConnectPlugin`:

```ts
private pluginWs: WebSocket | null = null;

private async handleConnectPlugin(request: Request): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("upgrade required", { status: 426 });
  }
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) return new Response("missing sessionId", { status: 400 });

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  // Hibernation API: register the WS so the runtime can hibernate the DO.
  this.state.acceptWebSocket(server, ["plugin", sessionId]);
  // Per design doc: allowHalfOpen for the web_socket_auto_reply_to_close flag.
  // Note: the option is on accept() in some SDK versions; check Cloudflare
  // docs for the current shape.
  this.pluginWs = server;

  return new Response(null, { status: 101, webSocket: client });
}
```

> `acceptWebSocket(server, tags?)` is the Hibernation API. The `tags` array lets us look up the WS later via `state.getWebSockets("plugin")`.

**Step 3: Verify, commit**

```bash
git add apps/relay/src/index.ts apps/relay/src/durable-object.ts apps/relay/src/lookup-do.ts apps/relay/src/__tests__/plugin-connect.test.ts apps/relay/wrangler.toml
git commit -m "feat(relay): WSS /pair?code=... upgrades plugin into DO via Hibernation API"
```

---

## Task 6.6: DO Hibernation API integration

**Goal:** Wire the four hibernation-aware DO methods: `webSocketMessage(ws, message)`, `webSocketClose(ws, code, reason, wasClean)`, `webSocketError(ws, error)`, `webSocketAttach(ws, attachment)` (the last is implicit via `acceptWebSocket`'s tag handling).

**Files:**
- Modify: `apps/relay/src/durable-object.ts`
- Create: `apps/relay/src/__tests__/hibernation.test.ts`

**Step 1: Tests**

```ts
import { describe, expect, it } from "vitest";
import { SELF, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";

describe("Hibernation lifecycle", () => {
  it("a message from the plugin reaches webSocketMessage", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
      sessionId: string;
    }>();
    const upgrade = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    upgrade.webSocket?.accept();
    upgrade.webSocket?.send("hello");

    // Drive into the DO to assert it received the message via Hibernation API.
    // The Workers vitest pool exposes runInDurableObject for this.
    // ...
  });
});
```

> The exact assertion mechanism depends on the Workers vitest pool API. Read [Cloudflare's docs](https://developers.cloudflare.com/workers/testing/vitest-integration/recipes/#testing-durable-objects-with-websockets) for the shape. If the pool doesn't expose introspection, assert externally via the message-routing test in Task 6.10.

**Step 2: Implement** — add hibernation handlers to `RelayDurableObject`:

```ts
async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
  // Identify the WS by its tags so we know which side sent the message.
  const tags = this.state.getTags(ws);
  if (tags.includes("plugin")) {
    await this.routePluginMessage(typeof message === "string" ? message : new TextDecoder().decode(message));
  } else if (tags.includes("ai")) {
    await this.routeAiMessage(typeof message === "string" ? message : new TextDecoder().decode(message));
  }
}

async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
  const tags = this.state.getTags(ws);
  if (tags.includes("plugin")) {
    this.pluginWs = null;
  }
}

async webSocketError(_ws: WebSocket, _error: Error): Promise<void> {
  // Best-effort logging. State will be cleaned up by webSocketClose.
}

private async routePluginMessage(payload: string): Promise<void> {
  // Forward to the AI side. Implemented in Task 6.8.
}

private async routeAiMessage(payload: string): Promise<void> {
  // Forward to the plugin. Implemented in Task 6.8.
}
```

> `state.getTags(ws)` returns the array passed to `acceptWebSocket`. After hibernation/restore, tags survive — that's how we identify connections.

**Step 3: Commit**

```bash
git add apps/relay/src/durable-object.ts apps/relay/src/__tests__/hibernation.test.ts
git commit -m "feat(relay): wire Hibernation API handlers (webSocketMessage/Close/Error)"
```

---

## Task 6.7: POST `/mcp/{sessionId}` AI Streamable HTTP endpoint

**Goal:** Accept an MCP JSON-RPC request from the AI client. Forward it to the plugin over the DO's WS. Stream responses + notifications back as SSE events on the same response. Close the SSE stream when the matching JSON-RPC response arrives or `RPC_TIMEOUT_MS` elapses.

**Files:**
- Modify: `apps/relay/src/index.ts`
- Modify: `apps/relay/src/durable-object.ts`
- Create: `apps/relay/src/__tests__/mcp-endpoint.test.ts`

**Step 1: Tests**

```ts
import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

describe("POST /mcp/{sessionId}", () => {
  it("returns 404 for an unknown sessionId", async () => {
    const response = await SELF.fetch("https://relay/mcp/ses_unknown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns 503 when no plugin is connected", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{ sessionId: string }>();
    const response = await SELF.fetch(`https://relay/mcp/${pair.sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ error: "E_RELAY_PLUGIN_NOT_CONNECTED" });
  });

  // Round-trip happy-path is covered by the e2e test in Task 6.10.
});
```

**Step 2: Worker route** in `src/index.ts`:

```ts
const mcpMatch = url.pathname.match(/^\/mcp\/(ses_[a-z0-9]+)$/);
if (mcpMatch) {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const sessionId = mcpMatch[1];
  const id = env.RELAY.idFromName(sessionId);
  const stub = env.RELAY.get(id);
  return stub.fetch(`https://do/mcp?sessionId=${sessionId}`, {
    method: "POST",
    headers: request.headers,
    body: await request.text(),
  });
}
```

**Step 3: DO `handleMcp`** — full SSE streaming:

```ts
private async handleMcp(request: Request): Promise<Response> {
  if (!this.pluginWs) {
    return Response.json(
      { error: "E_RELAY_PLUGIN_NOT_CONNECTED" },
      { status: 503 },
    );
  }
  const body = await request.json<{ jsonrpc: "2.0"; id: number | string; method: string; params?: unknown }>();

  // Open an SSE response stream.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Track pending requests by id. When the matching response arrives over the
  // plugin WS, write it to the SSE stream and close.
  this.pendingAiRequests.set(String(body.id), writer);

  // Forward to the plugin.
  this.pluginWs.send(JSON.stringify(body));

  // Timeout safety.
  const timeoutMs = Number.parseInt(this.env.RPC_TIMEOUT_MS, 10);
  setTimeout(async () => {
    const pending = this.pendingAiRequests.get(String(body.id));
    if (pending) {
      await pending.write(
        new TextEncoder().encode(
          `event: error\ndata: ${JSON.stringify({ error: "E_RELAY_TIMEOUT" })}\n\n`,
        ),
      );
      await pending.close();
      this.pendingAiRequests.delete(String(body.id));
    }
  }, timeoutMs);

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

Add field at the top of the class:

```ts
private readonly pendingAiRequests = new Map<string, WritableStreamDefaultWriter<Uint8Array>>();
```

> The pending map MUST live in memory — it doesn't survive hibernation, but that's fine because the SSE stream itself doesn't survive hibernation either. If hibernation evicts the DO mid-request, the AI client sees a network error and retries.

**Step 4: Commit**

```bash
git add apps/relay/src/index.ts apps/relay/src/durable-object.ts apps/relay/src/__tests__/mcp-endpoint.test.ts
git commit -m "feat(relay): POST /mcp/{sessionId} forwards to plugin and streams SSE response"
```

---

## Task 6.8: Bidirectional envelope routing

**Goal:** The DO connects the two sides:

- **AI → plugin**: `handleMcp` already forwards the JSON-RPC request to `pluginWs.send(...)`.
- **Plugin → AI**: when the plugin sends a message, `webSocketMessage(ws, message)` runs. The message is a JSON-RPC response or notification. Find the matching pending writer by `id` (or treat unmatched as a server-to-client notification — write to ALL active pending streams or to a shared notification stream).

For Phase 6 simplification: the AI side issues one request at a time (request/response), and the relay holds at most one open SSE per session. A response with id matches the pending writer; notifications are broadcast to the pending writer if any.

**Files:**
- Modify: `apps/relay/src/durable-object.ts`
- Create: `apps/relay/src/__tests__/routing.test.ts`

**Step 1: Implement `routePluginMessage`**

```ts
private async routePluginMessage(payload: string): Promise<void> {
  let parsed: { id?: string | number; method?: string };
  try {
    parsed = JSON.parse(payload);
  } catch {
    return; // Drop malformed
  }

  // Identify request id (responses) or stream all if it's a notification.
  const id = parsed.id !== undefined ? String(parsed.id) : null;
  const isNotification = parsed.method !== undefined && id === null;

  const writers: WritableStreamDefaultWriter<Uint8Array>[] = id
    ? this.pendingAiRequests.has(id)
      ? [this.pendingAiRequests.get(id)!]
      : []
    : Array.from(this.pendingAiRequests.values()); // notifications → all open AI streams

  const sseFrame = `data: ${payload}\n\n`;
  const bytes = new TextEncoder().encode(sseFrame);

  for (const w of writers) {
    try {
      await w.write(bytes);
    } catch {
      // Stream may have been aborted by the AI client.
    }
  }

  // If the message was a response (id present), close the matching SSE.
  if (id && this.pendingAiRequests.has(id) && !isNotification) {
    const w = this.pendingAiRequests.get(id)!;
    await w.close().catch(() => {});
    this.pendingAiRequests.delete(id);
  }
}
```

**Step 2: routing test** — happy path: plugin connects, AI POSTs a request, plugin echoes back a response, AI's SSE receives it.

The full e2e test is Task 6.10. Use a smaller test here for the routing logic in isolation.

**Step 3: Commit**

```bash
git add apps/relay/src/durable-object.ts apps/relay/src/__tests__/routing.test.ts
git commit -m "feat(relay): route plugin → AI messages to pending SSE streams"
```

---

## Task 6.9: Hibernation persistence + restore tests

**Goal:** Confirm the DO can hibernate and restore correctly. Per Hibernation API:
- Connections accepted via `state.acceptWebSocket(...)` survive hibernation (Cloudflare manages the socket).
- Tags assigned via `acceptWebSocket(ws, tags)` survive.
- DO instance is reconstructed from scratch on the next message — `constructor` runs, state is rehydrated from `state.storage`, but in-memory fields (like `pendingAiRequests`) are reset.
- Use `ws.serializeAttachment(value)` to persist per-WS metadata that survives hibernation.

**Files:**
- Modify: `apps/relay/src/durable-object.ts` (set `serializeAttachment` on plugin WS; rehydrate state in constructor)
- Create: `apps/relay/src/__tests__/hibernation-restore.test.ts`

**Step 1: In `handleConnectPlugin`**, after `acceptWebSocket`:

```ts
server.serializeAttachment({ sessionId, attachedAt: Date.now() });
```

**Step 2: In the constructor**, rehydrate the plugin WS from existing accepted connections:

```ts
constructor(
  private readonly state: DurableObjectState,
  private readonly env: Env,
) {
  // ...
  // Restore any plugin WS surviving hibernation.
  const pluginWs = this.state.getWebSockets("plugin");
  if (pluginWs.length > 0) {
    this.pluginWs = pluginWs[0];
  }
}
```

**Step 3: Hibernation test**

The Workers vitest pool exposes `state.acceptWebSocket` semantics natively. To force a hibernation cycle in tests, the pool typically supports running `state.refreshHibernation()` or similar. Read the [Cloudflare vitest pool docs](https://developers.cloudflare.com/workers/testing/vitest-integration/api/) for the current method name. If unavailable, the test asserts:

1. Plugin connects.
2. Plugin sends a message.
3. AI receives via SSE.
4. (Implicit) hibernation may or may not happen between (2) and (3); the test verifies the state survives at least one round trip after a sleep, simulating idle.

**Step 4: Commit**

```bash
git add apps/relay/src/durable-object.ts apps/relay/src/__tests__/hibernation-restore.test.ts
git commit -m "feat(relay): persist plugin WS attachment + rehydrate on restore"
```

---

## Task 6.10: End-to-end pairing test

**Goal:** Drive the full flow as a test:

1. AI POSTs `/pair`, gets `{ code, sessionId }`.
2. "Plugin" opens WSS to `/pair?code={code}`.
3. AI POSTs `/mcp/{sessionId}` with a JSON-RPC request.
4. Plugin receives the request over WS.
5. Plugin sends back a JSON-RPC response over WS.
6. AI's SSE response stream emits the response and closes.

**Files:**
- Create: `apps/relay/src/__tests__/e2e-pair-mcp.test.ts`

**Step 1: Test**

```ts
import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

describe("e2e: pair → plugin connect → AI request → response", () => {
  it("routes a JSON-RPC request from AI to plugin and back", async () => {
    // 1. AI requests a pairing code.
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
      sessionId: string;
    }>();

    // 2. Plugin connects with the code.
    const upgrade = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(upgrade.status).toBe(101);
    const pluginWs = upgrade.webSocket!;
    pluginWs.accept();

    // Plugin echoes incoming messages with id matched and result reflected.
    const pluginGotMessage = new Promise<{ id: number | string }>((resolve) => {
      pluginWs.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data as string);
        resolve(msg);
        // Reply with a JSON-RPC response.
        pluginWs.send(
          JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { ok: true } }),
        );
      });
    });

    // 3. AI sends a request.
    const aiResponsePromise = SELF.fetch(`https://relay/mcp/${pair.sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    // 4. Plugin receives.
    await pluginGotMessage;

    // 5. AI's SSE stream receives the response.
    const aiResponse = await aiResponsePromise;
    expect(aiResponse.status).toBe(200);
    const reader = aiResponse.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"result":{"ok":true}');
  });
});
```

**Step 2: Run, commit**

```bash
git add apps/relay/src/__tests__/e2e-pair-mcp.test.ts
git commit -m "test(relay): end-to-end pair → plugin connect → AI request flow"
```

---

## Task 6.11: Error-path tests

**Goal:** Cover the error branches the design doc calls out: expired pairing code, double-use, unknown session, plugin disconnect mid-request.

**Files:**
- Create: `apps/relay/src/__tests__/error-paths.test.ts`

Tests:

1. **Expired code**: POST /pair, advance time past TTL, attempt plugin connect → 401 (or 410 Gone).
2. **Double-use code**: covered in Task 6.5's tests; ensure parity here.
3. **Unknown session**: POST /mcp/ses_unknown → 404.
4. **Plugin disconnects mid-request**: AI POSTs /mcp, plugin connects but closes before responding → AI's SSE receives `event: error data: {"error":"E_RELAY_PLUGIN_DISCONNECTED"}`. Wire the close handler to write to all pending writers before clearing.

> Time advancement in Miniflare: the pool may expose a `vi.setSystemTime` or similar. If not available, generate a code with TTL=10ms and `await new Promise(r => setTimeout(r, 20))` before attempting connect.

**Step 1: Tests + implementation tweaks** (the plugin-disconnect handler may need a small addition in `webSocketClose`):

```ts
async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
  const tags = this.state.getTags(ws);
  if (tags.includes("plugin")) {
    this.pluginWs = null;
    // Tell any pending AI SSE streams the plugin is gone.
    const bytes = new TextEncoder().encode(
      `event: error\ndata: ${JSON.stringify({ error: "E_RELAY_PLUGIN_DISCONNECTED" })}\n\n`,
    );
    for (const w of this.pendingAiRequests.values()) {
      try {
        await w.write(bytes);
        await w.close();
      } catch { /* aborted */ }
    }
    this.pendingAiRequests.clear();
  }
}
```

**Step 2: Commit**

```bash
git add apps/relay/src/__tests__/error-paths.test.ts apps/relay/src/durable-object.ts
git commit -m "test(relay): error paths — expired code, double-use, unknown session, plugin disconnect"
```

---

## Task 6.12: Coverage gate + Phase 6 changeset + acceptance

**Files:**
- Create: `.changeset/phase-6-cloud-relay.md`

**Step 1: Coverage**

```bash
bun run --filter @repo/relay test --coverage
```

Confirm ≥80/75/80/80.

**Step 2: Root acceptance**

```bash
bun run lint
bun run types
bun run test
```

All pass.

**Step 3: Changeset**

```markdown
---
"@repo/relay": minor
---

Phase 6: cloud relay.

apps/relay (new) — Cloudflare Worker + two Durable Objects (LookupDO
for code → sessionId, RelayDO per session) using the WebSocket
Hibernation API. Endpoints: POST /pair (returns 6-digit code +
sessionId + expiresAt), WSS /pair?code=... (plugin upgrade with
single-use code consumption), POST /mcp/{sessionId} (AI Streamable
HTTP, SSE response stream). Pure pass-through routing — no schema
knowledge.

Verified end-to-end via Miniflare 4: pair → plugin connect → AI
request → plugin response → AI SSE. Error paths covered: expired
code, double-use, unknown session, plugin disconnect mid-request.

Out of scope: setup CLI integration (Phase 7), AI-side Streamable
HTTP transport client (Phase 7), production deploy (Phase 9).
```

**Step 4: Commit**

```bash
git add .changeset/phase-6-cloud-relay.md
git commit -m "chore(changeset): record Phase 6 cloud relay"
```

**Step 5: Final acceptance pass**

```bash
bun run lint && bun run types && bun run test
git log master..HEAD --oneline
```

**Phase 6 done.** The relay is ready for Phase 7 to integrate (`figma-mcp setup --cloud` CLI flag).

---

## Notes on Execution

**Workers runtime caveats:**

- `process` is unavailable; use `env` bindings.
- `Buffer` requires `nodejs_compat` flag (set in wrangler.toml).
- `fetch` is the entry; no Express-style routing.
- DO storage `put`/`get` are async + transactional within a single handler call.
- Hibernation: `acceptWebSocket(ws, tags)` is required — bare `ws.accept()` does NOT enable hibernation.
- `state.getTags(ws)` returns the tags array.
- `state.getWebSockets(tag?)` returns active sockets, optionally filtered.

**Vitest Workers pool quirks:**

- Use `cloudflare:test` for `SELF.fetch`, `env`, `runInDurableObject`, etc.
- Each test runs in an isolated Worker context.
- Tests CAN run real WS upgrades against `SELF.fetch` — Miniflare 4 handles them.
- DO instances persist across tests in the same file unless explicitly reset.

**SSE format reminder:** each event is `data: <json>\n\n` (or `event: <name>\ndata: <json>\n\n`). The double newline terminates the event. Don't forget the second `\n`.

**Out of scope reminders:**
- No setup CLI — Phase 7.
- No production deploy — Phase 9.
- No multi-shim per session — Phase 8+.
- No AI-side Streamable HTTP transport — Phase 7 (mcp-server's `--cloud` mode).

---

## References

- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md` (§ "Cloud relay", § "Cloud pairing").
- [Cloudflare WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/).
- [Cloudflare vitest pool docs](https://developers.cloudflare.com/workers/testing/vitest-integration/).
- [MCP Streamable HTTP transport spec](https://spec.modelcontextprotocol.io/specification/server/transports/#streamable-http).
- [SSE format (HTML spec)](https://html.spec.whatwg.org/multipage/server-sent-events.html).
