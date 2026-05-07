import { describe, expect, it } from "vitest";
import * as pkg from "../index";

describe("@repo/tools-rest barrel", () => {
  it("re-exports guard helpers", () => {
    expect(pkg.E_FIGMA_API_KEY_MISSING).toBe("E_FIGMA_API_KEY_MISSING");
    expect(pkg.E_WRITE_TOOLS_DISABLED).toBe("E_WRITE_TOOLS_DISABLED");
    expect(typeof pkg.requireApiKey).toBe("function");
    expect(typeof pkg.requireWriteEnabled).toBe("function");
    expect(typeof pkg.mapRestError).toBe("function");
  });

  it("re-exports server-handler factories", () => {
    expect(typeof pkg.createGetFileMetadataServerHandler).toBe("function");
    expect(typeof pkg.createPostDevResourcesServerHandler).toBe("function");
  });

  it("re-exports tool definitions", () => {
    expect(pkg.GetFileMetadata.name).toBe("get_file_metadata");
    expect(pkg.PostDevResources.name).toBe("post_dev_resources");
  });
});
