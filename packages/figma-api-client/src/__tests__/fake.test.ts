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
      name: "F",
      lastModified: "x",
      version: "1",
      role: "owner",
      editorType: "figma",
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
      name: "F",
      lastModified: "x",
      version: "1",
      role: "owner",
      editorType: "figma",
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
      name: "F",
      lastModified: "x",
      version: "1",
      role: "owner",
      editorType: "figma",
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
      name: "F",
      lastModified: "x",
      version: "1",
      role: "owner",
      editorType: "figma",
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
      name: "Team",
      projects: [{ id: "P1", name: "Web" }],
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

describe("FigmaApiFake — v2 webhooks", () => {
  const seedWebhook = {
    id: "wh1",
    event_type: "FILE_UPDATE" as const,
    team_id: "T1",
    status: "ACTIVE" as const,
    endpoint: "https://e",
    passcode: "p",
  };

  it("listTeamWebhooks returns seeded webhooks", async () => {
    const fake = new FigmaApiFake();
    fake.__seedTeamWebhooks("T1", [seedWebhook]);
    const r = await fake.listTeamWebhooks("T1");
    expect(r.webhooks).toHaveLength(1);
    expect(r.webhooks[0].id).toBe("wh1");
  });

  it("listTeamWebhooks returns empty list for unknown team", async () => {
    const fake = new FigmaApiFake();
    const r = await fake.listTeamWebhooks("T9");
    expect(r.webhooks).toEqual([]);
  });

  it("getWebhook returns seeded webhook + 404 for missing", async () => {
    const fake = new FigmaApiFake();
    fake.__seedWebhook(seedWebhook);
    expect((await fake.getWebhook("wh1")).webhook.id).toBe("wh1");
    await expect(fake.getWebhook("missing")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("getWebhookRequests returns seeded requests", async () => {
    const fake = new FigmaApiFake();
    fake.__seedWebhook(seedWebhook);
    fake.__seedWebhookRequests("wh1", [
      {
        webhook_id: "wh1",
        request_info: {
          id: "r1",
          endpoint: "https://e",
          payload: {},
          sent_at: "2026-01-01T00:00:00Z",
        },
        response_info: { status: "200", received_at: "2026-01-01T00:00:01Z" },
      },
    ]);
    const r = await fake.getWebhookRequests("wh1");
    expect(r.requests).toHaveLength(1);
  });

  it("getWebhookRequests throws 404 for missing webhook", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.getWebhookRequests("missing")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("createWebhook adds to team list and storage", async () => {
    const fake = new FigmaApiFake();
    const r = await fake.createWebhook({
      event_type: "FILE_UPDATE",
      team_id: "T1",
      endpoint: "https://e",
      passcode: "p",
      description: "test",
    });
    expect(r.webhook.id).toMatch(/^wh/);
    expect(r.webhook.status).toBe("ACTIVE");
    expect(r.webhook.description).toBe("test");
    const list = await fake.listTeamWebhooks("T1");
    expect(list.webhooks).toHaveLength(1);
  });

  it("createWebhook respects PAUSED status", async () => {
    const fake = new FigmaApiFake();
    const r = await fake.createWebhook({
      event_type: "FILE_COMMENT",
      team_id: "T1",
      endpoint: "https://e",
      passcode: "p",
      status: "PAUSED",
    });
    expect(r.webhook.status).toBe("PAUSED");
  });

  it("updateWebhook merges fields", async () => {
    const fake = new FigmaApiFake();
    const created = await fake.createWebhook({
      event_type: "FILE_UPDATE",
      team_id: "T1",
      endpoint: "https://e",
      passcode: "p",
    });
    const r = await fake.updateWebhook(created.webhook.id, {
      status: "PAUSED",
      endpoint: "https://e2",
      passcode: "p2",
      description: "d",
    });
    expect(r.webhook.status).toBe("PAUSED");
    expect(r.webhook.endpoint).toBe("https://e2");
    expect(r.webhook.passcode).toBe("p2");
    expect(r.webhook.description).toBe("d");
  });

  it("updateWebhook throws 404 for missing webhook", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.updateWebhook("missing", { status: "PAUSED" })).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("deleteWebhook removes the webhook", async () => {
    const fake = new FigmaApiFake();
    const created = await fake.createWebhook({
      event_type: "FILE_UPDATE",
      team_id: "T1",
      endpoint: "https://e",
      passcode: "p",
    });
    await fake.deleteWebhook(created.webhook.id);
    const list = await fake.listTeamWebhooks("T1");
    expect(list.webhooks).toEqual([]);
    await expect(fake.getWebhook(created.webhook.id)).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });

  it("deleteWebhook throws 404 for missing webhook", async () => {
    const fake = new FigmaApiFake();
    await expect(fake.deleteWebhook("missing")).rejects.toMatchObject({
      code: "E_FIGMA_REST_404",
    });
  });
});
