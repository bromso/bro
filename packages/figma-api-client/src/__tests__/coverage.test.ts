/**
 * Smoke-coverage for endpoints + fake methods that the plan's hand-picked
 * tests did not exercise. Each test calls one method and asserts the URL
 * shape (for the client) or the seed/read happy path (for the fake). These
 * are intentionally minimal — they exist to drive the per-pack coverage gate
 * over 90/85/90/90 without duplicating plan-specified intent.
 */

import { describe, expect, it, vi } from "vitest";
import { FigmaApiClient } from "../client";
import { FigmaApiFake } from "../fake";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("FigmaApiClient — remaining endpoint URL shapes", () => {
  it("getFileStyles → /v1/files/<key>/styles", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ meta: { styles: [] } }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getFileStyles("ABC");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.figma.com/v1/files/ABC/styles");
  });

  it("getFileComponents → /v1/files/<key>/components", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ meta: { components: [] } }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getFileComponents("ABC");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.figma.com/v1/files/ABC/components");
  });

  it("getFileComponentSets → /v1/files/<key>/component_sets", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ meta: { component_sets: [] } }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getFileComponentSets("ABC");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.figma.com/v1/files/ABC/component_sets");
  });

  it("getFileVersions defaults (no opts) → /v1/files/<key>/versions", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ versions: [], pagination: {} }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getFileVersions("ABC");
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v1/files/ABC/versions");
    expect(url.search).toBe("");
  });

  it("getFileVersions forwards `after`", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ versions: [], pagination: {} }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getFileVersions("ABC", { after: "200" });
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.searchParams.get("after")).toBe("200");
  });

  it("getFileBranches → /v1/files/<key>/branches", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ main_file_key: "ABC", branches: [] }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getFileBranches("ABC");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.figma.com/v1/files/ABC/branches");
  });

  it("getImages forwards ids + format + scale", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ err: null, images: {} }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getImages("ABC", { ids: ["1:2"], format: "png", scale: 2 });
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v1/images/ABC");
    expect(url.searchParams.get("ids")).toBe("1:2");
    expect(url.searchParams.get("format")).toBe("png");
    expect(url.searchParams.get("scale")).toBe("2");
  });

  it("getImageFills → /v1/files/<key>/images", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(ok({ meta: { images: {} }, error: false, status: 200 }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getImageFills("ABC");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.figma.com/v1/files/ABC/images");
  });

  it("getFileComments → /v1/files/<key>/comments", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ comments: [] }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getFileComments("ABC");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.figma.com/v1/files/ABC/comments");
  });

  it("getTeamProjects → /v1/teams/<id>/projects", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ name: "T", projects: [] }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getTeamProjects("T1");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.figma.com/v1/teams/T1/projects");
  });

  it("getProjectFiles defaults — no branch_data", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ name: "P", files: [] }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getProjectFiles("P1");
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v1/projects/P1/files");
    expect(url.search).toBe("");
  });

  it("getProjectFiles with branch_data=true forwards param", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ name: "P", files: [] }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getProjectFiles("P1", { branch_data: true });
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.searchParams.get("branch_data")).toBe("true");
  });

  it("getTeamStyles forwards cursor + page_size", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ meta: { styles: [] } }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getTeamStyles("T1", { pageSize: 10, cursor: "z" });
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v1/teams/T1/styles");
    expect(url.searchParams.get("page_size")).toBe("10");
    expect(url.searchParams.get("cursor")).toBe("z");
  });

  it("getDevResources forwards node_ids when present", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ dev_resources: [] }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getDevResources("ABC", { node_ids: ["1:2", "1:3"] });
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v1/files/ABC/dev_resources");
    expect(url.searchParams.get("node_ids")).toBe("1:2,1:3");
  });

  it("getDevResources omits node_ids when not provided", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ dev_resources: [] }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.getDevResources("ABC");
    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.search).toBe("");
  });

  it("postDevResources POSTs with dev_resources body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ dev_resources: [] }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await c.postDevResources([{ file_key: "ABC", node_id: "1:2", name: "n", url: "https://x" }]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.figma.com/v1/dev_resources");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBe(
      JSON.stringify({
        dev_resources: [{ file_key: "ABC", node_id: "1:2", name: "n", url: "https://x" }],
      })
    );
  });

  it("returns undefined for 204 responses", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    // getFile is GET, so it would hit the JSON parse path; force 204 anyway.
    const r = await c.getFile("X");
    expect(r).toBeUndefined();
  });

  it("uses HTTP <status> message when error body is empty", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 502 }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await expect(c.getMe()).rejects.toMatchObject({
      status: 502,
      code: "E_FIGMA_REST_UNKNOWN",
      message: "HTTP 502",
    });
  });

  it("propagates non-empty error body in message", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
    const c = new FigmaApiClient({ apiKey: "k", fetchFn });
    await expect(c.getMe()).rejects.toMatchObject({
      status: 403,
      code: "E_FIGMA_REST_AUTH",
      message: "nope",
    });
  });

  it("uses native fetch when fetchFn is omitted", () => {
    const c = new FigmaApiClient({ apiKey: "k" });
    // Construction alone exercises the default branch.
    expect(c).toBeInstanceOf(FigmaApiClient);
  });

  it("strips a trailing slash from baseUrl", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ id: "u", email: "", handle: "", img_url: "" }));
    const c = new FigmaApiClient({
      apiKey: "k",
      fetchFn,
      baseUrl: "http://x/v1/",
    });
    await c.getMe();
    expect(fetchFn.mock.calls[0][0]).toBe("http://x/v1/me");
  });
});

describe("FigmaApiFake — remaining surface", () => {
  const seedFile = (fake: FigmaApiFake, key = "ABC") =>
    fake.__seedFile(key, {
      name: "F",
      lastModified: "x",
      version: "1",
      role: "owner",
      editorType: "figma",
      document: {
        id: "0:0",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            type: "CANVAS",
            name: "Page 1",
            children: [{ id: "1:1", type: "FRAME", name: "Frame" }],
          },
        ],
      },
    });

  it("getFileNodes returns seeded ids + nulls for misses", async () => {
    const fake = new FigmaApiFake();
    seedFile(fake);
    const r = await fake.getFileNodes("ABC", ["1:1", "9:9"]);
    expect(r.nodes["1:1"]).not.toBeNull();
    expect(r.nodes["9:9"]).toBeNull();
  });

  it("getFileNodes throws 404 for unseeded file", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getFileNodes("X", ["1:1"])).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getFileStyles seed + read", async () => {
    const fake = new FigmaApiFake();
    fake.__seedStyles("ABC", { meta: { styles: [] } });
    expect((await fake.getFileStyles("ABC")).meta.styles).toEqual([]);
  });

  it("getFileStyles throws 404 unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getFileStyles("X")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getFileComponents seed + read", async () => {
    const fake = new FigmaApiFake();
    fake.__seedComponents("ABC", { meta: { components: [] } });
    expect((await fake.getFileComponents("ABC")).meta.components).toEqual([]);
  });

  it("getFileComponents throws 404 unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getFileComponents("X")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getFileComponentSets seed + read", async () => {
    const fake = new FigmaApiFake();
    fake.__seedComponentSets("ABC", { meta: { component_sets: [] } });
    expect((await fake.getFileComponentSets("ABC")).meta.component_sets).toEqual([]);
  });

  it("getFileComponentSets throws 404 unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getFileComponentSets("X")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getFileVersions seed + read", async () => {
    const fake = new FigmaApiFake();
    fake.__seedVersions("ABC", { versions: [], pagination: {} });
    expect((await fake.getFileVersions("ABC")).versions).toEqual([]);
  });

  it("getFileVersions throws 404 unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getFileVersions("X")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getFileBranches seed + read", async () => {
    const fake = new FigmaApiFake();
    fake.__seedBranches("ABC", { main_file_key: "ABC", branches: [] });
    expect((await fake.getFileBranches("ABC")).main_file_key).toBe("ABC");
  });

  it("getFileBranches throws 404 unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getFileBranches("X")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getImages seed + read", async () => {
    const fake = new FigmaApiFake();
    fake.__seedImages("ABC", { err: null, images: { "1:2": "https://i" } });
    const r = await fake.getImages("ABC", { ids: ["1:2"] });
    expect(r.images["1:2"]).toBe("https://i");
  });

  it("getImages throws 404 unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getImages("X", { ids: ["1:2"] })).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getImageFills seed + read", async () => {
    const fake = new FigmaApiFake();
    fake.__seedImageFills("ABC", {
      meta: { images: {} },
      error: false,
      status: 200,
    });
    expect((await fake.getImageFills("ABC")).status).toBe(200);
  });

  it("getImageFills throws 404 unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getImageFills("X")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getFileComments throws 404 if file unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getFileComments("X")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("postFileComment throws 404 if file unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.postFileComment("X", { message: "hi" })).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("postFileComment retains client_meta on the stored comment", async () => {
    const fake = new FigmaApiFake();
    seedFile(fake);
    const c = await fake.postFileComment("ABC", {
      message: "anchored",
      client_meta: { x: 1, y: 2 },
    });
    expect(c.client_meta).toEqual({ x: 1, y: 2 });
  });

  it("deleteFileComment throws 404 if file unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.deleteFileComment("X", "c1")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getProjectFiles throws 404 unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getProjectFiles("X")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getTeamComponents throws 404 unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getTeamComponents("T9")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getTeamStyles seed + read", async () => {
    const fake = new FigmaApiFake();
    fake.__seedTeamStyles("T1", { meta: { styles: [] } });
    expect((await fake.getTeamStyles("T1")).meta.styles).toEqual([]);
  });

  it("getTeamStyles throws 404 unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getTeamStyles("T9")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getDevResources returns [] when none seeded for an existing file", async () => {
    const fake = new FigmaApiFake();
    seedFile(fake);
    expect((await fake.getDevResources("ABC")).dev_resources).toEqual([]);
  });

  it("getDevResources throws 404 if file unseeded", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getDevResources("X")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("__seedDevResources seeds a list and getDevResources returns it", async () => {
    const fake = new FigmaApiFake();
    seedFile(fake);
    fake.__seedDevResources("ABC", [
      {
        id: "dr0",
        file_key: "ABC",
        node_id: "1:2",
        name: "spec",
        url: "https://x",
      },
    ]);
    const r = await fake.getDevResources("ABC");
    expect(r.dev_resources).toHaveLength(1);
  });

  it("postDevResources creates entries and accumulates by file_key", async () => {
    const fake = new FigmaApiFake();
    seedFile(fake);
    const r = await fake.postDevResources([
      { file_key: "ABC", node_id: "1:2", name: "a", url: "https://a" },
      { file_key: "ABC", node_id: "1:3", name: "b", url: "https://b" },
    ]);
    expect(r.dev_resources).toHaveLength(2);
    expect(r.dev_resources[0].id).toMatch(/^dr/);
    const after = await fake.getDevResources("ABC");
    expect(after.dev_resources).toHaveLength(2);
  });
});
