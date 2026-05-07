# Phase 11: tools-rest pack (cloud-mode-without-plugin reads)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ship `@repo/tools-rest` — 20 tools backed by the Figma REST API. Brings the registry from ~33 to ~53 tools. Unlike prior packs, these tools require ONLY a Figma personal access token (`FIGMA_API_KEY`) — no bridge plugin, no Figma Desktop. They surface read-only file/team/comment/dev-resource data via server-handlers.

**Architecture:** New `FigmaApiClient` lives in a new lightweight package `@repo/figma-api-client` (or inside `tools-rest` if too small to warrant separation — implementer judgment). Daemon constructs one client at startup using `FIGMA_API_KEY` env; server-handlers receive it via the `PluginHandlerContext` (or a parallel `ServerHandlerContext` — judgment call). Each tool's server-handler is a thin call to one Figma REST endpoint with response-shape narrowing. Tests use a `FigmaApiFake` in-memory double with seedable responses.

**Tech Stack:** Existing — Bun + Vitest + Zod. New: a Figma REST API client (uses native `fetch`). No SDK dependency.

---

## STATE OF THE PROTOCOL SEAM

> Filled in by Task 11.1. Re-read this section before starting Task 11.2.

**Findings (verified by direct read of `packages/protocol/src/tools.ts` and `apps/mcp-server/src/registries/server-registry.ts`):**

- The protocol package **already** exports `ServerHandler<T>`, `ServerHandlerContext`, `ServerRegistry`, and `Pack.registerServer` — Phase 1 introduced them speculatively, and Phase 3 wired `tools-extract`'s `bridge_status` through `Pack.registerServer`. **Phase 11 does NOT need to extend the protocol surface.**
- `ServerHandlerContext` is `{ logger, figmaApiKey? }` today — `figmaApiKey` is a Phase 1 placeholder marked `@deprecated` in JSDoc. Phase 11 introduces the `figmaApi` field (a typed `FigmaApiClient | null`) and migrates `figmaApiKey` to `@deprecated` with the migration site documented (the design doc's "promote to typed client" line is the spec we're cashing in).
- `Daemon.dispatch()` already prefers the server registry over the plugin registry: `if (this._serverRegistry.has(req.tool)) return this._serverRegistry.dispatch(...)`. Adding REST tools is therefore a pure registration concern — no router rework. Today's call site (`daemon.ts:175`) passes `{ logger: this.logger }` only; Phase 11 widens the literal to `{ logger, figmaApi: this.figmaApi }`.
- The canonical pack-with-server-handlers reference is `tools-extract`: factory pattern `createBridgeStatusServerHandler(providers)` returns a `ServerHandler<typeof BridgeStatus>`. The factory closes over daemon-state providers (here the equivalent will be the FigmaApiClient instance). **Phase 11 mirrors this pattern verbatim** — every REST tool ships a `createXyzServerHandler(deps)` factory and the daemon's `registerServer` block calls each factory with `{ figmaApi }`.
- Write-tool gating is **new** to this phase. The daemon currently has no equivalent of `--enable-write-tools`. Task 11.11 introduces the flag in `cli/dispatch.ts`'s runtime branch and threads a `enableWriteTools: boolean` field through `DaemonStartOptions`; the three mutating tools' `registerServer` block branches on it (i.e., the tool is registered in the catalog but its handler throws `E_WRITE_TOOLS_DISABLED` on call). The handler-level branch is preferred over a registration-level skip so the catalog test stays stable across modes.

---

## Out of scope (call-out so the executor doesn't drift)

- **`@repo/tools-slides`, `@repo/tools-a11y`.** Separate phases. Do NOT scaffold or stub.
- **Webhook tools.** `POST /v2/webhooks`, webhook delivery, signing — outside the read-pack story.
- **OAuth-based auth.** v1 is `FIGMA_API_KEY` only. OAuth has a redirect flow, refresh tokens, and consent screens — its own phase.
- **Plugin runtime tools.** Anything that needs the plugin (selection state, live editing) is not REST-reachable. That's `tools-extract` / `tools-design` / `tools-figjam`.
- **REST writes beyond comments + dev resources.** Figma's REST API does not support file content updates (no node creation, no fill changes, no variable mutations) — those are plugin-only by design. The three REST writes we DO ship (`post_file_comment`, `delete_file_comment`, `post_dev_resources`) are the only mutating endpoints Figma exposes via the public REST API for our purposes.
- **WebSocket-based real-time subscriptions.** Figma's REST API exposes no streaming/subscription endpoints. Real-time work happens through the plugin runtime.
- **Editor-type discriminator.** Phase 10's `requireFigJam` guard does not apply. REST tools work for any file type — the API is editor-agnostic — and editor type is not exposed in any REST response we narrow on. **No `requireEditorType` calls in this pack.**
- **Real-Figma smoke runs.** Phase 9's golden test fetches a fixture file via `/v1/files/<key>?depth=1`. Phase 11 reuses Phase 9's harness *philosophy* but does NOT promote the REST pack into the manual workflow — every REST tool's handler is a pass-through to the client, so the client's tests are the authoritative coverage. (A follow-up phase can add a `real-figma-rest.golden.test.ts` if regressions justify it.)
- **Concurrency / connection pooling.** Native `fetch` handles its own pool; we do not introduce an HTTP agent. The REST client is stateless per-call.
- **Caching.** No response caching. Each tool call hits the API. Adding an LRU is a follow-up.
- **Rate-limit auto-retry.** On 429 we surface the error verbatim. The caller (the AI) decides whether to retry. Auto-retry with exponential backoff is a follow-up.
- **Per-request telemetry.** No analytics, no usage counters.
- **Tool versioning / deprecation.** Tools are added; nothing is removed or renamed.
- **`figma-mcp setup` writing the API key to a config file.** v1 is env-only. The setup command does not prompt for or persist the key; users must export `FIGMA_API_KEY` themselves. (Documented in Notes on Execution.)
- **The deferred Phase 7 Windows IPC fix** (named-pipe path resolution under `\\.\pipe\` on Windows). Tracked separately in Phase 7's "Out of scope".

---

## Acceptance Criteria

- `packages/figma-api-client/` exists with the `FigmaApiClient` class, the `FigmaApiFake` test double, and a `FigmaApiError` typed error class. Per-pack coverage ≥90/85/90/90.
- `packages/tools-rest/` exists with 20 tool definitions and 20 server-handlers (all tools are server-side; **no plugin-handlers**). Per-pack coverage ≥90/85/90/90.
- `apps/mcp-server/src/main.ts` reads `FIGMA_API_KEY` from `process.env`, constructs a `FigmaApiClient` lazily (only if env is set), passes it to the daemon via `DaemonStartOptions.figmaApi`, and registers the `tools-rest` pack alongside the existing five.
- `Daemon.dispatch()` passes `{ logger, figmaApi }` to the server registry (replaces today's `{ logger }`).
- `--enable-write-tools` flag is honored by the runtime dispatch path; default is off; when off, the three write tools (`post_file_comment`, `delete_file_comment`, `post_dev_resources`) throw `E_WRITE_TOOLS_DISABLED` from their handlers.
- A missing or unreadable `FIGMA_API_KEY` produces `E_FIGMA_API_KEY_MISSING` from any REST tool's handler — not a daemon-startup crash.
- An e2e catalog test asserts every Phase 11 tool name appears in the daemon's catalog (mirrors Phase 8's `e2e-phase8-catalog.test.ts`).
- A wire-level e2e test asserts that calling a write tool with `--enable-write-tools` off returns `E_WRITE_TOOLS_DISABLED`.
- `packages/protocol/src/tools.ts` extends `ServerHandlerContext` with `figmaApi?: FigmaApiClient | null`. The pre-existing `figmaApiKey` field stays (still `@deprecated`) for one phase as a migration window. `figma-api-client`'s `FigmaApiClient` is the one canonical typed surface.
- Per-pack coverage ≥90/85/90/90 (lines/branches/functions/statements).
- Phase 11 changeset under `.changeset/phase-11-tools-rest.md`. The changeset bumps `@bromso/figma-mcp`, `@repo/tools-rest`, and `@repo/figma-api-client` (all minor); it does NOT bump `@repo/figma-adapter` (untouched in this phase).
- Commit hygiene: each task ends with one conventional-commit-formatted commit. No multi-task commits. No `git add -A`.

---

## Task Map

| #     | Task                                                                          | Package / App         | Type        |
| ----- | ----------------------------------------------------------------------------- | --------------------- | ----------- |
| 11.1  | Investigate protocol seam + document state                                    | protocol (read-only)  | doc         |
| 11.2  | `@repo/figma-api-client` package + `FigmaApiClient` + `FigmaApiFake`          | figma-api-client (new) | code        |
| 11.3  | `@repo/tools-rest` package scaffold                                           | tools-rest (new)      | infra       |
| 11.4  | `tools-rest` foundation: `requireApiKey` + write-tool gate helper             | tools-rest            | code        |
| 11.5  | `tools-rest`: file metadata reads (4 tools)                                   | tools-rest            | code        |
| 11.6  | `tools-rest`: file styles + components (4 tools)                              | tools-rest            | code        |
| 11.7  | `tools-rest`: images + image fills + user-me (3 tools)                        | tools-rest            | code        |
| 11.8  | `tools-rest`: comments (3 tools, two write-gated)                             | tools-rest            | code        |
| 11.9  | `tools-rest`: team + project (3 tools, cursor-paginated)                      | tools-rest            | code        |
| 11.10 | `tools-rest`: team styles + dev resources (3 tools, one write-gated)          | tools-rest            | code        |
| 11.11 | Wire `tools-rest` into mcp-server (env, write-flag, registration, e2e)        | mcp-server            | code/tests  |
| 11.12 | Coverage gate + Phase 11 changeset + acceptance                               | repo                  | infra       |

---

## Task 11.1: Investigate protocol seam + document state

**Goal:** Verify the protocol surface is ready to host server-handlers without changes. Produce the "STATE OF THE PROTOCOL SEAM" section above (already drafted at the top of this plan from a read of `packages/protocol/src/tools.ts`, `packages/tools-extract/src/server-handlers.ts`, `apps/mcp-server/src/registries/server-registry.ts`, and `apps/mcp-server/src/daemon/daemon.ts`).

**This task is documentation-only.** No code changes; no commit.

**Files to read (not modify):**

- `packages/protocol/src/tools.ts` — confirm `ServerHandler`, `ServerHandlerContext`, `Pack.registerServer` exist.
- `packages/tools-extract/src/server-handlers.ts` — canonical server-handler factory pattern (`createBridgeStatusServerHandler`).
- `packages/tools-extract/src/__tests__/server-handlers.test.ts` — canonical server-handler test pattern.
- `apps/mcp-server/src/registries/server-registry.ts` — `ServerRegistryImpl.dispatch(name, args, ctx)` validates input, calls handler, validates output.
- `apps/mcp-server/src/daemon/daemon.ts` — `Daemon.dispatch()`, around line 175, where the server registry's `dispatch` call site uses `{ logger: this.logger }` and Phase 11 will widen to `{ logger, figmaApi }`.
- `apps/mcp-server/src/main.ts` — see how the `tools-extract` pack's `registerServer` is wired today (mainline runRuntime, around line 348).

**Output of this task:** the "STATE OF THE PROTOCOL SEAM" section above. Re-read it; if any bullet is wrong, fix it before starting Task 11.2. **No commit.** The doc edit happens as part of writing this plan.

---

## Task 11.2: `@repo/figma-api-client` package + `FigmaApiClient` + `FigmaApiFake`

**Goal:** A new, lightweight package that owns the typed Figma REST surface. The package exposes:

- `FigmaApiClient` — the production class. Wraps native `fetch`. One method per REST endpoint we care about. Configurable base URL + fetch fn (for tests). Throws `FigmaApiError` on non-2xx.
- `FigmaApiFake` — in-memory test double. Implements the same surface. Seedable per-endpoint via `__seedFile()`, `__seedTeamProjects()`, etc. **The same instance can be passed where `FigmaApiClient` is expected** — the surface is structural.
- `FigmaApiError` — typed error with `status` and `code` (e.g., `E_FIGMA_REST_404`, `E_FIGMA_REST_429`, `E_FIGMA_REST_AUTH`, `E_FIGMA_REST_UNKNOWN`).
- A handful of response types (`UserMeResponse`, `FigmaFile`, `NodesResponse`, `PageSummary`, `StylesResponse`, `ComponentsResponse`, `ComponentSetsResponse`, `VersionsResponse`, `BranchesResponse`, `ImagesResponse`, `ImageFillsResponse`, `CommentsResponse`, `Comment`, `ProjectsResponse`, `ProjectFilesResponse`, `TeamComponentsResponse`, `TeamStylesResponse`, `DevResourcesResponse`, `DevResourceInput`).

> **Judgment call (separate package vs inside `tools-rest`):** Separate package is correct — the relay (Phase 6, future) will plausibly want to do cloud-side reads against the same surface, and `@scope/figma-mcp-protocol` extraction (mentioned in `rewrite-design.md`) is easier if the REST client is already independent. The package is small (~600 lines incl. tests) but keeping it isolated future-proofs the boundary. **Adopted: separate `@repo/figma-api-client` package.**

**Files:**

- Create: `packages/figma-api-client/package.json`
- Create: `packages/figma-api-client/tsconfig.json`
- Create: `packages/figma-api-client/vitest.config.ts`
- Create: `packages/figma-api-client/src/index.ts`
- Create: `packages/figma-api-client/src/client.ts`
- Create: `packages/figma-api-client/src/fake.ts`
- Create: `packages/figma-api-client/src/errors.ts`
- Create: `packages/figma-api-client/src/types.ts`
- Create: `packages/figma-api-client/src/__tests__/client.test.ts`
- Create: `packages/figma-api-client/src/__tests__/fake.test.ts`
- Create: `packages/figma-api-client/src/__tests__/errors.test.ts`
- Modify: `bun.lock` (via `bun install`)

**Step 1: `package.json`** — same shape as `@repo/tools-extract`:

```json
{
  "name": "@repo/figma-api-client",
  "version": "0.1.0",
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
  "dependencies": {},
  "devDependencies": {
    "@vitest/coverage-v8": "4.1.4",
    "typescript": "^6.0.0",
    "vitest": "4.1.4"
  }
}
```

> Zero runtime deps — native `fetch`, no SDK. The `Workspace::*` aliases land via `bun install` symlinks.

**Step 2: `tsconfig.json` and `vitest.config.ts`** — copy verbatim from `tools-extract`. Coverage thresholds `lines: 90, branches: 85, functions: 90, statements: 90`.

**Step 3: Failing tests** — `packages/figma-api-client/src/__tests__/errors.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { FigmaApiError, mapStatusToCode } from "../errors";

describe("FigmaApiError", () => {
  it("carries status + code + message", () => {
    const err = new FigmaApiError({
      status: 404,
      code: "E_FIGMA_REST_404",
      message: "file not found: xyz",
    });
    expect(err.status).toBe(404);
    expect(err.code).toBe("E_FIGMA_REST_404");
    expect(err.message).toBe("file not found: xyz");
    expect(err).toBeInstanceOf(Error);
  });

  it("name is FigmaApiError", () => {
    const err = new FigmaApiError({
      status: 500,
      code: "E_FIGMA_REST_UNKNOWN",
      message: "boom",
    });
    expect(err.name).toBe("FigmaApiError");
  });
});

describe("mapStatusToCode", () => {
  it("maps 401 / 403 to E_FIGMA_REST_AUTH", () => {
    expect(mapStatusToCode(401)).toBe("E_FIGMA_REST_AUTH");
    expect(mapStatusToCode(403)).toBe("E_FIGMA_REST_AUTH");
  });

  it("maps 404 to E_FIGMA_REST_404", () => {
    expect(mapStatusToCode(404)).toBe("E_FIGMA_REST_404");
  });

  it("maps 429 to E_FIGMA_REST_429", () => {
    expect(mapStatusToCode(429)).toBe("E_FIGMA_REST_429");
  });

  it("maps 500/502/503/504 to E_FIGMA_REST_UNKNOWN", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(mapStatusToCode(status)).toBe("E_FIGMA_REST_UNKNOWN");
    }
  });

  it("maps any other non-2xx to E_FIGMA_REST_UNKNOWN", () => {
    expect(mapStatusToCode(418)).toBe("E_FIGMA_REST_UNKNOWN");
    expect(mapStatusToCode(599)).toBe("E_FIGMA_REST_UNKNOWN");
  });
});
```

Run: `bun run --filter @repo/figma-api-client test errors` → FAIL (file does not exist).

**Step 4: Implement errors** — `packages/figma-api-client/src/errors.ts`

```ts
export type FigmaApiErrorCode =
  | "E_FIGMA_REST_AUTH"
  | "E_FIGMA_REST_404"
  | "E_FIGMA_REST_429"
  | "E_FIGMA_REST_UNKNOWN";

export class FigmaApiError extends Error {
  readonly status: number;
  readonly code: FigmaApiErrorCode;

  constructor(args: { status: number; code: FigmaApiErrorCode; message: string }) {
    super(args.message);
    this.name = "FigmaApiError";
    this.status = args.status;
    this.code = args.code;
  }
}

export function mapStatusToCode(status: number): FigmaApiErrorCode {
  if (status === 401 || status === 403) return "E_FIGMA_REST_AUTH";
  if (status === 404) return "E_FIGMA_REST_404";
  if (status === 429) return "E_FIGMA_REST_429";
  return "E_FIGMA_REST_UNKNOWN";
}
```

Re-run: tests pass.

**Step 5: Failing tests** — `packages/figma-api-client/src/__tests__/client.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FigmaApiClient } from "../client";
import { FigmaApiError } from "../errors";

const mkResp = (body: unknown, init: ResponseInit = { status: 200 }) =>
  new Response(JSON.stringify(body), init);

describe("FigmaApiClient.getMe", () => {
  it("GETs /v1/me with X-Figma-Token header", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({ id: "u1", email: "x@y.z", handle: "Jonas", img_url: "http://i" })
    );
    const client = new FigmaApiClient({ apiKey: "secret", fetchFn });
    const r = await client.getMe();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.figma.com/v1/me");
    expect((init as RequestInit).headers).toMatchObject({
      "X-Figma-Token": "secret",
    });
    expect(r.id).toBe("u1");
  });

  it("honors a custom baseUrl", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ id: "u1", email: "", handle: "", img_url: "" }));
    const client = new FigmaApiClient({
      apiKey: "k",
      fetchFn,
      baseUrl: "http://localhost:9999/v1",
    });
    await client.getMe();
    expect(fetchFn.mock.calls[0][0]).toBe("http://localhost:9999/v1/me");
  });
});

describe("FigmaApiClient.getFile", () => {
  it("GETs /v1/files/<key>", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({ name: "F", lastModified: "2026-01-01", version: "1", role: "owner", editorType: "figma", document: {} })
    );
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    const r = await client.getFile("ABC");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.figma.com/v1/files/ABC");
    expect(r.name).toBe("F");
  });

  it("forwards depth + ids query parameters", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({ name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma", document: {} })
    );
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await client.getFile("ABC", { depth: 2, ids: ["1:2", "1:3"] });
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v1/files/ABC");
    expect(url.searchParams.get("depth")).toBe("2");
    expect(url.searchParams.get("ids")).toBe("1:2,1:3");
  });
});

describe("FigmaApiClient.getFileNodes", () => {
  it("GETs /v1/files/<key>/nodes?ids=<csv>", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ nodes: {} }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await client.getFileNodes("ABC", ["1:2", "1:3"]);
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v1/files/ABC/nodes");
    expect(url.searchParams.get("ids")).toBe("1:2,1:3");
  });
});

describe("FigmaApiClient.getFilePages", () => {
  it("returns the document's first-level CANVAS children as page summaries", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({
        name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
        document: {
          id: "0:0",
          type: "DOCUMENT",
          children: [
            { id: "1:0", type: "CANVAS", name: "Page 1" },
            { id: "2:0", type: "CANVAS", name: "Page 2" },
          ],
        },
      })
    );
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    const pages = await client.getFilePages("ABC");
    expect(pages).toEqual([
      { id: "1:0", name: "Page 1" },
      { id: "2:0", name: "Page 2" },
    ]);
  });
});

describe("FigmaApiClient — error mapping", () => {
  it("throws FigmaApiError(404) on 404", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ err: "not found" }, { status: 404 }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await expect(client.getFile("MISSING")).rejects.toThrow(FigmaApiError);
    await expect(client.getFile("MISSING")).rejects.toMatchObject({
      status: 404, code: "E_FIGMA_REST_404",
    });
  });

  it("throws FigmaApiError(401) → E_FIGMA_REST_AUTH", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ err: "no" }, { status: 401 }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await expect(client.getMe()).rejects.toMatchObject({
      status: 401, code: "E_FIGMA_REST_AUTH",
    });
  });

  it("throws FigmaApiError(429) → E_FIGMA_REST_429", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ err: "slow down" }, { status: 429 }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await expect(client.getMe()).rejects.toMatchObject({
      status: 429, code: "E_FIGMA_REST_429",
    });
  });

  it("throws FigmaApiError(500) → E_FIGMA_REST_UNKNOWN", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ err: "boom" }, { status: 500 }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await expect(client.getMe()).rejects.toMatchObject({
      status: 500, code: "E_FIGMA_REST_UNKNOWN",
    });
  });
});

describe("FigmaApiClient — pagination cursor passthrough", () => {
  it("forwards cursor + page_size on getTeamComponents", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({ meta: { components: [], cursor: { after: 100 } } })
    );
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await client.getTeamComponents("T1", { cursor: "abc", pageSize: 50 });
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v1/teams/T1/components");
    expect(url.searchParams.get("cursor")).toBe("abc");
    expect(url.searchParams.get("page_size")).toBe("50");
  });

  it("forwards before / after on getFileVersions", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ versions: [], pagination: {} }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await client.getFileVersions("ABC", { before: "100", pageSize: 5 });
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v1/files/ABC/versions");
    expect(url.searchParams.get("before")).toBe("100");
    expect(url.searchParams.get("page_size")).toBe("5");
  });
});

describe("FigmaApiClient — write methods", () => {
  it("POST /v1/files/<key>/comments", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({ id: "c1", message: "hello", file_key: "ABC", parent_id: "", user: { handle: "j" }, created_at: "2026-01-01T00:00:00Z" })
    );
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    const out = await client.postFileComment("ABC", { message: "hello" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.figma.com/v1/files/ABC/comments");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBe(JSON.stringify({ message: "hello" }));
    expect(out.id).toBe("c1");
  });

  it("DELETE /v1/files/<key>/comments/<id>", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await client.deleteFileComment("ABC", "c1");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.figma.com/v1/files/ABC/comments/c1");
    expect((init as RequestInit).method).toBe("DELETE");
  });
});
```

Run: FAIL.

**Step 6: Implement types** — `packages/figma-api-client/src/types.ts`

> Keep types narrow: every shape is the *minimum* the tools narrow on. We do NOT model every field Figma returns. Adding a new field is non-breaking; over-modeling now would lock us into upstream-shaped responses we don't use.

```ts
export interface UserMeResponse {
  readonly id: string;
  readonly email: string;
  readonly handle: string;
  readonly img_url: string;
}

export interface FigmaFile {
  readonly name: string;
  readonly lastModified: string;
  readonly version: string;
  readonly role: string;
  readonly editorType: string;
  readonly document: {
    readonly id: string;
    readonly type: string;
    readonly children?: readonly FigmaNode[];
  };
}

export interface FigmaNode {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
  readonly children?: readonly FigmaNode[];
}

export interface NodesResponse {
  readonly nodes: Record<string, { readonly document: FigmaNode } | null>;
}

export interface PageSummary {
  readonly id: string;
  readonly name: string;
}

export interface StyleEntry {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly style_type: string;
  readonly node_id?: string;
}

export interface StylesResponse {
  readonly meta: { readonly styles: readonly StyleEntry[] };
}

export interface ComponentEntry {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly node_id?: string;
  readonly containing_frame?: { readonly name?: string; readonly nodeId?: string };
}

export interface ComponentsResponse {
  readonly meta: { readonly components: readonly ComponentEntry[] };
}

export interface ComponentSetEntry {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly node_id?: string;
}

export interface ComponentSetsResponse {
  readonly meta: { readonly component_sets: readonly ComponentSetEntry[] };
}

export interface FileVersion {
  readonly id: string;
  readonly created_at: string;
  readonly label: string;
  readonly description: string;
  readonly user: { readonly handle: string };
}

export interface VersionsResponse {
  readonly versions: readonly FileVersion[];
  readonly pagination: { readonly prev_page?: string; readonly next_page?: string };
}

export interface BranchEntry {
  readonly key: string;
  readonly name: string;
  readonly thumbnail_url: string;
  readonly last_modified: string;
  readonly link_access: string;
}

export interface BranchesResponse {
  readonly main_file_key: string;
  readonly branches: readonly BranchEntry[];
}

export interface ImagesResponse {
  readonly err: string | null;
  readonly images: Record<string, string | null>;
}

export interface ImageFillsResponse {
  readonly meta: { readonly images: Record<string, string> };
  readonly error: boolean;
  readonly status: number;
}

export interface CommentClientMeta {
  readonly x: number;
  readonly y: number;
}

export interface Comment {
  readonly id: string;
  readonly message: string;
  readonly file_key: string;
  readonly parent_id: string;
  readonly user: { readonly handle: string };
  readonly created_at: string;
  readonly client_meta?: CommentClientMeta;
  readonly resolved_at?: string;
}

export interface CommentsResponse {
  readonly comments: readonly Comment[];
}

export interface ProjectEntry {
  readonly id: string;
  readonly name: string;
}

export interface ProjectsResponse {
  readonly name: string;
  readonly projects: readonly ProjectEntry[];
}

export interface ProjectFileEntry {
  readonly key: string;
  readonly name: string;
  readonly thumbnail_url: string;
  readonly last_modified: string;
}

export interface ProjectFilesResponse {
  readonly name: string;
  readonly files: readonly ProjectFileEntry[];
}

export interface TeamComponentsResponse {
  readonly meta: {
    readonly components: readonly ComponentEntry[];
    readonly cursor?: { readonly before?: number; readonly after?: number };
  };
}

export interface TeamStylesResponse {
  readonly meta: {
    readonly styles: readonly StyleEntry[];
    readonly cursor?: { readonly before?: number; readonly after?: number };
  };
}

export interface DevResource {
  readonly id: string;
  readonly file_key: string;
  readonly node_id: string;
  readonly name: string;
  readonly url: string;
}

export interface DevResourceInput {
  readonly file_key: string;
  readonly node_id: string;
  readonly name: string;
  readonly url: string;
}

export interface DevResourcesResponse {
  readonly dev_resources: readonly DevResource[];
}
```

**Step 7: Implement the client** — `packages/figma-api-client/src/client.ts`

```ts
import { FigmaApiError, mapStatusToCode } from "./errors";
import type {
  BranchesResponse, Comment, CommentsResponse, ComponentSetsResponse,
  ComponentsResponse, DevResourceInput, DevResourcesResponse, FigmaFile,
  ImageFillsResponse, ImagesResponse, NodesResponse, PageSummary,
  ProjectFilesResponse, ProjectsResponse, StylesResponse,
  TeamComponentsResponse, TeamStylesResponse, UserMeResponse, VersionsResponse,
} from "./types";

export interface FigmaApiClientOptions {
  readonly apiKey: string;
  readonly fetchFn?: typeof fetch;
  readonly baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.figma.com/v1";

export class FigmaApiClient {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: FigmaApiClientOptions) {
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  // ---- helpers ----

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    init: { query?: Record<string, string | number | undefined>; body?: unknown } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const fetchInit: RequestInit = {
      method,
      headers: {
        "X-Figma-Token": this.apiKey,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    };
    const resp = await this.fetchFn(url.toString(), fetchInit);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new FigmaApiError({
        status: resp.status,
        code: mapStatusToCode(resp.status),
        message: text || `HTTP ${resp.status}`,
      });
    }
    if (resp.status === 204) return undefined as T;
    return (await resp.json()) as T;
  }

  // ---- file reads ----

  getMe(): Promise<UserMeResponse> {
    return this.request("GET", "/me");
  }

  getFile(
    fileKey: string,
    opts: { depth?: number; ids?: readonly string[] } = {}
  ): Promise<FigmaFile> {
    return this.request("GET", `/files/${fileKey}`, {
      query: {
        depth: opts.depth,
        ids: opts.ids?.length ? opts.ids.join(",") : undefined,
      },
    });
  }

  getFileNodes(fileKey: string, ids: readonly string[]): Promise<NodesResponse> {
    return this.request("GET", `/files/${fileKey}/nodes`, {
      query: { ids: ids.join(",") },
    });
  }

  async getFilePages(fileKey: string): Promise<readonly PageSummary[]> {
    const file = await this.getFile(fileKey, { depth: 1 });
    const children = file.document.children ?? [];
    return children
      .filter((c) => c.type === "CANVAS")
      .map((c) => ({ id: c.id, name: c.name ?? "" }));
  }

  getFileStyles(fileKey: string): Promise<StylesResponse> {
    return this.request("GET", `/files/${fileKey}/styles`);
  }

  getFileComponents(fileKey: string): Promise<ComponentsResponse> {
    return this.request("GET", `/files/${fileKey}/components`);
  }

  getFileComponentSets(fileKey: string): Promise<ComponentSetsResponse> {
    return this.request("GET", `/files/${fileKey}/component_sets`);
  }

  getFileVersions(
    fileKey: string,
    opts: { pageSize?: number; before?: string; after?: string } = {}
  ): Promise<VersionsResponse> {
    return this.request("GET", `/files/${fileKey}/versions`, {
      query: {
        page_size: opts.pageSize,
        before: opts.before,
        after: opts.after,
      },
    });
  }

  getFileBranches(fileKey: string): Promise<BranchesResponse> {
    return this.request("GET", `/files/${fileKey}/branches`);
  }

  // ---- images ----

  getImages(
    fileKey: string,
    opts: {
      ids: readonly string[];
      format?: "png" | "svg" | "pdf" | "jpg";
      scale?: number;
    }
  ): Promise<ImagesResponse> {
    return this.request("GET", `/images/${fileKey}`, {
      query: {
        ids: opts.ids.join(","),
        format: opts.format,
        scale: opts.scale,
      },
    });
  }

  getImageFills(fileKey: string): Promise<ImageFillsResponse> {
    return this.request("GET", `/files/${fileKey}/images`);
  }

  // ---- comments ----

  getFileComments(fileKey: string): Promise<CommentsResponse> {
    return this.request("GET", `/files/${fileKey}/comments`);
  }

  postFileComment(
    fileKey: string,
    msg: { message: string; client_meta?: { x: number; y: number } }
  ): Promise<Comment> {
    return this.request("POST", `/files/${fileKey}/comments`, { body: msg });
  }

  deleteFileComment(fileKey: string, commentId: string): Promise<void> {
    return this.request("DELETE", `/files/${fileKey}/comments/${commentId}`);
  }

  // ---- team / project ----

  getTeamProjects(teamId: string): Promise<ProjectsResponse> {
    return this.request("GET", `/teams/${teamId}/projects`);
  }

  getProjectFiles(
    projectId: string,
    opts: { branch_data?: boolean } = {}
  ): Promise<ProjectFilesResponse> {
    return this.request("GET", `/projects/${projectId}/files`, {
      query: { branch_data: opts.branch_data ? "true" : undefined },
    });
  }

  getTeamComponents(
    teamId: string,
    opts: { pageSize?: number; cursor?: string } = {}
  ): Promise<TeamComponentsResponse> {
    return this.request("GET", `/teams/${teamId}/components`, {
      query: { page_size: opts.pageSize, cursor: opts.cursor },
    });
  }

  getTeamStyles(
    teamId: string,
    opts: { pageSize?: number; cursor?: string } = {}
  ): Promise<TeamStylesResponse> {
    return this.request("GET", `/teams/${teamId}/styles`, {
      query: { page_size: opts.pageSize, cursor: opts.cursor },
    });
  }

  // ---- dev resources ----

  getDevResources(
    fileKey: string,
    opts: { node_ids?: readonly string[] } = {}
  ): Promise<DevResourcesResponse> {
    return this.request("GET", `/files/${fileKey}/dev_resources`, {
      query: { node_ids: opts.node_ids?.length ? opts.node_ids.join(",") : undefined },
    });
  }

  postDevResources(resources: readonly DevResourceInput[]): Promise<DevResourcesResponse> {
    return this.request("POST", "/dev_resources", { body: { dev_resources: resources } });
  }
}
```

Run: tests pass.

**Step 8: Failing tests** — `packages/figma-api-client/src/__tests__/fake.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { FigmaApiFake } from "../fake";

describe("FigmaApiFake.getMe", () => {
  it("returns the seeded user", async () => {
    const fake = new FigmaApiFake();
    fake.__seedMe({ id: "u1", email: "x@y", handle: "Jonas", img_url: "" });
    const r = await fake.getMe();
    expect(r.id).toBe("u1");
  });

  it("throws E_FIGMA_REST_AUTH if no user is seeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getMe()).rejects.toMatchObject({ code: "E_FIGMA_REST_AUTH" });
  });
});

describe("FigmaApiFake.getFile + getFilePages", () => {
  it("getFile returns the seeded file", async () => {
    const fake = new FigmaApiFake();
    fake.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    expect((await fake.getFile("ABC")).name).toBe("F");
  });

  it("getFile throws E_FIGMA_REST_404 for unseeded keys", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getFile("MISSING")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getFilePages narrows the seeded file's CANVAS children", async () => {
    const fake = new FigmaApiFake();
    fake.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: {
        id: "0:0",
        type: "DOCUMENT",
        children: [
          { id: "1:0", type: "CANVAS", name: "Page 1" },
          { id: "9:0", type: "FRAME", name: "stray" },
          { id: "2:0", type: "CANVAS", name: "Page 2" },
        ],
      },
    });
    expect(await fake.getFilePages("ABC")).toEqual([
      { id: "1:0", name: "Page 1" },
      { id: "2:0", name: "Page 2" },
    ]);
  });
});

describe("FigmaApiFake.postFileComment + deleteFileComment", () => {
  it("posts a comment + returns the seeded shape", async () => {
    const fake = new FigmaApiFake();
    fake.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    const c = await fake.postFileComment("ABC", { message: "hi" });
    expect(c.message).toBe("hi");
    expect(c.file_key).toBe("ABC");
    expect(c.id).toMatch(/^c/);
  });

  it("deleteFileComment removes a previously posted comment", async () => {
    const fake = new FigmaApiFake();
    fake.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    const c = await fake.postFileComment("ABC", { message: "hi" });
    await fake.deleteFileComment("ABC", c.id);
    const r = await fake.getFileComments("ABC");
    expect(r.comments).toEqual([]);
  });

  it("deleteFileComment throws 404 for unknown id", async () => {
    const fake = new FigmaApiFake();
    fake.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    await expect(fake.deleteFileComment("ABC", "missing")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });
});

describe("FigmaApiFake.getTeamProjects + getProjectFiles", () => {
  it("returns seeded projects", async () => {
    const fake = new FigmaApiFake();
    fake.__seedTeamProjects("T1", {
      name: "Team", projects: [{ id: "P1", name: "Web" }],
    });
    const r = await fake.getTeamProjects("T1");
    expect(r.projects).toEqual([{ id: "P1", name: "Web" }]);
  });

  it("throws 404 for unknown team", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getTeamProjects("T9")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getProjectFiles returns seeded files", async () => {
    const fake = new FigmaApiFake();
    fake.__seedProjectFiles("P1", {
      name: "Web",
      files: [{ key: "ABC", name: "Home", thumbnail_url: "", last_modified: "" }],
    });
    expect((await fake.getProjectFiles("P1")).files).toHaveLength(1);
  });
});

describe("FigmaApiFake.getTeamComponents — pagination", () => {
  it("returns the seeded page", async () => {
    const fake = new FigmaApiFake();
    fake.__seedTeamComponents("T1", {
      meta: {
        components: [{ key: "C1", name: "n", description: "" }],
        cursor: { after: 100 },
      },
    });
    const r = await fake.getTeamComponents("T1");
    expect(r.meta.components).toHaveLength(1);
    expect(r.meta.cursor?.after).toBe(100);
  });
});
```

Run: FAIL.

**Step 9: Implement the fake** — `packages/figma-api-client/src/fake.ts`

```ts
import { FigmaApiError, mapStatusToCode } from "./errors";
import type {
  BranchesResponse, Comment, CommentsResponse, ComponentSetsResponse,
  ComponentsResponse, DevResource, DevResourceInput, DevResourcesResponse,
  FigmaFile, ImageFillsResponse, ImagesResponse, NodesResponse, PageSummary,
  ProjectFilesResponse, ProjectsResponse, StylesResponse,
  TeamComponentsResponse, TeamStylesResponse, UserMeResponse, VersionsResponse,
} from "./types";

const notFound = (msg: string) =>
  new FigmaApiError({ status: 404, code: mapStatusToCode(404), message: msg });

const noAuth = (msg: string) =>
  new FigmaApiError({ status: 401, code: mapStatusToCode(401), message: msg });

/**
 * In-memory test double matching the FigmaApiClient surface. Seed data via
 * `__seedX(...)` methods; calls against unseeded resources throw
 * `FigmaApiError(404)` (or 401 for `getMe` — there is no "no user").
 */
export class FigmaApiFake {
  private me: UserMeResponse | null = null;
  private files = new Map<string, FigmaFile>();
  private styles = new Map<string, StylesResponse>();
  private components = new Map<string, ComponentsResponse>();
  private componentSets = new Map<string, ComponentSetsResponse>();
  private versions = new Map<string, VersionsResponse>();
  private branches = new Map<string, BranchesResponse>();
  private images = new Map<string, ImagesResponse>();
  private imageFills = new Map<string, ImageFillsResponse>();
  private comments = new Map<string, Comment[]>();
  private teamProjects = new Map<string, ProjectsResponse>();
  private projectFiles = new Map<string, ProjectFilesResponse>();
  private teamComponents = new Map<string, TeamComponentsResponse>();
  private teamStyles = new Map<string, TeamStylesResponse>();
  private devResources = new Map<string, DevResource[]>();
  private commentCounter = 0;
  private devResourceCounter = 0;

  // ---- seeders ----
  __seedMe(me: UserMeResponse) { this.me = me; }
  __seedFile(key: string, file: FigmaFile) { this.files.set(key, file); }
  __seedStyles(key: string, r: StylesResponse) { this.styles.set(key, r); }
  __seedComponents(key: string, r: ComponentsResponse) { this.components.set(key, r); }
  __seedComponentSets(key: string, r: ComponentSetsResponse) { this.componentSets.set(key, r); }
  __seedVersions(key: string, r: VersionsResponse) { this.versions.set(key, r); }
  __seedBranches(key: string, r: BranchesResponse) { this.branches.set(key, r); }
  __seedImages(key: string, r: ImagesResponse) { this.images.set(key, r); }
  __seedImageFills(key: string, r: ImageFillsResponse) { this.imageFills.set(key, r); }
  __seedTeamProjects(team: string, r: ProjectsResponse) { this.teamProjects.set(team, r); }
  __seedProjectFiles(project: string, r: ProjectFilesResponse) {
    this.projectFiles.set(project, r);
  }
  __seedTeamComponents(team: string, r: TeamComponentsResponse) {
    this.teamComponents.set(team, r);
  }
  __seedTeamStyles(team: string, r: TeamStylesResponse) { this.teamStyles.set(team, r); }
  __seedDevResources(key: string, r: readonly DevResource[]) {
    this.devResources.set(key, [...r]);
  }

  // ---- read methods ----
  async getMe(): Promise<UserMeResponse> {
    if (!this.me) throw noAuth("no FIGMA_API_KEY user seeded");
    return this.me;
  }

  async getFile(fileKey: string): Promise<FigmaFile> {
    const f = this.files.get(fileKey);
    if (!f) throw notFound(`file not found: ${fileKey}`);
    return f;
  }

  async getFileNodes(fileKey: string, ids: readonly string[]): Promise<NodesResponse> {
    const f = this.files.get(fileKey);
    if (!f) throw notFound(`file not found: ${fileKey}`);
    const nodes: NodesResponse["nodes"] = {};
    const visit = (
      node: { id: string; type: string; name?: string; children?: readonly { id: string; type: string; name?: string; children?: readonly never[] }[] }
    ) => {
      if (ids.includes(node.id)) {
        nodes[node.id] = { document: { id: node.id, type: node.type, name: node.name } };
      }
      for (const c of node.children ?? []) visit(c);
    };
    visit(f.document);
    for (const id of ids) if (!(id in nodes)) nodes[id] = null;
    return { nodes };
  }

  async getFilePages(fileKey: string): Promise<readonly PageSummary[]> {
    const f = await this.getFile(fileKey);
    return (f.document.children ?? [])
      .filter((c) => c.type === "CANVAS")
      .map((c) => ({ id: c.id, name: c.name ?? "" }));
  }

  async getFileStyles(fileKey: string): Promise<StylesResponse> {
    const r = this.styles.get(fileKey);
    if (!r) throw notFound(`styles not found: ${fileKey}`);
    return r;
  }

  async getFileComponents(fileKey: string): Promise<ComponentsResponse> {
    const r = this.components.get(fileKey);
    if (!r) throw notFound(`components not found: ${fileKey}`);
    return r;
  }

  async getFileComponentSets(fileKey: string): Promise<ComponentSetsResponse> {
    const r = this.componentSets.get(fileKey);
    if (!r) throw notFound(`component_sets not found: ${fileKey}`);
    return r;
  }

  async getFileVersions(fileKey: string): Promise<VersionsResponse> {
    const r = this.versions.get(fileKey);
    if (!r) throw notFound(`versions not found: ${fileKey}`);
    return r;
  }

  async getFileBranches(fileKey: string): Promise<BranchesResponse> {
    const r = this.branches.get(fileKey);
    if (!r) throw notFound(`branches not found: ${fileKey}`);
    return r;
  }

  async getImages(
    fileKey: string,
    _opts: { ids: readonly string[]; format?: string; scale?: number }
  ): Promise<ImagesResponse> {
    const r = this.images.get(fileKey);
    if (!r) throw notFound(`images not found: ${fileKey}`);
    return r;
  }

  async getImageFills(fileKey: string): Promise<ImageFillsResponse> {
    const r = this.imageFills.get(fileKey);
    if (!r) throw notFound(`image_fills not found: ${fileKey}`);
    return r;
  }

  async getFileComments(fileKey: string): Promise<CommentsResponse> {
    if (!this.files.has(fileKey)) throw notFound(`file not found: ${fileKey}`);
    return { comments: this.comments.get(fileKey) ?? [] };
  }

  async postFileComment(
    fileKey: string,
    msg: { message: string; client_meta?: { x: number; y: number } }
  ): Promise<Comment> {
    if (!this.files.has(fileKey)) throw notFound(`file not found: ${fileKey}`);
    const c: Comment = {
      id: `c${++this.commentCounter}`,
      message: msg.message,
      file_key: fileKey,
      parent_id: "",
      user: { handle: "fake-user" },
      created_at: "2026-01-01T00:00:00Z",
      ...(msg.client_meta ? { client_meta: msg.client_meta } : {}),
    };
    const list = this.comments.get(fileKey) ?? [];
    list.push(c);
    this.comments.set(fileKey, list);
    return c;
  }

  async deleteFileComment(fileKey: string, commentId: string): Promise<void> {
    if (!this.files.has(fileKey)) throw notFound(`file not found: ${fileKey}`);
    const list = this.comments.get(fileKey) ?? [];
    const idx = list.findIndex((c) => c.id === commentId);
    if (idx === -1) throw notFound(`comment not found: ${commentId}`);
    list.splice(idx, 1);
    this.comments.set(fileKey, list);
  }

  async getTeamProjects(teamId: string): Promise<ProjectsResponse> {
    const r = this.teamProjects.get(teamId);
    if (!r) throw notFound(`team not found: ${teamId}`);
    return r;
  }

  async getProjectFiles(projectId: string): Promise<ProjectFilesResponse> {
    const r = this.projectFiles.get(projectId);
    if (!r) throw notFound(`project not found: ${projectId}`);
    return r;
  }

  async getTeamComponents(teamId: string): Promise<TeamComponentsResponse> {
    const r = this.teamComponents.get(teamId);
    if (!r) throw notFound(`team not found: ${teamId}`);
    return r;
  }

  async getTeamStyles(teamId: string): Promise<TeamStylesResponse> {
    const r = this.teamStyles.get(teamId);
    if (!r) throw notFound(`team not found: ${teamId}`);
    return r;
  }

  async getDevResources(
    fileKey: string,
    _opts: { node_ids?: readonly string[] } = {}
  ): Promise<DevResourcesResponse> {
    if (!this.files.has(fileKey)) throw notFound(`file not found: ${fileKey}`);
    return { dev_resources: this.devResources.get(fileKey) ?? [] };
  }

  async postDevResources(
    resources: readonly DevResourceInput[]
  ): Promise<DevResourcesResponse> {
    const created: DevResource[] = resources.map((r) => ({
      id: `dr${++this.devResourceCounter}`,
      file_key: r.file_key,
      node_id: r.node_id,
      name: r.name,
      url: r.url,
    }));
    for (const c of created) {
      const list = this.devResources.get(c.file_key) ?? [];
      list.push(c);
      this.devResources.set(c.file_key, list);
    }
    return { dev_resources: created };
  }
}
```

> The fake's surface MUST match `FigmaApiClient` structurally. **No interface ceremony** — the tools-rest server-handlers accept either via duck typing on a shared `FigmaApi` type alias declared in the next step.

**Step 10: Public exports + structural type alias** — `packages/figma-api-client/src/index.ts`

```ts
import type { FigmaApiClient } from "./client";
import type { FigmaApiFake } from "./fake";

export { FigmaApiClient } from "./client";
export type { FigmaApiClientOptions } from "./client";
export { FigmaApiFake } from "./fake";
export { FigmaApiError, mapStatusToCode } from "./errors";
export type { FigmaApiErrorCode } from "./errors";
export type * from "./types";

/**
 * Structural alias used by handler signatures so either the production
 * client or the in-memory fake can be passed. Both share the same surface
 * by construction; this type encodes the contract the handlers depend on.
 */
export type FigmaApi = FigmaApiClient | FigmaApiFake;
```

**Step 11: Verify, commit**

```bash
bun install
bun run --filter @repo/figma-api-client test --coverage
git add packages/figma-api-client bun.lock
git commit -m "feat(figma-api-client): typed Figma REST client + in-memory fake"
```

---

## Task 11.3: `@repo/tools-rest` package scaffold

**Goal:** A green-light scaffold so Tasks 11.4–11.10 land cleanly. NO tools yet — just the directory, `package.json`, empty `index.ts`, empty `tools.ts`, empty `server-handlers.ts`, and a `__tests__/` directory.

> **No `plugin-handlers.ts`.** This pack is server-side only. The bridge plugin does NOT register any tools-rest handlers; the daemon's plugin-registration block does NOT call `registerPlugin` for this pack.

**Files:**

- Create: `packages/tools-rest/package.json`
- Create: `packages/tools-rest/tsconfig.json`
- Create: `packages/tools-rest/vitest.config.ts`
- Create: `packages/tools-rest/src/index.ts`
- Create: `packages/tools-rest/src/tools.ts`
- Create: `packages/tools-rest/src/server-handlers.ts`
- Create: `packages/tools-rest/src/__tests__/.gitkeep`
- Modify: `bun.lock` (via `bun install`)

**Step 1: `package.json`**

```json
{
  "name": "@repo/tools-rest",
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
    "@repo/figma-api-client": "workspace:*",
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

> Note: NO `@repo/figma-adapter` dependency. This pack does not touch the plugin-side adapter at all.

**Step 2: `tsconfig.json` and `vitest.config.ts`** — copy verbatim from `tools-extract`. Coverage thresholds `lines: 90, branches: 85, functions: 90, statements: 90`.

**Step 3: Empty source stubs**

```ts
// src/tools.ts
// Phase 11.5-11.10 add 20 tool definitions here.
export {};

// src/server-handlers.ts
// Phase 11.4 adds requireApiKey + write-tool gate helpers.
// Phase 11.5-11.10 add 20 server-handler factories here.
export {};

// src/index.ts
/**
 * @repo/tools-rest — Figma REST API-backed read tools. Server-handlers
 * only — NO plugin-handlers. Each handler calls into the `FigmaApiClient`
 * passed via `ServerHandlerContext.figmaApi`.
 *
 * Three tools mutate (`post_file_comment`, `delete_file_comment`,
 * `post_dev_resources`) and are gated on the daemon's
 * `--enable-write-tools` flag (default off; gate enforced inside the
 * handler so the catalog stays stable).
 */
export * from "./tools";
export * from "./server-handlers";
```

**Step 4: Install + verify**

```bash
bun install
bun run --filter @repo/tools-rest test
```

`vitest run --passWithNoTests` should exit 0.

**Step 5: Commit**

```bash
git add packages/tools-rest bun.lock
git commit -m "feat(tools-rest): package scaffold (no tools yet)"
```

---

## Task 11.4: Foundation — `requireApiKey` + write-tool gate helper

**Goal:** Two shared helpers used by every server-handler in this pack:

- `requireApiKey(figmaApi: FigmaApi | null | undefined, toolName: string): FigmaApi` — throws `E_FIGMA_API_KEY_MISSING` if no client is configured. Every read tool calls this first.
- `requireWriteEnabled(opts: { enableWriteTools: boolean }, toolName: string): void` — throws `E_WRITE_TOOLS_DISABLED` if write tools are off. Only the three write tools call this.

Plus the **handler-level error widening helper** `mapRestError(err: unknown): never` that converts `FigmaApiError` into a tagged `Error` whose `.message` starts with the corresponding wire code (matches the Phase 10 `E_FIGMA_EDITOR_TYPE_MISMATCH` pattern: the daemon's `toErrorEnvelope` falls through to `E_FIGMA_UNKNOWN`, but the `.message` carries the discriminator verbatim so callers can match on it).

**Files:**

- Create: `packages/tools-rest/src/guards.ts`
- Create: `packages/tools-rest/src/__tests__/guards.test.ts`
- Modify: `packages/tools-rest/src/index.ts` (re-export)

**Step 1: Failing tests** — `packages/tools-rest/src/__tests__/guards.test.ts`

```ts
import { FigmaApiError, FigmaApiFake } from "@repo/figma-api-client";
import { describe, expect, it } from "vitest";
import {
  E_FIGMA_API_KEY_MISSING,
  E_WRITE_TOOLS_DISABLED,
  mapRestError,
  requireApiKey,
  requireWriteEnabled,
} from "../guards";

describe("requireApiKey", () => {
  it("returns the client when present", () => {
    const c = new FigmaApiFake();
    expect(requireApiKey(c, "get_user_me")).toBe(c);
  });

  it("throws E_FIGMA_API_KEY_MISSING on null", () => {
    expect(() => requireApiKey(null, "get_user_me")).toThrow(/E_FIGMA_API_KEY_MISSING/);
  });

  it("throws E_FIGMA_API_KEY_MISSING on undefined", () => {
    expect(() => requireApiKey(undefined, "get_user_me")).toThrow(/E_FIGMA_API_KEY_MISSING/);
  });

  it("includes the tool name in the error message", () => {
    try {
      requireApiKey(null, "get_file_metadata");
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("get_file_metadata");
    }
  });

  it("exposes the code as a module constant", () => {
    expect(E_FIGMA_API_KEY_MISSING).toBe("E_FIGMA_API_KEY_MISSING");
  });
});

describe("requireWriteEnabled", () => {
  it("returns silently when enableWriteTools is true", () => {
    expect(() => requireWriteEnabled({ enableWriteTools: true }, "post_file_comment")).not.toThrow();
  });

  it("throws E_WRITE_TOOLS_DISABLED when enableWriteTools is false", () => {
    expect(() => requireWriteEnabled({ enableWriteTools: false }, "post_file_comment"))
      .toThrow(/E_WRITE_TOOLS_DISABLED/);
  });

  it("error message names the tool and the flag", () => {
    try {
      requireWriteEnabled({ enableWriteTools: false }, "post_file_comment");
      expect.fail("should have thrown");
    } catch (err) {
      const m = (err as Error).message;
      expect(m).toContain("post_file_comment");
      expect(m).toContain("--enable-write-tools");
    }
  });

  it("exposes the code as a module constant", () => {
    expect(E_WRITE_TOOLS_DISABLED).toBe("E_WRITE_TOOLS_DISABLED");
  });
});

describe("mapRestError", () => {
  it("re-throws FigmaApiError as Error with code: prefix", () => {
    const original = new FigmaApiError({
      status: 404,
      code: "E_FIGMA_REST_404",
      message: "file not found: xyz",
    });
    expect(() => mapRestError(original)).toThrow(/E_FIGMA_REST_404.*file not found: xyz/);
  });

  it("re-throws non-FigmaApiError unchanged", () => {
    const ordinary = new Error("boom");
    expect(() => mapRestError(ordinary)).toThrow("boom");
  });

  it("re-throws non-Error values as Error", () => {
    expect(() => mapRestError("string-rejection")).toThrow("string-rejection");
  });
});
```

Run: FAIL.

**Step 2: Implement guards** — `packages/tools-rest/src/guards.ts`

```ts
import { FigmaApiError, type FigmaApi } from "@repo/figma-api-client";

export const E_FIGMA_API_KEY_MISSING = "E_FIGMA_API_KEY_MISSING";
export const E_WRITE_TOOLS_DISABLED = "E_WRITE_TOOLS_DISABLED";

/**
 * REST-tool entry guard. Every server-handler in this pack calls
 * `requireApiKey(figmaApi, "<tool_name>")` BEFORE any work. When the
 * daemon was started without `FIGMA_API_KEY` in the environment,
 * `figmaApi` is null and this throws.
 */
export function requireApiKey(
  figmaApi: FigmaApi | null | undefined,
  toolName: string
): FigmaApi {
  if (!figmaApi) {
    throw new Error(
      `${E_FIGMA_API_KEY_MISSING}: ${toolName} requires FIGMA_API_KEY in the environment`
    );
  }
  return figmaApi;
}

/**
 * Write-tool gate. Only the three mutating tools call this:
 * `post_file_comment`, `delete_file_comment`, `post_dev_resources`.
 * The daemon constructs handlers with `enableWriteTools: false` by
 * default; `--enable-write-tools` flips it true.
 */
export function requireWriteEnabled(
  opts: { enableWriteTools: boolean },
  toolName: string
): void {
  if (!opts.enableWriteTools) {
    throw new Error(
      `${E_WRITE_TOOLS_DISABLED}: ${toolName} is gated behind --enable-write-tools (currently off)`
    );
  }
}

/**
 * Re-throw helper for handler bodies. Converts `FigmaApiError` into an
 * Error whose `.message` carries the wire code; passes other errors
 * through. Handlers wrap their REST calls in `try { … } catch (err) { mapRestError(err); }`.
 */
export function mapRestError(err: unknown): never {
  if (err instanceof FigmaApiError) {
    throw new Error(`${err.code}: ${err.message}`);
  }
  if (err instanceof Error) throw err;
  throw new Error(String(err));
}
```

**Step 3: Re-export** — append to `packages/tools-rest/src/index.ts`

```ts
export {
  E_FIGMA_API_KEY_MISSING,
  E_WRITE_TOOLS_DISABLED,
  mapRestError,
  requireApiKey,
  requireWriteEnabled,
} from "./guards";
```

**Step 4: Verify, commit**

```bash
bun run --filter @repo/tools-rest test
git add packages/tools-rest/src
git commit -m "feat(tools-rest): requireApiKey + write-tool gate guards"
```

---

## Task 11.5: `tools-rest` — file metadata reads (4 tools)

**Goal:** Four read-only file-level tools. Each has a Zod input schema, a Zod output schema (narrowed shape), and a `createXyzServerHandler({ figmaApi })` factory that closes over the client. **No write tools, no gate.** The factory pattern lets the daemon thread the client in once at registration time.

**Tools:**

- `get_file_metadata({fileKey})` → `{name, lastModified, version, role, editorType}`
- `get_file_pages({fileKey})` → `{pages: [{id, name}, ...]}`
- `get_node_by_id({fileKey, nodeId})` → `{id, type, name, found: boolean}`
- `get_file_versions({fileKey, pageSize?, before?, after?})` → `{versions: [{id, createdAt, label, description, userHandle}, ...], pagination: {prevPage?, nextPage?}}`

**Files:**

- Modify: `packages/tools-rest/src/tools.ts`
- Modify: `packages/tools-rest/src/server-handlers.ts`
- Create: `packages/tools-rest/src/__tests__/tools.test.ts`
- Create: `packages/tools-rest/src/__tests__/server-handlers.test.ts`

**Step 1: Failing tests** — `tools.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  GetFileMetadata, GetFilePages, GetFileVersions, GetNodeById,
} from "../tools";

describe("GetFileMetadata schema", () => {
  it("requires fileKey", () => {
    expect(GetFileMetadata.input.safeParse({ fileKey: "ABC" }).success).toBe(true);
    expect(GetFileMetadata.input.safeParse({}).success).toBe(false);
  });

  it("rejects empty fileKey", () => {
    expect(GetFileMetadata.input.safeParse({ fileKey: "" }).success).toBe(false);
  });

  it("output requires name + lastModified + version + role + editorType", () => {
    expect(
      GetFileMetadata.output.safeParse({
        name: "X", lastModified: "2026-01-01", version: "1",
        role: "owner", editorType: "figma",
      }).success
    ).toBe(true);
  });
});

describe("GetFilePages schema", () => {
  it("output is { pages: [{id, name}] }", () => {
    expect(
      GetFilePages.output.safeParse({ pages: [{ id: "1:0", name: "Page 1" }] }).success
    ).toBe(true);
  });
});

describe("GetNodeById schema", () => {
  it("requires fileKey + nodeId", () => {
    expect(GetNodeById.input.safeParse({ fileKey: "ABC", nodeId: "1:2" }).success).toBe(true);
    expect(GetNodeById.input.safeParse({ fileKey: "ABC" }).success).toBe(false);
  });

  it("output { id, type, name?, found }", () => {
    expect(
      GetNodeById.output.safeParse({ id: "1:2", type: "FRAME", name: "F", found: true }).success
    ).toBe(true);
    expect(
      GetNodeById.output.safeParse({ id: "missing", type: "", found: false }).success
    ).toBe(true);
  });
});

describe("GetFileVersions schema", () => {
  it("accepts optional pageSize/before/after", () => {
    expect(GetFileVersions.input.safeParse({ fileKey: "ABC" }).success).toBe(true);
    expect(
      GetFileVersions.input.safeParse({ fileKey: "ABC", pageSize: 10, before: "100", after: "50" }).success
    ).toBe(true);
  });

  it("rejects non-positive pageSize", () => {
    expect(
      GetFileVersions.input.safeParse({ fileKey: "ABC", pageSize: 0 }).success
    ).toBe(false);
  });
});
```

**Step 2: Failing tests** — `server-handlers.test.ts`

```ts
import { FigmaApiFake } from "@repo/figma-api-client";
import { describe, expect, it } from "vitest";
import {
  createGetFileMetadataServerHandler,
  createGetFilePagesServerHandler,
  createGetFileVersionsServerHandler,
  createGetNodeByIdServerHandler,
} from "../server-handlers";

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const ctx = { logger: noopLogger };

describe("get_file_metadata server handler", () => {
  it("returns narrowed metadata", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F", lastModified: "2026-01-01", version: "v9", role: "owner",
      editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    const handler = createGetFileMetadataServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r).toEqual({
      name: "F", lastModified: "2026-01-01", version: "v9",
      role: "owner", editorType: "figma",
    });
  });

  it("throws E_FIGMA_API_KEY_MISSING when no client is wired", async () => {
    const handler = createGetFileMetadataServerHandler({ figmaApi: null });
    await expect(handler({ fileKey: "ABC" }, ctx)).rejects.toThrow(/E_FIGMA_API_KEY_MISSING/);
  });

  it("propagates E_FIGMA_REST_404 when the file is missing", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createGetFileMetadataServerHandler({ figmaApi });
    await expect(handler({ fileKey: "MISSING" }, ctx)).rejects.toThrow(/E_FIGMA_REST_404/);
  });
});

describe("get_file_pages server handler", () => {
  it("returns the file's CANVAS children as pages", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: {
        id: "0:0", type: "DOCUMENT",
        children: [
          { id: "1:0", type: "CANVAS", name: "Page 1" },
          { id: "2:0", type: "CANVAS", name: "Page 2" },
        ],
      },
    });
    const handler = createGetFilePagesServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r.pages).toEqual([
      { id: "1:0", name: "Page 1" },
      { id: "2:0", name: "Page 2" },
    ]);
  });
});

describe("get_node_by_id server handler", () => {
  it("returns found: true when the node exists", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: {
        id: "0:0", type: "DOCUMENT",
        children: [{ id: "1:0", type: "CANVAS", name: "P", children: [
          { id: "2:5", type: "FRAME", name: "Hero" },
        ] }],
      },
    });
    const handler = createGetNodeByIdServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC", nodeId: "2:5" }, ctx);
    expect(r).toEqual({ id: "2:5", type: "FRAME", name: "Hero", found: true });
  });

  it("returns found: false when the node does not exist", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    const handler = createGetNodeByIdServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC", nodeId: "99:99" }, ctx);
    expect(r).toEqual({ id: "99:99", type: "", found: false });
  });
});

describe("get_file_versions server handler", () => {
  it("narrows versions + pagination", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedVersions("ABC", {
      versions: [{
        id: "v1", created_at: "2026-01-01T00:00:00Z", label: "alpha",
        description: "first", user: { handle: "j" },
      }],
      pagination: { next_page: "200" },
    });
    const handler = createGetFileVersionsServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r.versions).toEqual([{
      id: "v1", createdAt: "2026-01-01T00:00:00Z", label: "alpha",
      description: "first", userHandle: "j",
    }]);
    expect(r.pagination.nextPage).toBe("200");
  });
});
```

**Step 3: Implement schemas** — `tools.ts`

```ts
import { defineTool } from "@repo/protocol";
import { z } from "zod";

const FileKey = z.string().min(1);
const NodeId = z.string().min(1);

export const GetFileMetadata = defineTool({
  name: "get_file_metadata",
  description:
    "REST. Return narrowed metadata for a Figma file: name, lastModified, version, role, editorType.",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({
    name: z.string(),
    lastModified: z.string(),
    version: z.string(),
    role: z.string(),
    editorType: z.string(),
  }),
});

export const GetFilePages = defineTool({
  name: "get_file_pages",
  description: "REST. Return the page list (CANVAS children) of a Figma file.",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({
    pages: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

export const GetNodeById = defineTool({
  name: "get_node_by_id",
  description:
    "REST. Return the type/name of a node by id (returns found: false when the node does not exist).",
  streaming: false,
  input: z.object({ fileKey: FileKey, nodeId: NodeId }).strict(),
  output: z.object({
    id: z.string(),
    type: z.string(),
    name: z.string().optional(),
    found: z.boolean(),
  }),
});

export const GetFileVersions = defineTool({
  name: "get_file_versions",
  description:
    "REST. Return the version history of a Figma file (paginated via before/after).",
  streaming: false,
  input: z
    .object({
      fileKey: FileKey,
      pageSize: z.number().int().positive().optional(),
      before: z.string().optional(),
      after: z.string().optional(),
    })
    .strict(),
  output: z.object({
    versions: z.array(
      z.object({
        id: z.string(),
        createdAt: z.string(),
        label: z.string(),
        description: z.string(),
        userHandle: z.string(),
      })
    ),
    pagination: z.object({
      prevPage: z.string().optional(),
      nextPage: z.string().optional(),
    }),
  }),
});
```

**Step 4: Implement handlers** — `server-handlers.ts`

```ts
import type { FigmaApi } from "@repo/figma-api-client";
import type { ServerHandler } from "@repo/protocol";
import { mapRestError, requireApiKey } from "./guards";
import type {
  GetFileMetadata, GetFilePages, GetFileVersions, GetNodeById,
} from "./tools";

export interface RestDeps {
  readonly figmaApi: FigmaApi | null;
}

export function createGetFileMetadataServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileMetadata> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_metadata");
    try {
      const f = await api.getFile(args.fileKey);
      return {
        name: f.name,
        lastModified: f.lastModified,
        version: f.version,
        role: f.role,
        editorType: f.editorType,
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetFilePagesServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFilePages> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_pages");
    try {
      const pages = await api.getFilePages(args.fileKey);
      return { pages: [...pages] };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetNodeByIdServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetNodeById> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_node_by_id");
    try {
      const r = await api.getFileNodes(args.fileKey, [args.nodeId]);
      const entry = r.nodes[args.nodeId];
      if (!entry) return { id: args.nodeId, type: "", found: false };
      return {
        id: entry.document.id,
        type: entry.document.type,
        name: entry.document.name,
        found: true,
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetFileVersionsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileVersions> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_versions");
    try {
      const r = await api.getFileVersions(args.fileKey, {
        pageSize: args.pageSize,
        before: args.before,
        after: args.after,
      });
      return {
        versions: r.versions.map((v) => ({
          id: v.id,
          createdAt: v.created_at,
          label: v.label,
          description: v.description,
          userHandle: v.user.handle,
        })),
        pagination: {
          prevPage: r.pagination.prev_page,
          nextPage: r.pagination.next_page,
        },
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}
```

> Note: every handler `try { return … } catch (err) { mapRestError(err); }`. The `mapRestError` `never`-return tells TS the catch branch doesn't fall through, so the implicit-return shape stays correct.

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-rest test
git add packages/tools-rest/src
git commit -m "feat(tools-rest): file metadata reads (4 tools)"
```

---

## Task 11.6: `tools-rest` — file styles + components (4 tools)

**Goal:**

- `get_file_styles({fileKey})` → `{paint: [...], text: [...], effect: [...], grid: [...]}` — narrowed by `style_type`.
- `get_file_components({fileKey})` → `{components: [{key, name, description, nodeId?}, ...]}`
- `get_file_component_sets({fileKey})` → `{componentSets: [{key, name, description, nodeId?}, ...]}`
- `get_file_branches({fileKey})` → `{mainFileKey, branches: [{key, name, lastModified}, ...]}`

**Files:**

- Modify: `packages/tools-rest/src/tools.ts`
- Modify: `packages/tools-rest/src/server-handlers.ts`
- Modify: `packages/tools-rest/src/__tests__/tools.test.ts`
- Modify: `packages/tools-rest/src/__tests__/server-handlers.test.ts`

**Step 1: Failing schema tests** — append to `tools.test.ts`

```ts
import {
  GetFileBranches, GetFileComponentSets, GetFileComponents, GetFileStyles,
} from "../tools";

describe("GetFileStyles schema", () => {
  it("input requires fileKey", () => {
    expect(GetFileStyles.input.safeParse({ fileKey: "ABC" }).success).toBe(true);
  });

  it("output is bucketed by style_type", () => {
    expect(
      GetFileStyles.output.safeParse({ paint: [], text: [], effect: [], grid: [] }).success
    ).toBe(true);
  });
});

describe("GetFileComponents schema", () => {
  it("output is { components: [...] }", () => {
    expect(
      GetFileComponents.output.safeParse({
        components: [{ key: "k", name: "n", description: "" }],
      }).success
    ).toBe(true);
  });
});

describe("GetFileComponentSets schema", () => {
  it("output is { componentSets: [...] }", () => {
    expect(
      GetFileComponentSets.output.safeParse({
        componentSets: [{ key: "k", name: "n", description: "" }],
      }).success
    ).toBe(true);
  });
});

describe("GetFileBranches schema", () => {
  it("output is { mainFileKey, branches: [...] }", () => {
    expect(
      GetFileBranches.output.safeParse({
        mainFileKey: "ABC", branches: [],
      }).success
    ).toBe(true);
  });
});
```

**Step 2: Failing handler tests** — append to `server-handlers.test.ts`

```ts
import {
  createGetFileBranchesServerHandler,
  createGetFileComponentSetsServerHandler,
  createGetFileComponentsServerHandler,
  createGetFileStylesServerHandler,
} from "../server-handlers";

describe("get_file_styles server handler", () => {
  it("buckets paint/text/effect/grid", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedStyles("ABC", {
      meta: {
        styles: [
          { key: "p1", name: "Brand", description: "", style_type: "FILL" },
          { key: "t1", name: "Heading", description: "", style_type: "TEXT" },
          { key: "e1", name: "Drop", description: "", style_type: "EFFECT" },
          { key: "g1", name: "Cols", description: "", style_type: "GRID" },
        ],
      },
    });
    const handler = createGetFileStylesServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r.paint).toHaveLength(1);
    expect(r.text).toHaveLength(1);
    expect(r.effect).toHaveLength(1);
    expect(r.grid).toHaveLength(1);
  });

  it("E_FIGMA_API_KEY_MISSING propagates", async () => {
    const handler = createGetFileStylesServerHandler({ figmaApi: null });
    await expect(handler({ fileKey: "ABC" }, ctx)).rejects.toThrow(/E_FIGMA_API_KEY_MISSING/);
  });
});

describe("get_file_components server handler", () => {
  it("narrows the meta.components list", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedComponents("ABC", {
      meta: {
        components: [
          { key: "k1", name: "Btn", description: "primary", node_id: "5:1" },
        ],
      },
    });
    const handler = createGetFileComponentsServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r.components).toEqual([
      { key: "k1", name: "Btn", description: "primary", nodeId: "5:1" },
    ]);
  });
});

describe("get_file_component_sets server handler", () => {
  it("narrows the meta.component_sets list", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedComponentSets("ABC", {
      meta: { component_sets: [{ key: "cs1", name: "Btn/", description: "" }] },
    });
    const handler = createGetFileComponentSetsServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r.componentSets).toHaveLength(1);
  });
});

describe("get_file_branches server handler", () => {
  it("returns mainFileKey + narrowed branches", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedBranches("ABC", {
      main_file_key: "ABC",
      branches: [
        { key: "B1", name: "feat", thumbnail_url: "", last_modified: "x", link_access: "" },
      ],
    });
    const handler = createGetFileBranchesServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r.mainFileKey).toBe("ABC");
    expect(r.branches).toEqual([{ key: "B1", name: "feat", lastModified: "x" }]);
  });
});
```

**Step 3: Implement schemas** — append to `tools.ts`

```ts
const StyleSummary = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  nodeId: z.string().optional(),
});

export const GetFileStyles = defineTool({
  name: "get_file_styles",
  description:
    "REST. Return the file's local styles bucketed by type (paint/text/effect/grid).",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({
    paint: z.array(StyleSummary),
    text: z.array(StyleSummary),
    effect: z.array(StyleSummary),
    grid: z.array(StyleSummary),
  }),
});

const ComponentSummary = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  nodeId: z.string().optional(),
});

export const GetFileComponents = defineTool({
  name: "get_file_components",
  description: "REST. Return the file's published components.",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({ components: z.array(ComponentSummary) }),
});

export const GetFileComponentSets = defineTool({
  name: "get_file_component_sets",
  description: "REST. Return the file's published component sets (variants).",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({ componentSets: z.array(ComponentSummary) }),
});

export const GetFileBranches = defineTool({
  name: "get_file_branches",
  description: "REST. Return the file's branches.",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({
    mainFileKey: z.string(),
    branches: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        lastModified: z.string(),
      })
    ),
  }),
});
```

**Step 4: Implement handlers** — append to `server-handlers.ts`

```ts
import type {
  GetFileBranches, GetFileComponentSets, GetFileComponents, GetFileStyles,
} from "./tools";

export function createGetFileStylesServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileStyles> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_styles");
    try {
      const r = await api.getFileStyles(args.fileKey);
      const out = { paint: [] as unknown[], text: [] as unknown[], effect: [] as unknown[], grid: [] as unknown[] };
      for (const s of r.meta.styles) {
        const summary = { key: s.key, name: s.name, description: s.description, nodeId: s.node_id };
        if (s.style_type === "FILL") out.paint.push(summary);
        else if (s.style_type === "TEXT") out.text.push(summary);
        else if (s.style_type === "EFFECT") out.effect.push(summary);
        else if (s.style_type === "GRID") out.grid.push(summary);
      }
      return out as never;
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetFileComponentsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileComponents> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_components");
    try {
      const r = await api.getFileComponents(args.fileKey);
      return {
        components: r.meta.components.map((c) => ({
          key: c.key, name: c.name, description: c.description, nodeId: c.node_id,
        })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetFileComponentSetsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileComponentSets> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_component_sets");
    try {
      const r = await api.getFileComponentSets(args.fileKey);
      return {
        componentSets: r.meta.component_sets.map((c) => ({
          key: c.key, name: c.name, description: c.description, nodeId: c.node_id,
        })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetFileBranchesServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileBranches> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_branches");
    try {
      const r = await api.getFileBranches(args.fileKey);
      return {
        mainFileKey: r.main_file_key,
        branches: r.branches.map((b) => ({
          key: b.key, name: b.name, lastModified: b.last_modified,
        })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-rest test
git add packages/tools-rest/src
git commit -m "feat(tools-rest): file styles + components (4 tools)"
```

---

## Task 11.7: `tools-rest` — images + image fills + user me (3 tools)

**Goal:**

- `get_image_renders({fileKey, nodeIds, format?, scale?})` → `{images: {<nodeId>: <url> | null}}` — Figma renders selected nodes as PNG/SVG/PDF/JPG and returns presigned URLs.
- `get_image_fills({fileKey})` → `{images: Record<string, string>}` — image fill assets for the file.
- `get_user_me({})` → `{id, email, handle, imgUrl}`

**Files:**

- Modify: `packages/tools-rest/src/tools.ts`
- Modify: `packages/tools-rest/src/server-handlers.ts`
- Modify: `packages/tools-rest/src/__tests__/tools.test.ts`
- Modify: `packages/tools-rest/src/__tests__/server-handlers.test.ts`

**Step 1: Failing schema tests** — append to `tools.test.ts`

```ts
import { GetImageFills, GetImageRenders, GetUserMe } from "../tools";

describe("GetImageRenders schema", () => {
  it("requires fileKey + non-empty nodeIds", () => {
    expect(
      GetImageRenders.input.safeParse({ fileKey: "ABC", nodeIds: ["1:2"] }).success
    ).toBe(true);
    expect(
      GetImageRenders.input.safeParse({ fileKey: "ABC", nodeIds: [] }).success
    ).toBe(false);
  });

  it("accepts known formats", () => {
    for (const format of ["png", "svg", "pdf", "jpg"]) {
      expect(
        GetImageRenders.input.safeParse({ fileKey: "ABC", nodeIds: ["1:2"], format }).success
      ).toBe(true);
    }
  });

  it("rejects unknown formats", () => {
    expect(
      GetImageRenders.input.safeParse({ fileKey: "ABC", nodeIds: ["1:2"], format: "tiff" }).success
    ).toBe(false);
  });

  it("rejects non-positive scale", () => {
    expect(
      GetImageRenders.input.safeParse({ fileKey: "ABC", nodeIds: ["1:2"], scale: 0 }).success
    ).toBe(false);
  });
});

describe("GetImageFills schema", () => {
  it("requires fileKey", () => {
    expect(GetImageFills.input.safeParse({ fileKey: "ABC" }).success).toBe(true);
  });
});

describe("GetUserMe schema", () => {
  it("input is empty", () => {
    expect(GetUserMe.input.safeParse({}).success).toBe(true);
  });

  it("output is { id, email, handle, imgUrl }", () => {
    expect(
      GetUserMe.output.safeParse({ id: "u", email: "x@y", handle: "j", imgUrl: "" }).success
    ).toBe(true);
  });
});
```

**Step 2: Failing handler tests** — append to `server-handlers.test.ts`

```ts
import {
  createGetImageFillsServerHandler,
  createGetImageRendersServerHandler,
  createGetUserMeServerHandler,
} from "../server-handlers";

describe("get_image_renders server handler", () => {
  it("returns the seeded image map", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedImages("ABC", {
      err: null,
      images: { "1:2": "http://cdn/asset.png", "1:3": null },
    });
    const handler = createGetImageRendersServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC", nodeIds: ["1:2", "1:3"], format: "png" }, ctx);
    expect(r.images["1:2"]).toBe("http://cdn/asset.png");
    expect(r.images["1:3"]).toBeNull();
  });
});

describe("get_image_fills server handler", () => {
  it("returns the seeded fills", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedImageFills("ABC", {
      meta: { images: { hash1: "http://cdn/h1" } },
      error: false, status: 200,
    });
    const handler = createGetImageFillsServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r.images.hash1).toBe("http://cdn/h1");
  });
});

describe("get_user_me server handler", () => {
  it("returns the seeded user", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedMe({ id: "u1", email: "x@y", handle: "Jonas", img_url: "http://i" });
    const handler = createGetUserMeServerHandler({ figmaApi });
    const r = await handler({}, ctx);
    expect(r).toEqual({ id: "u1", email: "x@y", handle: "Jonas", imgUrl: "http://i" });
  });
});
```

**Step 3: Implement schemas** — append to `tools.ts`

```ts
export const GetImageRenders = defineTool({
  name: "get_image_renders",
  description:
    "REST. Render specified nodes as PNG/SVG/PDF/JPG and return presigned URLs.",
  streaming: false,
  input: z
    .object({
      fileKey: FileKey,
      nodeIds: z.array(NodeId).min(1),
      format: z.enum(["png", "svg", "pdf", "jpg"]).optional(),
      scale: z.number().positive().optional(),
    })
    .strict(),
  output: z.object({
    images: z.record(z.string().nullable()),
  }),
});

export const GetImageFills = defineTool({
  name: "get_image_fills",
  description: "REST. Return the file's image fill asset URLs (by hash).",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({ images: z.record(z.string()) }),
});

export const GetUserMe = defineTool({
  name: "get_user_me",
  description: "REST. Return the authenticated user's profile.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({
    id: z.string(),
    email: z.string(),
    handle: z.string(),
    imgUrl: z.string(),
  }),
});
```

**Step 4: Implement handlers** — append to `server-handlers.ts`

```ts
import type { GetImageFills, GetImageRenders, GetUserMe } from "./tools";

export function createGetImageRendersServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetImageRenders> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_image_renders");
    try {
      const r = await api.getImages(args.fileKey, {
        ids: args.nodeIds,
        format: args.format,
        scale: args.scale,
      });
      return { images: r.images };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetImageFillsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetImageFills> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_image_fills");
    try {
      const r = await api.getImageFills(args.fileKey);
      return { images: r.meta.images };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetUserMeServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetUserMe> {
  return async (_args) => {
    const api = requireApiKey(deps.figmaApi, "get_user_me");
    try {
      const me = await api.getMe();
      return { id: me.id, email: me.email, handle: me.handle, imgUrl: me.img_url };
    } catch (err) {
      mapRestError(err);
    }
  };
}
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-rest test
git add packages/tools-rest/src
git commit -m "feat(tools-rest): images + image fills + user me (3 tools)"
```

---

## Task 11.8: `tools-rest` — comments (3 tools, 2 write-gated)

**Goal:**

- `get_file_comments({fileKey})` → `{comments: [{id, message, parentId, userHandle, createdAt}, ...]}` — read.
- `post_file_comment({fileKey, message, x?, y?})` → `{id, message, parentId, userHandle, createdAt}` — **write-gated**.
- `delete_file_comment({fileKey, commentId})` → `{ok: true}` — **write-gated**.

**Safety posture:** A naive AI prompt could spam comments on a real file. The `--enable-write-tools` flag is the **opt-in mechanism**. Default behavior: tool registered (so the catalog is stable across modes), handler throws `E_WRITE_TOOLS_DISABLED` immediately on call. Doctor's `ai-client-configs` check (Phase 7) should call out the flag if present in any client's config.

**Files:**

- Modify: `packages/tools-rest/src/tools.ts`
- Modify: `packages/tools-rest/src/server-handlers.ts`
- Modify: `packages/tools-rest/src/__tests__/tools.test.ts`
- Modify: `packages/tools-rest/src/__tests__/server-handlers.test.ts`

**Step 1: Failing schema tests** — append to `tools.test.ts`

```ts
import { DeleteFileComment, GetFileComments, PostFileComment } from "../tools";

describe("GetFileComments schema", () => {
  it("requires fileKey", () => {
    expect(GetFileComments.input.safeParse({ fileKey: "ABC" }).success).toBe(true);
  });

  it("output { comments: [...] }", () => {
    expect(GetFileComments.output.safeParse({ comments: [] }).success).toBe(true);
  });
});

describe("PostFileComment schema", () => {
  it("requires fileKey + message", () => {
    expect(
      PostFileComment.input.safeParse({ fileKey: "ABC", message: "hi" }).success
    ).toBe(true);
    expect(
      PostFileComment.input.safeParse({ fileKey: "ABC" }).success
    ).toBe(false);
  });

  it("rejects empty message", () => {
    expect(
      PostFileComment.input.safeParse({ fileKey: "ABC", message: "" }).success
    ).toBe(false);
  });

  it("accepts optional x/y pin", () => {
    expect(
      PostFileComment.input.safeParse({ fileKey: "ABC", message: "x", x: 10, y: 20 }).success
    ).toBe(true);
  });
});

describe("DeleteFileComment schema", () => {
  it("requires fileKey + commentId", () => {
    expect(
      DeleteFileComment.input.safeParse({ fileKey: "ABC", commentId: "c1" }).success
    ).toBe(true);
  });

  it("output is { ok: true }", () => {
    expect(DeleteFileComment.output.safeParse({ ok: true }).success).toBe(true);
  });
});
```

**Step 2: Failing handler tests** — append to `server-handlers.test.ts`

```ts
import {
  createDeleteFileCommentServerHandler,
  createGetFileCommentsServerHandler,
  createPostFileCommentServerHandler,
} from "../server-handlers";

describe("get_file_comments server handler", () => {
  it("returns narrowed comments", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    await figmaApi.postFileComment("ABC", { message: "first" });
    const handler = createGetFileCommentsServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r.comments).toHaveLength(1);
    expect(r.comments[0].message).toBe("first");
    expect(r.comments[0].userHandle).toBe("fake-user");
  });
});

describe("post_file_comment server handler", () => {
  it("returns E_WRITE_TOOLS_DISABLED when the gate is closed", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createPostFileCommentServerHandler({ figmaApi, enableWriteTools: false });
    await expect(
      handler({ fileKey: "ABC", message: "hi" }, ctx)
    ).rejects.toThrow(/E_WRITE_TOOLS_DISABLED/);
  });

  it("posts when the gate is open", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    const handler = createPostFileCommentServerHandler({ figmaApi, enableWriteTools: true });
    const r = await handler({ fileKey: "ABC", message: "hi" }, ctx);
    expect(r.message).toBe("hi");
    expect(r.id).toMatch(/^c/);
  });

  it("E_FIGMA_API_KEY_MISSING precedes the write-gate check", async () => {
    const handler = createPostFileCommentServerHandler({ figmaApi: null, enableWriteTools: true });
    await expect(
      handler({ fileKey: "ABC", message: "hi" }, ctx)
    ).rejects.toThrow(/E_FIGMA_API_KEY_MISSING/);
  });
});

describe("delete_file_comment server handler", () => {
  it("returns E_WRITE_TOOLS_DISABLED when the gate is closed", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createDeleteFileCommentServerHandler({ figmaApi, enableWriteTools: false });
    await expect(
      handler({ fileKey: "ABC", commentId: "c1" }, ctx)
    ).rejects.toThrow(/E_WRITE_TOOLS_DISABLED/);
  });

  it("deletes when gate is open and the comment exists", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    const c = await figmaApi.postFileComment("ABC", { message: "x" });
    const handler = createDeleteFileCommentServerHandler({ figmaApi, enableWriteTools: true });
    const r = await handler({ fileKey: "ABC", commentId: c.id }, ctx);
    expect(r).toEqual({ ok: true });
    const list = await figmaApi.getFileComments("ABC");
    expect(list.comments).toEqual([]);
  });

  it("propagates E_FIGMA_REST_404 for unknown commentId", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    const handler = createDeleteFileCommentServerHandler({ figmaApi, enableWriteTools: true });
    await expect(
      handler({ fileKey: "ABC", commentId: "missing" }, ctx)
    ).rejects.toThrow(/E_FIGMA_REST_404/);
  });
});
```

> **Test ordering note:** the `requireApiKey` check fires before `requireWriteEnabled`. This ordering is intentional and tested above — a missing key is a configuration error (always fatal) while a closed write gate is an operational policy (only relevant if writes are attempted). Surfacing the lower-level config error first gives operators a clearer signal.

**Step 3: Implement schemas** — append to `tools.ts`

```ts
const CommentSummary = z.object({
  id: z.string(),
  message: z.string(),
  parentId: z.string().optional(),
  userHandle: z.string(),
  createdAt: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const GetFileComments = defineTool({
  name: "get_file_comments",
  description: "REST. Return the file's comments.",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({ comments: z.array(CommentSummary) }),
});

export const PostFileComment = defineTool({
  name: "post_file_comment",
  description:
    "REST. Post a new comment. WRITE — gated behind --enable-write-tools (default off).",
  streaming: false,
  input: z
    .object({
      fileKey: FileKey,
      message: z.string().min(1),
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .strict(),
  output: CommentSummary,
});

export const DeleteFileComment = defineTool({
  name: "delete_file_comment",
  description:
    "REST. Delete a comment. WRITE — gated behind --enable-write-tools (default off).",
  streaming: false,
  input: z.object({ fileKey: FileKey, commentId: z.string().min(1) }).strict(),
  output: z.object({ ok: z.literal(true) }),
});
```

**Step 4: Implement handlers** — append to `server-handlers.ts`

```ts
import { requireWriteEnabled } from "./guards";
import type { DeleteFileComment, GetFileComments, PostFileComment } from "./tools";

export interface RestWriteDeps extends RestDeps {
  readonly enableWriteTools: boolean;
}

const narrowComment = (c: {
  id: string; message: string; parent_id?: string;
  user: { handle: string }; created_at: string;
  client_meta?: { x: number; y: number };
}) => ({
  id: c.id, message: c.message,
  parentId: c.parent_id || undefined,
  userHandle: c.user.handle,
  createdAt: c.created_at,
  x: c.client_meta?.x, y: c.client_meta?.y,
});

export function createGetFileCommentsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileComments> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_comments");
    try {
      const r = await api.getFileComments(args.fileKey);
      return { comments: r.comments.map(narrowComment) };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createPostFileCommentServerHandler(
  deps: RestWriteDeps
): ServerHandler<typeof PostFileComment> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "post_file_comment");
    requireWriteEnabled(deps, "post_file_comment");
    try {
      const c = await api.postFileComment(args.fileKey, {
        message: args.message,
        ...(args.x !== undefined && args.y !== undefined
          ? { client_meta: { x: args.x, y: args.y } }
          : {}),
      });
      return narrowComment(c);
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createDeleteFileCommentServerHandler(
  deps: RestWriteDeps
): ServerHandler<typeof DeleteFileComment> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "delete_file_comment");
    requireWriteEnabled(deps, "delete_file_comment");
    try {
      await api.deleteFileComment(args.fileKey, args.commentId);
      return { ok: true as const };
    } catch (err) {
      mapRestError(err);
    }
  };
}
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-rest test
git add packages/tools-rest/src
git commit -m "feat(tools-rest): comments (3 tools, 2 write-gated)"
```

---

## Task 11.9: `tools-rest` — team + project (3 tools, cursor-paginated)

**Goal:**

- `get_team_projects({teamId})` → `{name, projects: [{id, name}, ...]}`
- `get_project_files({projectId, branchData?})` → `{name, files: [{key, name, lastModified}, ...]}`
- `get_team_components({teamId, pageSize?, cursor?})` → `{components: [...], nextCursor?: string}`

**Pagination shape decision (judgment call surfaced explicitly):** Figma exposes two paging styles — `cursor` (team_components, team_styles) and `before`/`after` (file_versions). Tool outputs use `{items, nextCursor}` everywhere except the file_versions tool, which already shipped in 11.5 with `{prevPage, nextPage}` — that was a one-off because the underlying endpoint's `before`/`after` are themselves cursors-by-another-name. **Adopted: `{items, nextCursor}` for all cursor-style endpoints; `{prevPage, nextPage}` for the before/after style endpoint.** This trades a tiny inconsistency for output shape that closely tracks each endpoint's natural semantics.

**Files:**

- Modify: `packages/tools-rest/src/tools.ts`
- Modify: `packages/tools-rest/src/server-handlers.ts`
- Modify: `packages/tools-rest/src/__tests__/tools.test.ts`
- Modify: `packages/tools-rest/src/__tests__/server-handlers.test.ts`

**Step 1: Failing schema tests** — append to `tools.test.ts`

```ts
import { GetProjectFiles, GetTeamComponents, GetTeamProjects } from "../tools";

describe("GetTeamProjects schema", () => {
  it("requires teamId", () => {
    expect(GetTeamProjects.input.safeParse({ teamId: "T1" }).success).toBe(true);
  });

  it("output { name, projects: [...] }", () => {
    expect(
      GetTeamProjects.output.safeParse({
        name: "Team", projects: [{ id: "P1", name: "Web" }],
      }).success
    ).toBe(true);
  });
});

describe("GetProjectFiles schema", () => {
  it("requires projectId", () => {
    expect(GetProjectFiles.input.safeParse({ projectId: "P1" }).success).toBe(true);
  });

  it("output { name, files: [...] }", () => {
    expect(
      GetProjectFiles.output.safeParse({
        name: "Web",
        files: [{ key: "ABC", name: "Home", lastModified: "x" }],
      }).success
    ).toBe(true);
  });
});

describe("GetTeamComponents schema", () => {
  it("accepts optional pageSize + cursor", () => {
    expect(
      GetTeamComponents.input.safeParse({ teamId: "T1", pageSize: 30, cursor: "c1" }).success
    ).toBe(true);
  });

  it("output { components, nextCursor? }", () => {
    expect(
      GetTeamComponents.output.safeParse({
        components: [{ key: "k", name: "n", description: "" }],
        nextCursor: "after:100",
      }).success
    ).toBe(true);
    expect(
      GetTeamComponents.output.safeParse({ components: [] }).success
    ).toBe(true);
  });
});
```

**Step 2: Failing handler tests** — append to `server-handlers.test.ts`

```ts
import {
  createGetProjectFilesServerHandler,
  createGetTeamComponentsServerHandler,
  createGetTeamProjectsServerHandler,
} from "../server-handlers";

describe("get_team_projects server handler", () => {
  it("returns the seeded projects", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedTeamProjects("T1", {
      name: "Team", projects: [{ id: "P1", name: "Web" }],
    });
    const handler = createGetTeamProjectsServerHandler({ figmaApi });
    expect(await handler({ teamId: "T1" }, ctx)).toEqual({
      name: "Team", projects: [{ id: "P1", name: "Web" }],
    });
  });
});

describe("get_project_files server handler", () => {
  it("narrows the file list", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedProjectFiles("P1", {
      name: "Web",
      files: [{ key: "ABC", name: "Home", thumbnail_url: "", last_modified: "y" }],
    });
    const handler = createGetProjectFilesServerHandler({ figmaApi });
    const r = await handler({ projectId: "P1" }, ctx);
    expect(r.files).toEqual([{ key: "ABC", name: "Home", lastModified: "y" }]);
  });
});

describe("get_team_components server handler", () => {
  it("forwards cursor + pageSize and surfaces nextCursor", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedTeamComponents("T1", {
      meta: {
        components: [{ key: "k1", name: "n", description: "" }],
        cursor: { after: 100 },
      },
    });
    const handler = createGetTeamComponentsServerHandler({ figmaApi });
    const r = await handler({ teamId: "T1", pageSize: 50 }, ctx);
    expect(r.components).toHaveLength(1);
    expect(r.nextCursor).toBe("100");
  });

  it("omits nextCursor when none is returned", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedTeamComponents("T1", {
      meta: { components: [], cursor: undefined },
    });
    const handler = createGetTeamComponentsServerHandler({ figmaApi });
    const r = await handler({ teamId: "T1" }, ctx);
    expect(r.nextCursor).toBeUndefined();
  });
});
```

**Step 3: Implement schemas** — append to `tools.ts`

```ts
export const GetTeamProjects = defineTool({
  name: "get_team_projects",
  description: "REST. Return all projects in a team.",
  streaming: false,
  input: z.object({ teamId: z.string().min(1) }).strict(),
  output: z.object({
    name: z.string(),
    projects: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

export const GetProjectFiles = defineTool({
  name: "get_project_files",
  description: "REST. Return all files in a project.",
  streaming: false,
  input: z
    .object({
      projectId: z.string().min(1),
      branchData: z.boolean().optional(),
    })
    .strict(),
  output: z.object({
    name: z.string(),
    files: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        lastModified: z.string(),
      })
    ),
  }),
});

export const GetTeamComponents = defineTool({
  name: "get_team_components",
  description:
    "REST. Return team components (cursor-paginated). Pass nextCursor as cursor to fetch the next page.",
  streaming: false,
  input: z
    .object({
      teamId: z.string().min(1),
      pageSize: z.number().int().positive().optional(),
      cursor: z.string().optional(),
    })
    .strict(),
  output: z.object({
    components: z.array(ComponentSummary),
    nextCursor: z.string().optional(),
  }),
});
```

**Step 4: Implement handlers** — append to `server-handlers.ts`

```ts
import type { GetProjectFiles, GetTeamComponents, GetTeamProjects } from "./tools";

export function createGetTeamProjectsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetTeamProjects> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_team_projects");
    try {
      const r = await api.getTeamProjects(args.teamId);
      return {
        name: r.name,
        projects: r.projects.map((p) => ({ id: p.id, name: p.name })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetProjectFilesServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetProjectFiles> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_project_files");
    try {
      const r = await api.getProjectFiles(args.projectId, {
        branch_data: args.branchData,
      });
      return {
        name: r.name,
        files: r.files.map((f) => ({
          key: f.key, name: f.name, lastModified: f.last_modified,
        })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetTeamComponentsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetTeamComponents> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_team_components");
    try {
      const r = await api.getTeamComponents(args.teamId, {
        pageSize: args.pageSize,
        cursor: args.cursor,
      });
      const next = r.meta.cursor?.after;
      return {
        components: r.meta.components.map((c) => ({
          key: c.key, name: c.name, description: c.description, nodeId: c.node_id,
        })),
        ...(next !== undefined ? { nextCursor: String(next) } : {}),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-rest test
git add packages/tools-rest/src
git commit -m "feat(tools-rest): team + project tools (3 tools)"
```

---

## Task 11.10: `tools-rest` — team styles + dev resources (3 tools, 1 write-gated)

**Goal:**

- `get_team_styles({teamId, pageSize?, cursor?})` → `{styles: [...], nextCursor?: string}` — cursor-paginated.
- `get_dev_resources({fileKey, nodeIds?})` → `{devResources: [{id, fileKey, nodeId, name, url}, ...]}` — read.
- `post_dev_resources({resources: [...]})` → `{devResources: [...]}` — **write-gated**.

**Files:**

- Modify: `packages/tools-rest/src/tools.ts`
- Modify: `packages/tools-rest/src/server-handlers.ts`
- Modify: `packages/tools-rest/src/__tests__/tools.test.ts`
- Modify: `packages/tools-rest/src/__tests__/server-handlers.test.ts`

**Step 1: Failing schema tests** — append to `tools.test.ts`

```ts
import { GetDevResources, GetTeamStyles, PostDevResources } from "../tools";

describe("GetTeamStyles schema", () => {
  it("accepts optional pageSize + cursor", () => {
    expect(
      GetTeamStyles.input.safeParse({ teamId: "T1", pageSize: 25, cursor: "c1" }).success
    ).toBe(true);
  });

  it("output { styles, nextCursor? }", () => {
    expect(
      GetTeamStyles.output.safeParse({ styles: [], nextCursor: "200" }).success
    ).toBe(true);
  });
});

describe("GetDevResources schema", () => {
  it("requires fileKey", () => {
    expect(GetDevResources.input.safeParse({ fileKey: "ABC" }).success).toBe(true);
  });

  it("accepts optional nodeIds filter", () => {
    expect(
      GetDevResources.input.safeParse({ fileKey: "ABC", nodeIds: ["1:2"] }).success
    ).toBe(true);
  });

  it("output { devResources: [...] }", () => {
    expect(
      GetDevResources.output.safeParse({
        devResources: [{ id: "dr1", fileKey: "ABC", nodeId: "1:2", name: "Story", url: "u" }],
      }).success
    ).toBe(true);
  });
});

describe("PostDevResources schema", () => {
  it("requires non-empty resources", () => {
    expect(
      PostDevResources.input.safeParse({
        resources: [{ fileKey: "ABC", nodeId: "1:2", name: "Story", url: "https://u" }],
      }).success
    ).toBe(true);
    expect(PostDevResources.input.safeParse({ resources: [] }).success).toBe(false);
  });

  it("rejects entries with empty url", () => {
    expect(
      PostDevResources.input.safeParse({
        resources: [{ fileKey: "ABC", nodeId: "1:2", name: "X", url: "" }],
      }).success
    ).toBe(false);
  });
});
```

**Step 2: Failing handler tests** — append to `server-handlers.test.ts`

```ts
import {
  createGetDevResourcesServerHandler,
  createGetTeamStylesServerHandler,
  createPostDevResourcesServerHandler,
} from "../server-handlers";

describe("get_team_styles server handler", () => {
  it("forwards cursor + pageSize and surfaces nextCursor", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedTeamStyles("T1", {
      meta: {
        styles: [{ key: "s1", name: "Brand", description: "", style_type: "FILL" }],
        cursor: { after: 50 },
      },
    });
    const handler = createGetTeamStylesServerHandler({ figmaApi });
    const r = await handler({ teamId: "T1", pageSize: 25 }, ctx);
    expect(r.styles).toHaveLength(1);
    expect(r.nextCursor).toBe("50");
  });
});

describe("get_dev_resources server handler", () => {
  it("returns dev resources", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    figmaApi.__seedDevResources("ABC", [
      { id: "dr1", file_key: "ABC", node_id: "1:2", name: "Story", url: "https://u" },
    ]);
    const handler = createGetDevResourcesServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r.devResources).toEqual([
      { id: "dr1", fileKey: "ABC", nodeId: "1:2", name: "Story", url: "https://u" },
    ]);
  });
});

describe("post_dev_resources server handler", () => {
  it("E_WRITE_TOOLS_DISABLED when gate is closed", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createPostDevResourcesServerHandler({ figmaApi, enableWriteTools: false });
    await expect(
      handler(
        { resources: [{ fileKey: "ABC", nodeId: "1:2", name: "X", url: "u" }] },
        ctx
      )
    ).rejects.toThrow(/E_WRITE_TOOLS_DISABLED/);
  });

  it("posts when gate is open", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createPostDevResourcesServerHandler({ figmaApi, enableWriteTools: true });
    const r = await handler(
      { resources: [{ fileKey: "ABC", nodeId: "1:2", name: "Story", url: "https://u" }] },
      ctx
    );
    expect(r.devResources).toHaveLength(1);
    expect(r.devResources[0].id).toMatch(/^dr/);
  });
});
```

**Step 3: Implement schemas** — append to `tools.ts`

```ts
const StyleSummaryWithType = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  styleType: z.string(),
});

export const GetTeamStyles = defineTool({
  name: "get_team_styles",
  description: "REST. Return team styles (cursor-paginated).",
  streaming: false,
  input: z
    .object({
      teamId: z.string().min(1),
      pageSize: z.number().int().positive().optional(),
      cursor: z.string().optional(),
    })
    .strict(),
  output: z.object({
    styles: z.array(StyleSummaryWithType),
    nextCursor: z.string().optional(),
  }),
});

const DevResourceShape = z.object({
  id: z.string(),
  fileKey: z.string(),
  nodeId: z.string(),
  name: z.string(),
  url: z.string(),
});

const DevResourceInputShape = z.object({
  fileKey: z.string().min(1),
  nodeId: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
});

export const GetDevResources = defineTool({
  name: "get_dev_resources",
  description:
    "REST. Return dev resources for the file (optionally filtered by node ids).",
  streaming: false,
  input: z
    .object({
      fileKey: FileKey,
      nodeIds: z.array(NodeId).optional(),
    })
    .strict(),
  output: z.object({ devResources: z.array(DevResourceShape) }),
});

export const PostDevResources = defineTool({
  name: "post_dev_resources",
  description:
    "REST. Create dev resources. WRITE — gated behind --enable-write-tools (default off).",
  streaming: false,
  input: z
    .object({
      resources: z.array(DevResourceInputShape).min(1),
    })
    .strict(),
  output: z.object({ devResources: z.array(DevResourceShape) }),
});
```

**Step 4: Implement handlers** — append to `server-handlers.ts`

```ts
import type { GetDevResources, GetTeamStyles, PostDevResources } from "./tools";

export function createGetTeamStylesServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetTeamStyles> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_team_styles");
    try {
      const r = await api.getTeamStyles(args.teamId, {
        pageSize: args.pageSize,
        cursor: args.cursor,
      });
      const next = r.meta.cursor?.after;
      return {
        styles: r.meta.styles.map((s) => ({
          key: s.key, name: s.name, description: s.description, styleType: s.style_type,
        })),
        ...(next !== undefined ? { nextCursor: String(next) } : {}),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetDevResourcesServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetDevResources> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_dev_resources");
    try {
      const r = await api.getDevResources(args.fileKey, { node_ids: args.nodeIds });
      return {
        devResources: r.dev_resources.map((d) => ({
          id: d.id, fileKey: d.file_key, nodeId: d.node_id,
          name: d.name, url: d.url,
        })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createPostDevResourcesServerHandler(
  deps: RestWriteDeps
): ServerHandler<typeof PostDevResources> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "post_dev_resources");
    requireWriteEnabled(deps, "post_dev_resources");
    try {
      const r = await api.postDevResources(
        args.resources.map((r) => ({
          file_key: r.fileKey,
          node_id: r.nodeId,
          name: r.name,
          url: r.url,
        }))
      );
      return {
        devResources: r.dev_resources.map((d) => ({
          id: d.id, fileKey: d.file_key, nodeId: d.node_id,
          name: d.name, url: d.url,
        })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/tools-rest test
git add packages/tools-rest/src
git commit -m "feat(tools-rest): team styles + dev resources (3 tools)"
```

---

## Task 11.11: Wire `tools-rest` into mcp-server (env, write-flag, registration, e2e)

**Goal:** The most invasive task. Five distinct sub-changes:

1. **Protocol surface** — `ServerHandlerContext.figmaApi?: FigmaApi | null` (Phase 1's `figmaApiKey` stays one phase as a deprecated fallback).
2. **Daemon options** — `DaemonStartOptions.figmaApi?: FigmaApi | null`. The daemon stores it, threads it into `_serverRegistry.dispatch`'s context.
3. **CLI dispatch** — `--enable-write-tools` flag added to the `runtime` command (the only branch that produces a daemon).
4. **`apps/mcp-server/src/main.ts`** — reads `process.env.FIGMA_API_KEY`, constructs a `FigmaApiClient` if present, threads through to `Daemon.start({ figmaApi, … })`. Registers the `tools-rest` pack with all 20 tools and 20 server-handler factories. Extends the shim's `tools: [...]` list.
5. **Catalog test** — asserts every Phase 11 tool name is exported from `@repo/tools-rest` and is uniquely named.

> **Where does FIGMA_API_KEY live?** v1 is **env-only**. The `figma-mcp setup` command does NOT prompt for or persist the key. Users export it themselves: `export FIGMA_API_KEY=figd_...`. Adding setup support is a follow-up. (Documented in Notes on Execution.)

**Files:**

- Modify: `packages/protocol/src/tools.ts` (add `figmaApi?` to `ServerHandlerContext`)
- Modify: `apps/mcp-server/src/daemon/daemon.ts` (`DaemonStartOptions.figmaApi`, store it, pass into ctx)
- Modify: `apps/mcp-server/src/cli/dispatch.ts` (parse `--enable-write-tools` flag; widen the `runtime` discriminator)
- Modify: `apps/mcp-server/src/main.ts` (env pickup, write-flag pickup, pack registration, shim list extension)
- Modify: `apps/mcp-server/package.json` (add `@repo/tools-rest`, `@repo/figma-api-client`)
- Create: `apps/mcp-server/src/__tests__/e2e-phase11-catalog.test.ts`
- Create: `apps/mcp-server/src/__tests__/e2e-rest-write-gate.test.ts`
- Modify: `bun.lock` (via `bun install`)

> **Bridge plugin is unchanged.** No `apps/bridge-plugin` edit. The pack has no plugin handlers.

**Step 1: Extend `ServerHandlerContext`** — `packages/protocol/src/tools.ts`

```ts
import type { FigmaApi } from "@repo/figma-api-client";
// (existing imports preserved)

export type ServerHandlerContext = {
  readonly logger: Logger;
  /**
   * Phase 11+: typed Figma REST client. `null` when the daemon was
   * started without `FIGMA_API_KEY`. REST tools call `requireApiKey()`
   * to surface `E_FIGMA_API_KEY_MISSING` cleanly.
   */
  readonly figmaApi?: FigmaApi | null;
  /**
   * @deprecated Phase 1 placeholder; superseded by `figmaApi` in Phase 11.
   * One phase of overlap so any third-party server-handler still using
   * the raw key has a migration window. To be removed in Phase 12+.
   */
  readonly figmaApiKey?: string;
};
```

> Cyclic-import note: `@repo/protocol` does NOT depend on `@repo/figma-api-client` at runtime — `import type` keeps the dep type-only. Add `@repo/figma-api-client` to `packages/protocol/package.json` `devDependencies` so `tsc` resolves the import for typechecking. **No new runtime dependency on `@repo/protocol`.**

Modify `packages/protocol/package.json`:

```json
{
  "devDependencies": {
    "@repo/figma-api-client": "workspace:*",
    "...": "..."
  }
}
```

**Step 2: Extend `DaemonStartOptions` + thread into dispatch** — `apps/mcp-server/src/daemon/daemon.ts`

```ts
import type { FigmaApi } from "@repo/figma-api-client";
// (existing imports preserved)

export interface DaemonStartOptions {
  // …existing fields…
  /** Optional REST client. Threaded into ServerHandlerContext.figmaApi. */
  readonly figmaApi?: FigmaApi | null;
}

// inside class Daemon:
private readonly figmaApi: FigmaApi | null;

// inside Daemon.start, after construction:
const daemon = new Daemon(
  ipc,
  ws,
  options.figma,
  options.version,
  options.logger ?? noopLogger,
  options.figmaApi ?? null,
);

// constructor: add the param + store it.

// in dispatch(), at the line that calls _serverRegistry.dispatch:
return this._serverRegistry.dispatch(req.tool, req.args, {
  logger: this.logger,
  figmaApi: this.figmaApi,
});
```

> All existing tests pass — `figmaApi: null` is the default, so existing server-handlers (like `bridge_status`) that don't read it are unaffected.

**Step 3: `--enable-write-tools` flag** — `apps/mcp-server/src/cli/dispatch.ts`

```ts
export type CliCommand =
  | { kind: "runtime"; flags: { enableWriteTools: boolean } }
  // (other variants preserved)

export function dispatch(options: DispatchOptions): CliCommand {
  // (preserve early returns)

  // Replace the final `return { kind: "runtime" }` line:
  return {
    kind: "runtime",
    flags: {
      enableWriteTools: args.includes("--enable-write-tools"),
    },
  };
}
```

Add a new test file `apps/mcp-server/src/cli/__tests__/dispatch-write-flag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dispatch } from "../dispatch";

describe("dispatch: --enable-write-tools flag", () => {
  it("defaults to false on bare runtime invocation", () => {
    const r = dispatch({ argv: ["node", "figma-mcp"] });
    expect(r).toEqual({ kind: "runtime", flags: { enableWriteTools: false } });
  });

  it("captures --enable-write-tools when present", () => {
    const r = dispatch({ argv: ["node", "figma-mcp", "--enable-write-tools"] });
    expect(r).toEqual({ kind: "runtime", flags: { enableWriteTools: true } });
  });

  it("does not affect setup / doctor / help", () => {
    expect(dispatch({ argv: ["node", "figma-mcp", "--help"] }).kind).toBe("help");
    expect(dispatch({ argv: ["node", "figma-mcp", "setup"] }).kind).toBe("setup");
    expect(dispatch({ argv: ["node", "figma-mcp", "doctor"] }).kind).toBe("doctor");
  });
});
```

> **Existing dispatch tests:** Update `apps/mcp-server/src/cli/__tests__/dispatch.test.ts` so the runtime-mode assertions match the new shape (`{ kind: "runtime", flags: { enableWriteTools: false } }`). Mechanical change.

**Step 4: Failing catalog test** — `apps/mcp-server/src/__tests__/e2e-phase11-catalog.test.ts`

```ts
import {
  DeleteFileComment, GetDevResources, GetFileBranches, GetFileComments,
  GetFileComponents, GetFileComponentSets, GetFileMetadata, GetFilePages,
  GetFileStyles, GetFileVersions, GetImageFills, GetImageRenders,
  GetNodeById, GetProjectFiles, GetTeamComponents, GetTeamProjects,
  GetTeamStyles, GetUserMe, PostDevResources, PostFileComment,
} from "@repo/tools-rest";
import { describe, expect, it } from "vitest";

describe("Phase 11 tool catalog", () => {
  it("exposes 20 REST tools with the expected names", () => {
    const names = [
      GetFileMetadata.name, GetFilePages.name, GetNodeById.name, GetFileVersions.name,
      GetFileStyles.name, GetFileComponents.name, GetFileComponentSets.name, GetFileBranches.name,
      GetImageRenders.name, GetImageFills.name, GetUserMe.name,
      GetFileComments.name, PostFileComment.name, DeleteFileComment.name,
      GetTeamProjects.name, GetProjectFiles.name, GetTeamComponents.name,
      GetTeamStyles.name, GetDevResources.name, PostDevResources.name,
    ];
    expect(new Set(names).size).toBe(20);
    expect(names).toEqual([
      "get_file_metadata", "get_file_pages", "get_node_by_id", "get_file_versions",
      "get_file_styles", "get_file_components", "get_file_component_sets", "get_file_branches",
      "get_image_renders", "get_image_fills", "get_user_me",
      "get_file_comments", "post_file_comment", "delete_file_comment",
      "get_team_projects", "get_project_files", "get_team_components",
      "get_team_styles", "get_dev_resources", "post_dev_resources",
    ]);
  });

  it("every input schema rejects extraneous keys (strict)", () => {
    const tools = [
      GetFileMetadata, GetFilePages, GetNodeById, GetFileVersions,
      GetFileStyles, GetFileComponents, GetFileComponentSets, GetFileBranches,
      GetImageRenders, GetImageFills, GetUserMe,
      GetFileComments, PostFileComment, DeleteFileComment,
      GetTeamProjects, GetProjectFiles, GetTeamComponents,
      GetTeamStyles, GetDevResources, PostDevResources,
    ];
    for (const tool of tools) {
      const r = tool.input.safeParse({ __unexpected: 1 });
      expect(r.success).toBe(false);
    }
  });

  it("the three write-gated tools are clearly named (post_/delete_)", () => {
    expect(PostFileComment.name).toBe("post_file_comment");
    expect(DeleteFileComment.name).toBe("delete_file_comment");
    expect(PostDevResources.name).toBe("post_dev_resources");
  });
});
```

**Step 5: Wire into `main.ts`** — `apps/mcp-server/src/main.ts`

Imports:

```ts
import { FigmaApiClient } from "@repo/figma-api-client";
import {
  createDeleteFileCommentServerHandler,
  createGetDevResourcesServerHandler,
  createGetFileBranchesServerHandler,
  createGetFileCommentsServerHandler,
  createGetFileComponentsServerHandler,
  createGetFileComponentSetsServerHandler,
  createGetFileMetadataServerHandler,
  createGetFilePagesServerHandler,
  createGetFileStylesServerHandler,
  createGetFileVersionsServerHandler,
  createGetImageFillsServerHandler,
  createGetImageRendersServerHandler,
  createGetNodeByIdServerHandler,
  createGetProjectFilesServerHandler,
  createGetTeamComponentsServerHandler,
  createGetTeamProjectsServerHandler,
  createGetTeamStylesServerHandler,
  createGetUserMeServerHandler,
  createPostDevResourcesServerHandler,
  createPostFileCommentServerHandler,
  DeleteFileComment,
  GetDevResources,
  GetFileBranches,
  GetFileComments,
  GetFileComponents,
  GetFileComponentSets,
  GetFileMetadata,
  GetFilePages,
  GetFileStyles,
  GetFileVersions,
  GetImageFills,
  GetImageRenders,
  GetNodeById,
  GetProjectFiles,
  GetTeamComponents,
  GetTeamProjects,
  GetTeamStyles,
  GetUserMe,
  PostDevResources,
  PostFileComment,
} from "@repo/tools-rest";
```

Inside `runRuntime()`, after the dispatch (the `cmd.kind === "runtime"` branch already returns; the runtime branch is the daemon-OR-shim split below). Update the dispatch consumer:

```ts
async function main(): Promise<void> {
  const cmd = dispatch({ argv: process.argv });
  // …existing branches preserved…
  // cmd.kind === "runtime":
  await runRuntime({ enableWriteTools: cmd.flags.enableWriteTools });
}

async function runRuntime(opts: { enableWriteTools: boolean }): Promise<void> {
  // (existing setup preserved)

  // build the FigmaApiClient (or null) once:
  const figmaApiKey = process.env.FIGMA_API_KEY;
  const figmaApi = figmaApiKey
    ? new FigmaApiClient({ apiKey: figmaApiKey })
    : null;

  // …existing startup.mode === "daemon" branch:
  if (startup.mode === "daemon") {
    // (existing setup preserved)
    const daemon = await Daemon.start({
      // (existing fields preserved)
      figmaApi,
      packs: [
        // (existing 5 packs preserved)
        {
          name: "tools-rest",
          tools: [
            GetFileMetadata, GetFilePages, GetNodeById, GetFileVersions,
            GetFileStyles, GetFileComponents, GetFileComponentSets, GetFileBranches,
            GetImageRenders, GetImageFills, GetUserMe,
            GetFileComments, PostFileComment, DeleteFileComment,
            GetTeamProjects, GetProjectFiles, GetTeamComponents,
            GetTeamStyles, GetDevResources, PostDevResources,
          ],
          registerServer: (reg) => {
            reg.register(GetFileMetadata, createGetFileMetadataServerHandler({ figmaApi }));
            reg.register(GetFilePages, createGetFilePagesServerHandler({ figmaApi }));
            reg.register(GetNodeById, createGetNodeByIdServerHandler({ figmaApi }));
            reg.register(GetFileVersions, createGetFileVersionsServerHandler({ figmaApi }));
            reg.register(GetFileStyles, createGetFileStylesServerHandler({ figmaApi }));
            reg.register(GetFileComponents, createGetFileComponentsServerHandler({ figmaApi }));
            reg.register(GetFileComponentSets, createGetFileComponentSetsServerHandler({ figmaApi }));
            reg.register(GetFileBranches, createGetFileBranchesServerHandler({ figmaApi }));
            reg.register(GetImageRenders, createGetImageRendersServerHandler({ figmaApi }));
            reg.register(GetImageFills, createGetImageFillsServerHandler({ figmaApi }));
            reg.register(GetUserMe, createGetUserMeServerHandler({ figmaApi }));
            reg.register(GetFileComments, createGetFileCommentsServerHandler({ figmaApi }));
            reg.register(PostFileComment, createPostFileCommentServerHandler({
              figmaApi, enableWriteTools: opts.enableWriteTools,
            }));
            reg.register(DeleteFileComment, createDeleteFileCommentServerHandler({
              figmaApi, enableWriteTools: opts.enableWriteTools,
            }));
            reg.register(GetTeamProjects, createGetTeamProjectsServerHandler({ figmaApi }));
            reg.register(GetProjectFiles, createGetProjectFilesServerHandler({ figmaApi }));
            reg.register(GetTeamComponents, createGetTeamComponentsServerHandler({ figmaApi }));
            reg.register(GetTeamStyles, createGetTeamStylesServerHandler({ figmaApi }));
            reg.register(GetDevResources, createGetDevResourcesServerHandler({ figmaApi }));
            reg.register(PostDevResources, createPostDevResourcesServerHandler({
              figmaApi, enableWriteTools: opts.enableWriteTools,
            }));
          },
        },
      ],
    });
    // (existing tail preserved)
  }

  // (existing shim branch — extend the tools: [...] list)
  const shim = await createStdioShim({
    socketPath: startup.socketPath,
    sourceClientId: `shim-${process.pid}`,
    tools: [
      // …existing 33 tools…
      GetFileMetadata, GetFilePages, GetNodeById, GetFileVersions,
      GetFileStyles, GetFileComponents, GetFileComponentSets, GetFileBranches,
      GetImageRenders, GetImageFills, GetUserMe,
      GetFileComments, PostFileComment, DeleteFileComment,
      GetTeamProjects, GetProjectFiles, GetTeamComponents,
      GetTeamStyles, GetDevResources, PostDevResources,
    ],
    mcpServerInfo: { name: "figma-mcp", version: VERSION },
  });
  await shim.connectMcp(new StdioServerTransport());
}
```

> **Important:** the shim's `tools` list must include the REST tools too — even though their handlers live server-side, the shim is the MCP catalog source. Without the entry, the AI never sees the tool.

**Step 6: Failing wire-level test** — `apps/mcp-server/src/__tests__/e2e-rest-write-gate.test.ts`

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FigmaApiFake } from "@repo/figma-api-client";
import { FigmaFake } from "@repo/figma-adapter/testing";
import {
  createPostFileCommentServerHandler,
  PostFileComment,
} from "@repo/tools-rest";
import { describe, expect, it } from "vitest";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";

describe("REST write-tool gate", () => {
  it("returns E_WRITE_TOOLS_DISABLED when --enable-write-tools is off", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-rest-"));
    const socketPath = join(dir, "daemon.sock");
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F", lastModified: "x", version: "1", role: "owner", editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });

    const daemon = await Daemon.start({
      socketPath, wsPort: 0, version: "0.0.0",
      figma: new FigmaFake(),
      figmaApi,
      packs: [{
        name: "tools-rest",
        tools: [PostFileComment],
        registerServer: (reg) => {
          reg.register(
            PostFileComment,
            createPostFileCommentServerHandler({ figmaApi, enableWriteTools: false })
          );
        },
      }],
    });

    try {
      const shim = await createStdioShim({
        socketPath, sourceClientId: "shim-rest-test",
        tools: [PostFileComment],
        mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
      });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await shim.connectMcp(serverTransport);
      const client = new Client({ name: "test-client", version: "0.0.0" });
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "post_file_comment",
        arguments: { fileKey: "ABC", message: "hi" },
      });

      expect(result.isError).toBe(true);
      const text =
        Array.isArray(result.content) && result.content[0]?.type === "text"
          ? (result.content[0] as { text: string }).text
          : JSON.stringify(result);
      expect(text).toContain("E_WRITE_TOOLS_DISABLED");
      expect(text).toContain("post_file_comment");
    } finally {
      await daemon.stop();
    }
  });
});
```

**Step 7: Add deps**

```jsonc
// apps/mcp-server/package.json
"@repo/tools-rest": "workspace:*",
"@repo/figma-api-client": "workspace:*"
```

Run `bun install`.

**Step 8: Verify, commit**

```bash
bun run --filter @repo/mcp-server test e2e-phase11-catalog
bun run --filter @repo/mcp-server test e2e-rest-write-gate
bun run --filter @repo/mcp-server test
git add packages/protocol apps/mcp-server bun.lock
git commit -m "feat(mcp-server): wire tools-rest pack with FIGMA_API_KEY + --enable-write-tools"
```

---

## Task 11.12: Coverage gate + Phase 11 changeset + acceptance

**Files:**

- Verify `packages/figma-api-client/vitest.config.ts` thresholds (≥90/85/90/90)
- Verify `packages/tools-rest/vitest.config.ts` thresholds (≥90/85/90/90)
- Create: `.changeset/phase-11-tools-rest.md`

**Step 1: Per-pack coverage**

```bash
bun run --filter @repo/figma-api-client test --coverage
bun run --filter @repo/tools-rest test --coverage
```

Each command must pass with no threshold violations. If a sub-area dips below the bar, add table-driven tests for the missing branches. Do NOT lower thresholds.

**Step 2: Root acceptance**

```bash
bun run lint
bun run types
bun run test
```

All green.

**Step 3: Changeset** — `.changeset/phase-11-tools-rest.md`

```markdown
---
"@bromso/figma-mcp": minor
"@repo/tools-rest": minor
"@repo/figma-api-client": minor
---

Phase 11: tools-rest pack (cloud-mode-without-plugin reads).

A new server-side-only tool pack ships, bringing the registry from ~33 to ~53 tools.

`@repo/figma-api-client` (new): a typed Figma REST client wrapping native
`fetch` against `https://api.figma.com/v1/`. Constructor takes
`{apiKey, fetchFn?, baseUrl?}` for testability. Throws `FigmaApiError`
on non-2xx with codes `E_FIGMA_REST_AUTH` (401/403), `E_FIGMA_REST_404`,
`E_FIGMA_REST_429`, `E_FIGMA_REST_UNKNOWN`. Ships `FigmaApiFake` for
in-memory tests.

`@repo/tools-rest` (new): 20 server-handler tools backed by REST. No
plugin handlers — these tools work whenever `FIGMA_API_KEY` is in env,
even without a paired bridge plugin.

- File metadata: `get_file_metadata`, `get_file_pages`, `get_node_by_id`,
  `get_file_versions`.
- File catalog: `get_file_styles`, `get_file_components`,
  `get_file_component_sets`, `get_file_branches`.
- Assets + identity: `get_image_renders`, `get_image_fills`, `get_user_me`.
- Comments: `get_file_comments`, `post_file_comment` (write-gated),
  `delete_file_comment` (write-gated).
- Team / project: `get_team_projects`, `get_project_files`,
  `get_team_components` (cursor-paginated).
- Team catalog + dev resources: `get_team_styles` (cursor-paginated),
  `get_dev_resources`, `post_dev_resources` (write-gated).

`@bromso/figma-mcp`: reads `FIGMA_API_KEY` from env on startup. New
`--enable-write-tools` flag (default off) gates the three mutating tools
behind an explicit opt-in to prevent prompt-driven mass commenting / spam
dev resources. With the flag off, write tools surface
`E_WRITE_TOOLS_DISABLED` immediately on call. With no `FIGMA_API_KEY`,
all 20 REST tools surface `E_FIGMA_API_KEY_MISSING` — the daemon boots
fine.

Protocol surface: `ServerHandlerContext.figmaApi?: FigmaApi | null` is
the new typed seam. The Phase 1 `figmaApiKey` placeholder remains
`@deprecated` for one more phase as a migration window.

Out of scope: `@repo/tools-slides`, `@repo/tools-a11y`. Webhook tools.
OAuth-based auth (env-only for now). Plugin runtime tools (those are
tools-extract / tools-design / tools-figjam). REST writes beyond comments
+ dev resources (Figma's REST API does not support file content updates).
WebSocket-based real-time subscriptions. Real-Figma golden tests for the
REST pack. Caching. Rate-limit auto-retry.
```

**Step 4: Commit**

```bash
git add .changeset/phase-11-tools-rest.md
git commit -m "chore(changeset): record Phase 11 tools-rest"
```

**Step 5: Final acceptance pass**

```bash
bun run lint && bun run types && bun run test
git log master..HEAD --oneline
```

**Phase 11 done.** The REST tool pack ships server-side-only, the daemon picks up `FIGMA_API_KEY` from env, the registry now exposes ~53 tools, and write tools are gated behind a clear opt-in flag.

---

## Notes on Execution

**Editor-type discriminator does NOT apply.** Phase 10's `requireFigJam` guard is a tool-handler-level check that the bridge plugin's runtime is FigJam. REST tools have no such concern: the API is editor-agnostic, and a Design tool calling a REST endpoint that targets a FigJam file just returns the file's metadata in the same shape. **Do not import `requireFigJam` or `requireDesign` here.**

**FigmaApiClient base URL override.** Tests pass `baseUrl: "http://localhost:9999/v1"` so we can stub fetch deterministically. The default is `https://api.figma.com/v1`. The `client.test.ts` "honors a custom baseUrl" case proves the override works. **No credentials are ever interpolated into URLs**: only headers carry the token, so logging the URL is safe.

**Rate-limit behavior.** Figma returns `429` with a `retry-after` header. Phase 11 ships verbatim error surfacing — `FigmaApiError(status: 429, code: "E_FIGMA_REST_429")` — without auto-retry. The header is preserved on the underlying `Response` (we don't read it currently); a follow-up phase can add bounded backoff with `retry-after` honoring. **This is intentional.** Auto-retry mechanics from a daemon are a foot-gun: if the AI is the source of the rate-limited request, retrying silently obscures the fact that the AI is sending too much traffic.

**Where does FIGMA_API_KEY live?** v1 is **env-only**. Three options were considered:
- (a) **env-only** — selected. Simple, ssh/CI-friendly, no file-on-disk to lose.
- (b) `figma-mcp setup` writes the key to `~/.figma-mcp/config.json`. Ergonomic but introduces a file-system credential store that needs lifecycle management (rotation, deletion on uninstall, multiple-key support for team accounts). Defer.
- (c) per-tool arg. Unsafe — the key would round-trip through MCP transcripts (logged on the AI side, possibly persisted by the AI client). Reject.

**Threat model for write tools.** Three tools mutate (`post_file_comment`, `delete_file_comment`, `post_dev_resources`). A malicious or careless AI prompt — `"comment 'GET REKT' on every node"` — could mass-spam a real file. Default-off via `--enable-write-tools` is the right posture; the operator who needs writes makes the deliberate choice. The doctor's `ai-client-configs` check should call out the flag if it's present in any client's config (Phase 7's check is the integration site; that callout is a follow-up — Phase 11 only ships the gate, not the doctor wiring).

**Deferred Phase 7 Windows IPC fix.** Tracked separately. Not addressed here.

**FigmaApiClient is constructed once per daemon lifetime.** The runtime branch builds it on startup (from env) and threads it into every `registerServer` factory. Tests in `tools-rest` build a fresh `FigmaApiFake` per test. Both shapes implement the structural `FigmaApi` alias so handlers are agnostic.

**Pagination shape consistency.** Cursor-style endpoints (`get_team_components`, `get_team_styles`) emit `{items, nextCursor?}`. The before/after style endpoint (`get_file_versions`) emits `{prevPage?, nextPage?}` because `before`/`after` are themselves cursors-by-another-name and the AI's natural mental model is "page back / page forward" rather than "fetch next batch." This is a deliberate one-off; the rest of the pack uses the cursor shape. If a future REST endpoint also uses `before`/`after`, it adopts `{prevPage?, nextPage?}`.

**Tool input/output narrowing philosophy.** Figma REST responses are *huge* — a single `/v1/files/<key>` response easily exceeds 100KB and includes the full document tree. Server-handlers reduce aggressively: `get_file_metadata` returns `{name, lastModified, version, role, editorType}` (~120 bytes), not the full document. Tool outputs are wire-stable; additions are non-breaking. Callers who want the raw tree should use the bridge plugin's `tools-extract` (which has direct in-process access to `figma.root` and can stream selective subtrees on demand). This is the right division: REST tools are for AI-facing summaries, the plugin is for AI-facing structural reads.

**Why `mapRestError` rather than letting the daemon's `toErrorEnvelope` absorb the FigmaApiError.** `toErrorEnvelope` (in `daemon.ts:197`) currently buckets every non-`RegistryError` as `E_FIGMA_UNKNOWN`. That's correct for plugin-side throws (which often *are* unknown failures from `figma.*`) but wrong for REST errors, which carry rich status info we want to preserve verbatim. `mapRestError` re-throws as a plain `Error` with `.message` starting with the wire code — so the catch site at `toErrorEnvelope` still buckets it as `E_FIGMA_UNKNOWN`, but the carried message ("E_FIGMA_REST_404: file not found: ABC") preserves the discriminator for callers who match on it. **Phase 12 should promote these into first-class `ErrorCode` values** (a TODO breadcrumb is left in `errors.ts`) but the message-prefix pattern matches Phase 10's `E_FIGMA_EDITOR_TYPE_MISMATCH` precedent and keeps the daemon wire format stable.

**No `apps/bridge-plugin` change.** This pack has no plugin handlers. The bridge plugin's tool registry is unaffected.

**No `figma-adapter` change.** This pack does not touch the adapter. The Phase 10 changeset bumped `@repo/figma-adapter`; Phase 11 does not.

**Coverage thresholds.** Both new packages (`figma-api-client`, `tools-rest`) use the same per-pack bar from the master plan: lines/functions/statements ≥90, branches ≥85. The 20 server-handlers are mostly thin pass-throughs; coverage gaps will be in the error-mapping branches inside each `try { … } catch (err) { mapRestError(err); }` — Task 11.4's test for `mapRestError` covers the dispatch end; per-handler error tests in 11.5–11.10 cover the call-site end (one test per handler that asserts an `E_FIGMA_REST_404` propagates). If any handler dips below the bar, add a missing-API-key test (`figmaApi: null`) + a 404 test for it.

**Order-of-execution dependency.** Tasks 11.5–11.10 depend on Task 11.2 (the client + fake) and Task 11.4 (the guards). Task 11.11 depends on all 11.5–11.10 (the registration imports every handler). Task 11.12 is last. The task numbering reflects this order.

**No `server-handlers.ts` for any other pack.** As of Phase 11, only `tools-extract` (`bridge_status`) and `tools-rest` (all 20 tools) ship server-side handlers. Future packs that need REST-backed reads can mirror the `createXyzServerHandler({ figmaApi })` factory pattern verbatim.

---

## Out of scope

- `@repo/tools-slides` — slide creation, transitions, focus tools. Separate phase.
- `@repo/tools-a11y` — audit/lint/annotation tools. Separate phase.
- Webhook tools. `POST /v2/webhooks`, webhook delivery, signing.
- OAuth-based auth. v1 is `FIGMA_API_KEY` env-only.
- Plugin runtime tools. Those live in `tools-extract` / `tools-design` / `tools-figjam`.
- REST writes beyond comments + dev resources. Figma's REST API does not support file content updates.
- WebSocket-based real-time subscriptions. Figma's REST API exposes no streaming endpoints.
- Editor-type discriminator. REST tools work for any file type — see Notes on Execution.
- Real-Figma smoke runs against the REST pack. Each handler's coverage comes from `FigmaApiFake` unit tests.
- Concurrency / connection pooling. Native `fetch` handles this.
- Response caching. No LRU. Each tool call hits the API.
- Rate-limit auto-retry. On 429 we surface the error verbatim.
- Per-request telemetry. No analytics.
- Tool versioning / deprecation channels. Nothing is removed or renamed.
- `figma-mcp setup` writing the API key to a config file. v1 is env-only.
- The deferred Phase 7 Windows IPC fix (named-pipe path resolution under `\\.\pipe\` on Windows). Tracked in Phase 7's "Out of scope".
- The deferred Phase 8 `query_console` regex DoS hardening. Tracked in Phase 8's "Out of scope".
- The deferred Phase 10 real-figma figjam golden test. Tracked in Phase 10's "Out of scope".
- Doctor's `ai-client-configs` check call-out for the `--enable-write-tools` flag. Phase 7 owns the doctor; Phase 11 only ships the gate.

---

## References

- Phase 8 plan (canonical pack pattern): `docs/plans/2026-05-06-figma-mcp-phase-8.md`
- Phase 9 plan (real-figma harness): `docs/plans/2026-05-06-figma-mcp-phase-9.md`
- Phase 10 plan (most recent pack pattern): `docs/plans/2026-05-06-figma-mcp-phase-10.md`
- Phase 7 plan (CLI + diagnostics, Windows IPC follow-up): `docs/plans/2026-05-06-figma-mcp-phase-7.md`
- Phase 3 plan (canonical extract pack): `docs/plans/2026-05-06-figma-mcp-phase-3.md`
- Phase 1 plan (protocol foundations, ServerHandler seam): `docs/plans/2026-05-06-figma-mcp-rewrite-plan.md`
- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md`
- Roadmap: `docs/plans/2026-05-06-figma-mcp-rewrite-plan.md` (Phase 11 high-level scope)
- Canonical server-handler pack: `packages/tools-extract/src/server-handlers.ts`
- Server registry: `apps/mcp-server/src/registries/server-registry.ts`
- Daemon dispatch: `apps/mcp-server/src/daemon/daemon.ts` (`Daemon.dispatch()`)
- Protocol primitives: `packages/protocol/src/tools.ts` (`defineTool`, `ServerHandler`, `ServerHandlerContext`, `Pack`)
- Figma REST API docs: <https://www.figma.com/developers/api>
- Figma REST API rate limits: <https://www.figma.com/developers/api#rate-limits>
- Figma REST API auth (X-Figma-Token): <https://www.figma.com/developers/api#authentication>
