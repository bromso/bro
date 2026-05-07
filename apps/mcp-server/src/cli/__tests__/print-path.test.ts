import { describe, expect, it } from "vitest";
import { resolveManifestPath } from "../print-path";

describe("resolveManifestPath", () => {
  it("resolves relative to import.meta.url", () => {
    const stubbedMetaUrl = "file:///opt/figma-mcp/dist/main.js";
    const result = resolveManifestPath({ metaUrl: stubbedMetaUrl });
    expect(result).toBe("/opt/figma-mcp/dist/plugin/manifest.json");
  });

  it("works with file URLs containing spaces", () => {
    const stubbedMetaUrl = "file:///Users/me/dir%20with%20space/dist/main.js";
    const result = resolveManifestPath({ metaUrl: stubbedMetaUrl });
    expect(result).toBe("/Users/me/dir with space/dist/plugin/manifest.json");
  });
});
