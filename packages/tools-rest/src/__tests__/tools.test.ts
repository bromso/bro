import { describe, expect, it } from "vitest";
import {
  GetFileBranches,
  GetFileComponentSets,
  GetFileComponents,
  GetFileMetadata,
  GetFilePages,
  GetFileStyles,
  GetFileVersions,
  GetImageFills,
  GetImageRenders,
  GetNodeById,
  GetUserMe,
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
        name: "X",
        lastModified: "2026-01-01",
        version: "1",
        role: "owner",
        editorType: "figma",
      }).success
    ).toBe(true);
  });
});

describe("GetFilePages schema", () => {
  it("output is { pages: [{id, name}] }", () => {
    expect(GetFilePages.output.safeParse({ pages: [{ id: "1:0", name: "Page 1" }] }).success).toBe(
      true
    );
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
    expect(GetNodeById.output.safeParse({ id: "missing", type: "", found: false }).success).toBe(
      true
    );
  });
});

describe("GetFileVersions schema", () => {
  it("accepts optional pageSize/before/after", () => {
    expect(GetFileVersions.input.safeParse({ fileKey: "ABC" }).success).toBe(true);
    expect(
      GetFileVersions.input.safeParse({
        fileKey: "ABC",
        pageSize: 10,
        before: "100",
        after: "50",
      }).success
    ).toBe(true);
  });

  it("rejects non-positive pageSize", () => {
    expect(GetFileVersions.input.safeParse({ fileKey: "ABC", pageSize: 0 }).success).toBe(false);
  });
});

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
        mainFileKey: "ABC",
        branches: [],
      }).success
    ).toBe(true);
  });
});

describe("GetImageRenders schema", () => {
  it("requires fileKey + non-empty nodeIds", () => {
    expect(GetImageRenders.input.safeParse({ fileKey: "ABC", nodeIds: ["1:2"] }).success).toBe(
      true
    );
    expect(GetImageRenders.input.safeParse({ fileKey: "ABC", nodeIds: [] }).success).toBe(false);
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
