import { describe, expect, it, vi } from "vitest";
import { FigmaApiClient } from "../client";
import { FigmaApiError } from "../errors";

const mkResp = (body: unknown, init: ResponseInit = { status: 200 }) =>
  new Response(JSON.stringify(body), init);

describe("FigmaApiClient.getMe", () => {
  it("GETs /v1/me with X-Figma-Token header", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
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
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mkResp({ id: "u1", email: "", handle: "", img_url: "" }));
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
      mkResp({
        name: "F",
        lastModified: "2026-01-01",
        version: "1",
        role: "owner",
        editorType: "figma",
        document: {},
      })
    );
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    const r = await client.getFile("ABC");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.figma.com/v1/files/ABC");
    expect(r.name).toBe("F");
  });

  it("forwards depth + ids query parameters", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({
        name: "F",
        lastModified: "x",
        version: "1",
        role: "owner",
        editorType: "figma",
        document: {},
      })
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
        name: "F",
        lastModified: "x",
        version: "1",
        role: "owner",
        editorType: "figma",
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
      status: 404,
      code: "E_FIGMA_REST_404",
    });
  });

  it("throws FigmaApiError(401) → E_FIGMA_REST_AUTH", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ err: "no" }, { status: 401 }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await expect(client.getMe()).rejects.toMatchObject({
      status: 401,
      code: "E_FIGMA_REST_AUTH",
    });
  });

  it("throws FigmaApiError(429) → E_FIGMA_REST_429", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ err: "slow down" }, { status: 429 }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await expect(client.getMe()).rejects.toMatchObject({
      status: 429,
      code: "E_FIGMA_REST_429",
    });
  });

  it("throws FigmaApiError(500) → E_FIGMA_REST_UNKNOWN", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ err: "boom" }, { status: 500 }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await expect(client.getMe()).rejects.toMatchObject({
      status: 500,
      code: "E_FIGMA_REST_UNKNOWN",
    });
  });
});

describe("FigmaApiClient — pagination cursor passthrough", () => {
  it("forwards cursor + page_size on getTeamComponents", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mkResp({ meta: { components: [], cursor: { after: 100 } } }));
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
      mkResp({
        id: "c1",
        message: "hello",
        file_key: "ABC",
        parent_id: "",
        user: { handle: "j" },
        created_at: "2026-01-01T00:00:00Z",
      })
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

describe("FigmaApiClient — v2 webhooks", () => {
  it("GET /v2/teams/<team_id>/webhooks", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ webhooks: [] }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await client.listTeamWebhooks("T1");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.figma.com/v2/teams/T1/webhooks");
  });

  it("GET /v2/webhooks/<id>", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({
        webhook: {
          id: "wh1",
          event_type: "FILE_UPDATE",
          team_id: "T1",
          status: "ACTIVE",
          endpoint: "https://e",
          passcode: "p",
        },
      })
    );
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    const r = await client.getWebhook("wh1");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.figma.com/v2/webhooks/wh1");
    expect(r.webhook.id).toBe("wh1");
  });

  it("GET /v2/webhooks/<id>/requests with optional page_size", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ requests: [] }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await client.getWebhookRequests("wh1", { pageSize: 25 });
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v2/webhooks/wh1/requests");
    expect(url.searchParams.get("page_size")).toBe("25");
  });

  it("POST /v2/webhooks (create)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({
        webhook: {
          id: "wh1",
          event_type: "FILE_UPDATE",
          team_id: "T1",
          status: "ACTIVE",
          endpoint: "https://e",
          passcode: "p",
        },
      })
    );
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    const r = await client.createWebhook({
      event_type: "FILE_UPDATE",
      team_id: "T1",
      endpoint: "https://e",
      passcode: "p",
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.figma.com/v2/webhooks");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toContain("FILE_UPDATE");
    expect(r.webhook.id).toBe("wh1");
  });

  it("PUT /v2/webhooks/<id> (update)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({
        webhook: {
          id: "wh1",
          event_type: "FILE_UPDATE",
          team_id: "T1",
          status: "PAUSED",
          endpoint: "https://e2",
          passcode: "p",
        },
      })
    );
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await client.updateWebhook("wh1", { status: "PAUSED", endpoint: "https://e2" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.figma.com/v2/webhooks/wh1");
    expect((init as RequestInit).method).toBe("PUT");
    expect((init as RequestInit).body).toContain("PAUSED");
  });

  it("DELETE /v2/webhooks/<id>", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await client.deleteWebhook("wh1");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.figma.com/v2/webhooks/wh1");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("custom baseUrl override falls through to /v2 sibling", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ webhooks: [] }));
    const client = new FigmaApiClient({
      apiKey: "k",
      fetchFn,
      baseUrl: "https://example.test/v1",
    });
    await client.listTeamWebhooks("T1");
    expect(fetchFn.mock.calls[0][0]).toBe("https://example.test/v2/teams/T1/webhooks");
  });

  it("propagates v2 error responses through FigmaApiError", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ err: "no" }, { status: 404 }));
    const client = new FigmaApiClient({ apiKey: "k", fetchFn });
    await expect(client.getWebhook("MISSING")).rejects.toMatchObject({
      status: 404,
      code: "E_FIGMA_REST_404",
    });
  });
});

describe("FigmaApiClient — OAuth bearer-token auth (Phase 21)", () => {
  it("sends Authorization: Bearer <token> when oauthToken is configured", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mkResp({ id: "u1", email: "", handle: "j", img_url: "" }));
    const client = new FigmaApiClient({ oauthToken: "oauth-abc", fetchFn });
    await client.getMe();
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: "Bearer oauth-abc" });
    // Phase 21 contract: when OAuth wins, X-Figma-Token must NOT be sent.
    expect((init.headers as Record<string, string>)["X-Figma-Token"]).toBeUndefined();
  });

  it("invokes getOauthToken per request (allows dynamic refresh)", async () => {
    // Each call returns a fresh Response — Response bodies are single-use.
    const fetchFn = vi
      .fn()
      .mockImplementation(async () => mkResp({ id: "u1", email: "", handle: "j", img_url: "" }));
    const tokens = ["t-first", "t-second", "t-third"];
    let i = 0;
    const getOauthToken = vi.fn(async () => tokens[i++] ?? "t-fallback");
    const client = new FigmaApiClient({ getOauthToken, fetchFn });
    await client.getMe();
    await client.getMe();
    await client.getMe();
    expect(getOauthToken).toHaveBeenCalledTimes(3);
    expect((fetchFn.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer t-first",
    });
    expect((fetchFn.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer t-second",
    });
    expect((fetchFn.mock.calls[2][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer t-third",
    });
  });

  it("priority — oauthToken wins when both apiKey and oauthToken are passed", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mkResp({ id: "u1", email: "", handle: "j", img_url: "" }));
    const client = new FigmaApiClient({ apiKey: "PAT", oauthToken: "OAUTH", fetchFn });
    await client.getMe();
    const headers = (fetchFn.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer OAUTH");
    expect(headers["X-Figma-Token"]).toBeUndefined();
  });

  it("priority — getOauthToken wins over a static oauthToken", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mkResp({ id: "u1", email: "", handle: "j", img_url: "" }));
    const getOauthToken = vi.fn(async () => "DYNAMIC");
    const client = new FigmaApiClient({
      oauthToken: "STATIC",
      getOauthToken,
      fetchFn,
    });
    await client.getMe();
    expect(getOauthToken).toHaveBeenCalledTimes(1);
    const headers = (fetchFn.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer DYNAMIC");
  });

  it("throws at construction when neither apiKey nor any oauth source is provided", () => {
    expect(() => new FigmaApiClient({} as never)).toThrow(/apiKey|oauth/i);
  });

  it("PAT-only construction is unchanged (backwards compatibility)", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mkResp({ id: "u1", email: "", handle: "j", img_url: "" }));
    const client = new FigmaApiClient({ apiKey: "still-works", fetchFn });
    await client.getMe();
    const headers = (fetchFn.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Figma-Token"]).toBe("still-works");
    expect(headers.Authorization).toBeUndefined();
  });
});
