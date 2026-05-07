import { FigmaApiFake } from "@repo/figma-api-client";
import { describe, expect, it } from "vitest";
import {
  createGetFileMetadataServerHandler,
  createGetFilePagesServerHandler,
  createGetFileVersionsServerHandler,
  createGetNodeByIdServerHandler,
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
