import { FigmaApiFake } from "@repo/figma-api-client";
import { describe, expect, it } from "vitest";
import {
  createCreateWebhookServerHandler,
  createDeleteFileCommentServerHandler,
  createDeleteWebhookServerHandler,
  createGetDevResourcesServerHandler,
  createGetFileBranchesServerHandler,
  createGetFileCommentsServerHandler,
  createGetFileComponentSetsServerHandler,
  createGetFileComponentsServerHandler,
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
  createGetWebhookRequestsServerHandler,
  createGetWebhookServerHandler,
  createListTeamWebhooksServerHandler,
  createPostDevResourcesServerHandler,
  createPostFileCommentServerHandler,
  createUpdateWebhookServerHandler,
} from "../server-handlers";

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
const ctx = { logger: noopLogger };

describe("get_file_metadata server handler", () => {
  it("returns narrowed metadata", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F",
      lastModified: "2026-01-01",
      version: "v9",
      role: "owner",
      editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    const handler = createGetFileMetadataServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r).toEqual({
      name: "F",
      lastModified: "2026-01-01",
      version: "v9",
      role: "owner",
      editorType: "figma",
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
            name: "P",
            children: [{ id: "2:5", type: "FRAME", name: "Hero" }],
          },
        ],
      },
    });
    const handler = createGetNodeByIdServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC", nodeId: "2:5" }, ctx);
    expect(r).toEqual({ id: "2:5", type: "FRAME", name: "Hero", found: true });
  });

  it("returns found: false when the node does not exist", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F",
      lastModified: "x",
      version: "1",
      role: "owner",
      editorType: "figma",
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
      versions: [
        {
          id: "v1",
          created_at: "2026-01-01T00:00:00Z",
          label: "alpha",
          description: "first",
          user: { handle: "j" },
        },
      ],
      pagination: { next_page: "200" },
    });
    const handler = createGetFileVersionsServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r.versions).toEqual([
      {
        id: "v1",
        createdAt: "2026-01-01T00:00:00Z",
        label: "alpha",
        description: "first",
        userHandle: "j",
      },
    ]);
    expect(r.pagination.nextPage).toBe("200");
  });
});

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
        components: [{ key: "k1", name: "Btn", description: "primary", node_id: "5:1" }],
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
      error: false,
      status: 200,
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

describe("get_file_comments server handler", () => {
  it("returns narrowed comments", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F",
      lastModified: "x",
      version: "1",
      role: "owner",
      editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    await figmaApi.postFileComment("ABC", { message: "first" });
    const handler = createGetFileCommentsServerHandler({ figmaApi });
    const r = await handler({ fileKey: "ABC" }, ctx);
    expect(r.comments).toHaveLength(1);
    expect(r.comments[0].message).toBe("first");
    expect(r.comments[0].userHandle).toBe("fake-user");
  });

  it("propagates E_FIGMA_REST_404 when the file is unseeded", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createGetFileCommentsServerHandler({ figmaApi });
    await expect(handler({ fileKey: "MISSING" }, ctx)).rejects.toThrow(/E_FIGMA_REST_404/);
  });
});

describe("post_file_comment server handler", () => {
  it("returns E_WRITE_TOOLS_DISABLED when the gate is closed", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createPostFileCommentServerHandler({ figmaApi, enableWriteTools: false });
    await expect(handler({ fileKey: "ABC", message: "hi" }, ctx)).rejects.toThrow(
      /E_WRITE_TOOLS_DISABLED/
    );
  });

  it("posts when the gate is open", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F",
      lastModified: "x",
      version: "1",
      role: "owner",
      editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    const handler = createPostFileCommentServerHandler({ figmaApi, enableWriteTools: true });
    const r = await handler({ fileKey: "ABC", message: "hi" }, ctx);
    expect(r.message).toBe("hi");
    expect(r.id).toMatch(/^c/);
  });

  it("E_FIGMA_API_KEY_MISSING precedes the write-gate check", async () => {
    const handler = createPostFileCommentServerHandler({ figmaApi: null, enableWriteTools: true });
    await expect(handler({ fileKey: "ABC", message: "hi" }, ctx)).rejects.toThrow(
      /E_FIGMA_API_KEY_MISSING/
    );
  });
});

describe("delete_file_comment server handler", () => {
  it("returns E_WRITE_TOOLS_DISABLED when the gate is closed", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createDeleteFileCommentServerHandler({ figmaApi, enableWriteTools: false });
    await expect(handler({ fileKey: "ABC", commentId: "c1" }, ctx)).rejects.toThrow(
      /E_WRITE_TOOLS_DISABLED/
    );
  });

  it("deletes when gate is open and the comment exists", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F",
      lastModified: "x",
      version: "1",
      role: "owner",
      editorType: "figma",
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
      name: "F",
      lastModified: "x",
      version: "1",
      role: "owner",
      editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });
    const handler = createDeleteFileCommentServerHandler({ figmaApi, enableWriteTools: true });
    await expect(handler({ fileKey: "ABC", commentId: "missing" }, ctx)).rejects.toThrow(
      /E_FIGMA_REST_404/
    );
  });
});

describe("get_team_projects server handler", () => {
  it("returns the seeded projects", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedTeamProjects("T1", {
      name: "Team",
      projects: [{ id: "P1", name: "Web" }],
    });
    const handler = createGetTeamProjectsServerHandler({ figmaApi });
    expect(await handler({ teamId: "T1" }, ctx)).toEqual({
      name: "Team",
      projects: [{ id: "P1", name: "Web" }],
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

  it("propagates E_FIGMA_REST_404 when the team is unseeded", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createGetTeamStylesServerHandler({ figmaApi });
    await expect(handler({ teamId: "MISSING" }, ctx)).rejects.toThrow(/E_FIGMA_REST_404/);
  });
});

describe("get_dev_resources server handler", () => {
  it("returns dev resources", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F",
      lastModified: "x",
      version: "1",
      role: "owner",
      editorType: "figma",
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

  it("propagates E_FIGMA_REST_404 when the file is unseeded", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createGetDevResourcesServerHandler({ figmaApi });
    await expect(handler({ fileKey: "MISSING" }, ctx)).rejects.toThrow(/E_FIGMA_REST_404/);
  });
});

describe("post_dev_resources server handler", () => {
  it("E_WRITE_TOOLS_DISABLED when gate is closed", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createPostDevResourcesServerHandler({ figmaApi, enableWriteTools: false });
    await expect(
      handler({ resources: [{ fileKey: "ABC", nodeId: "1:2", name: "X", url: "u" }] }, ctx)
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

  it("propagates underlying client errors through mapRestError", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.postDevResources = async () => {
      throw new Error("boom");
    };
    const handler = createPostDevResourcesServerHandler({ figmaApi, enableWriteTools: true });
    await expect(
      handler(
        { resources: [{ fileKey: "ABC", nodeId: "1:2", name: "Story", url: "https://u" }] },
        ctx
      )
    ).rejects.toThrow(/boom/);
  });
});

describe("list_team_webhooks server handler", () => {
  it("returns the seeded webhooks (narrowed)", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedTeamWebhooks("T1", [
      {
        id: "wh1",
        event_type: "FILE_UPDATE",
        team_id: "T1",
        status: "ACTIVE",
        endpoint: "https://e",
        passcode: "p",
        description: "d",
      },
    ]);
    const handler = createListTeamWebhooksServerHandler({ figmaApi });
    const r = await handler({ teamId: "T1" }, ctx);
    expect(r.webhooks).toHaveLength(1);
    expect(r.webhooks[0]).toEqual({
      id: "wh1",
      eventType: "FILE_UPDATE",
      teamId: "T1",
      status: "ACTIVE",
      endpoint: "https://e",
      passcode: "p",
      description: "d",
    });
  });

  it("E_FIGMA_API_KEY_MISSING when no client is wired", async () => {
    const handler = createListTeamWebhooksServerHandler({ figmaApi: null });
    await expect(handler({ teamId: "T1" }, ctx)).rejects.toThrow(/E_FIGMA_API_KEY_MISSING/);
  });

  it("propagates underlying errors through mapRestError", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.listTeamWebhooks = async () => {
      throw new Error("boom");
    };
    const handler = createListTeamWebhooksServerHandler({ figmaApi });
    await expect(handler({ teamId: "T1" }, ctx)).rejects.toThrow(/boom/);
  });
});

describe("get_webhook server handler", () => {
  it("returns the webhook narrowed", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedWebhook({
      id: "wh1",
      event_type: "FILE_COMMENT",
      team_id: "T1",
      status: "PAUSED",
      endpoint: "https://e",
      passcode: "p",
    });
    const handler = createGetWebhookServerHandler({ figmaApi });
    const r = await handler({ webhookId: "wh1" }, ctx);
    expect(r.webhook.id).toBe("wh1");
    expect(r.webhook.eventType).toBe("FILE_COMMENT");
    expect(r.webhook.status).toBe("PAUSED");
  });

  it("propagates E_FIGMA_REST_404 when the webhook is missing", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createGetWebhookServerHandler({ figmaApi });
    await expect(handler({ webhookId: "missing" }, ctx)).rejects.toThrow(/E_FIGMA_REST_404/);
  });
});

describe("get_webhook_requests server handler", () => {
  it("returns narrowed delivery logs", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedWebhook({
      id: "wh1",
      event_type: "FILE_UPDATE",
      team_id: "T1",
      status: "ACTIVE",
      endpoint: "https://e",
      passcode: "p",
    });
    figmaApi.__seedWebhookRequests("wh1", [
      {
        webhook_id: "wh1",
        request_info: {
          id: "r1",
          endpoint: "https://e",
          payload: { hello: "world" },
          sent_at: "2026-01-01T00:00:00Z",
        },
        response_info: { status: "200", received_at: "2026-01-01T00:00:01Z" },
        error_msg: "none",
      },
    ]);
    const handler = createGetWebhookRequestsServerHandler({ figmaApi });
    const r = await handler({ webhookId: "wh1", pageSize: 10 }, ctx);
    expect(r.requests).toHaveLength(1);
    expect(r.requests[0].request.id).toBe("r1");
    expect(r.requests[0].response.status).toBe("200");
    expect(r.requests[0].errorMessage).toBe("none");
  });

  it("omits errorMessage when none", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedWebhook({
      id: "wh1",
      event_type: "FILE_UPDATE",
      team_id: "T1",
      status: "ACTIVE",
      endpoint: "https://e",
      passcode: "p",
    });
    figmaApi.__seedWebhookRequests("wh1", [
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
    const handler = createGetWebhookRequestsServerHandler({ figmaApi });
    const r = await handler({ webhookId: "wh1" }, ctx);
    expect(r.requests[0].errorMessage).toBeUndefined();
  });

  it("propagates E_FIGMA_REST_404 when the webhook is missing", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createGetWebhookRequestsServerHandler({ figmaApi });
    await expect(handler({ webhookId: "missing" }, ctx)).rejects.toThrow(/E_FIGMA_REST_404/);
  });
});

describe("create_webhook server handler", () => {
  it("E_WRITE_TOOLS_DISABLED when gate is closed", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createCreateWebhookServerHandler({ figmaApi, enableWriteTools: false });
    await expect(
      handler(
        {
          eventType: "FILE_UPDATE",
          teamId: "T1",
          endpoint: "https://e",
          passcode: "p",
        },
        ctx
      )
    ).rejects.toThrow(/E_WRITE_TOOLS_DISABLED/);
  });

  it("creates when gate is open", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createCreateWebhookServerHandler({ figmaApi, enableWriteTools: true });
    const r = await handler(
      {
        eventType: "FILE_UPDATE",
        teamId: "T1",
        endpoint: "https://e",
        passcode: "p",
        description: "test",
      },
      ctx
    );
    expect(r.webhook.id).toMatch(/^wh/);
    expect(r.webhook.eventType).toBe("FILE_UPDATE");
    expect(r.webhook.teamId).toBe("T1");
    expect(r.webhook.status).toBe("ACTIVE");
    expect(r.webhook.description).toBe("test");
    // verify side-effect: now listable
    const list = await figmaApi.listTeamWebhooks("T1");
    expect(list.webhooks).toHaveLength(1);
  });

  it("E_FIGMA_API_KEY_MISSING precedes the write-gate check", async () => {
    const handler = createCreateWebhookServerHandler({ figmaApi: null, enableWriteTools: true });
    await expect(
      handler(
        {
          eventType: "FILE_UPDATE",
          teamId: "T1",
          endpoint: "https://e",
          passcode: "p",
        },
        ctx
      )
    ).rejects.toThrow(/E_FIGMA_API_KEY_MISSING/);
  });

  it("propagates underlying client errors through mapRestError", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.createWebhook = async () => {
      throw new Error("boom");
    };
    const handler = createCreateWebhookServerHandler({ figmaApi, enableWriteTools: true });
    await expect(
      handler(
        {
          eventType: "FILE_UPDATE",
          teamId: "T1",
          endpoint: "https://e",
          passcode: "p",
        },
        ctx
      )
    ).rejects.toThrow(/boom/);
  });
});

describe("update_webhook server handler", () => {
  it("E_WRITE_TOOLS_DISABLED when gate is closed", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createUpdateWebhookServerHandler({ figmaApi, enableWriteTools: false });
    await expect(handler({ webhookId: "wh1", status: "PAUSED" }, ctx)).rejects.toThrow(
      /E_WRITE_TOOLS_DISABLED/
    );
  });

  it("updates when gate is open", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedWebhook({
      id: "wh1",
      event_type: "FILE_UPDATE",
      team_id: "T1",
      status: "ACTIVE",
      endpoint: "https://e",
      passcode: "p",
    });
    const handler = createUpdateWebhookServerHandler({ figmaApi, enableWriteTools: true });
    const r = await handler(
      { webhookId: "wh1", status: "PAUSED", endpoint: "https://e2", description: "d2" },
      ctx
    );
    expect(r.webhook.status).toBe("PAUSED");
    expect(r.webhook.endpoint).toBe("https://e2");
    expect(r.webhook.description).toBe("d2");
  });

  it("propagates E_FIGMA_REST_404 when the webhook is missing", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createUpdateWebhookServerHandler({ figmaApi, enableWriteTools: true });
    await expect(handler({ webhookId: "missing", status: "PAUSED" }, ctx)).rejects.toThrow(
      /E_FIGMA_REST_404/
    );
  });

  it("propagates underlying client errors through mapRestError", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.updateWebhook = async () => {
      throw new Error("boom");
    };
    const handler = createUpdateWebhookServerHandler({ figmaApi, enableWriteTools: true });
    await expect(handler({ webhookId: "wh1", status: "PAUSED" }, ctx)).rejects.toThrow(/boom/);
  });

  it("E_FIGMA_API_KEY_MISSING when no client is wired", async () => {
    const handler = createUpdateWebhookServerHandler({ figmaApi: null, enableWriteTools: true });
    await expect(handler({ webhookId: "wh1" }, ctx)).rejects.toThrow(/E_FIGMA_API_KEY_MISSING/);
  });

  it("supports passcode-only updates (no other fields)", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedWebhook({
      id: "wh1",
      event_type: "FILE_UPDATE",
      team_id: "T1",
      status: "ACTIVE",
      endpoint: "https://e",
      passcode: "p",
    });
    const handler = createUpdateWebhookServerHandler({ figmaApi, enableWriteTools: true });
    const r = await handler({ webhookId: "wh1", passcode: "p2" }, ctx);
    expect(r.webhook.passcode).toBe("p2");
  });
});

describe("delete_webhook server handler", () => {
  it("E_WRITE_TOOLS_DISABLED when gate is closed", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createDeleteWebhookServerHandler({ figmaApi, enableWriteTools: false });
    await expect(handler({ webhookId: "wh1" }, ctx)).rejects.toThrow(/E_WRITE_TOOLS_DISABLED/);
  });

  it("deletes when gate is open", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedWebhook({
      id: "wh1",
      event_type: "FILE_UPDATE",
      team_id: "T1",
      status: "ACTIVE",
      endpoint: "https://e",
      passcode: "p",
    });
    const handler = createDeleteWebhookServerHandler({ figmaApi, enableWriteTools: true });
    const r = await handler({ webhookId: "wh1" }, ctx);
    expect(r).toEqual({ ok: true });
    await expect(figmaApi.getWebhook("wh1")).rejects.toThrow();
  });

  it("propagates E_FIGMA_REST_404 when the webhook is missing", async () => {
    const figmaApi = new FigmaApiFake();
    const handler = createDeleteWebhookServerHandler({ figmaApi, enableWriteTools: true });
    await expect(handler({ webhookId: "missing" }, ctx)).rejects.toThrow(/E_FIGMA_REST_404/);
  });

  it("propagates underlying client errors through mapRestError", async () => {
    const figmaApi = new FigmaApiFake();
    figmaApi.deleteWebhook = async () => {
      throw new Error("boom");
    };
    const handler = createDeleteWebhookServerHandler({ figmaApi, enableWriteTools: true });
    await expect(handler({ webhookId: "wh1" }, ctx)).rejects.toThrow(/boom/);
  });

  it("E_FIGMA_API_KEY_MISSING when no client is wired", async () => {
    const handler = createDeleteWebhookServerHandler({ figmaApi: null, enableWriteTools: true });
    await expect(handler({ webhookId: "wh1" }, ctx)).rejects.toThrow(/E_FIGMA_API_KEY_MISSING/);
  });
});
