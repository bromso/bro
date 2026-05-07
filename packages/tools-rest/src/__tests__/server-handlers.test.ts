import { FigmaApiFake } from "@repo/figma-api-client";
import { describe, expect, it } from "vitest";
import {
  createGetFileBranchesServerHandler,
  createGetFileComponentSetsServerHandler,
  createGetFileComponentsServerHandler,
  createGetFileMetadataServerHandler,
  createGetFilePagesServerHandler,
  createGetFileStylesServerHandler,
  createGetFileVersionsServerHandler,
  createGetImageFillsServerHandler,
  createGetImageRendersServerHandler,
  createGetNodeByIdServerHandler,
  createGetUserMeServerHandler,
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
