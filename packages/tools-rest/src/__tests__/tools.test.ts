import { describe, expect, it } from "vitest";
import { GetFileMetadata, GetFilePages, GetFileVersions, GetNodeById } from "../tools";

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
