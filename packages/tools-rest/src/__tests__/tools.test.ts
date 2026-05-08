import { describe, expect, it } from "vitest";
import {
  DeleteFileComment,
  GetDevResources,
  GetFileBranches,
  GetFileComments,
  GetFileComponentSets,
  GetFileComponents,
  GetFileMetadata,
  GetFilePages,
  GetFileStyles,
  GetFileVersions,
  GetImageFills,
  GetImageRenders,
  GetNodeById,
  GetProjectFiles,
  GetTeamComponents,
  GetTeamProjects,
  GetTeamStyles,
  GetUserMe,
  GetWebhook,
  GetWebhookRequests,
  ListTeamWebhooks,
  PostDevResources,
  PostFileComment,
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

describe("GetFileComments schema", () => {
  it("requires fileKey", () => {
    expect(GetFileComments.input.safeParse({ fileKey: "ABC" }).success).toBe(true);
  });

  it("output { comments: [...] }", () => {
    expect(GetFileComments.output.safeParse({ comments: [] }).success).toBe(true);
  });
});

describe("PostFileComment schema", () => {
  it("requires fileKey + message", () => {
    expect(PostFileComment.input.safeParse({ fileKey: "ABC", message: "hi" }).success).toBe(true);
    expect(PostFileComment.input.safeParse({ fileKey: "ABC" }).success).toBe(false);
  });

  it("rejects empty message", () => {
    expect(PostFileComment.input.safeParse({ fileKey: "ABC", message: "" }).success).toBe(false);
  });

  it("accepts optional x/y pin", () => {
    expect(
      PostFileComment.input.safeParse({ fileKey: "ABC", message: "x", x: 10, y: 20 }).success
    ).toBe(true);
  });
});

describe("DeleteFileComment schema", () => {
  it("requires fileKey + commentId", () => {
    expect(DeleteFileComment.input.safeParse({ fileKey: "ABC", commentId: "c1" }).success).toBe(
      true
    );
  });

  it("output is { ok: true }", () => {
    expect(DeleteFileComment.output.safeParse({ ok: true }).success).toBe(true);
  });
});

describe("GetTeamProjects schema", () => {
  it("requires teamId", () => {
    expect(GetTeamProjects.input.safeParse({ teamId: "T1" }).success).toBe(true);
  });

  it("output { name, projects: [...] }", () => {
    expect(
      GetTeamProjects.output.safeParse({
        name: "Team",
        projects: [{ id: "P1", name: "Web" }],
      }).success
    ).toBe(true);
  });
});

describe("GetProjectFiles schema", () => {
  it("requires projectId", () => {
    expect(GetProjectFiles.input.safeParse({ projectId: "P1" }).success).toBe(true);
  });

  it("output { name, files: [...] }", () => {
    expect(
      GetProjectFiles.output.safeParse({
        name: "Web",
        files: [{ key: "ABC", name: "Home", lastModified: "x" }],
      }).success
    ).toBe(true);
  });
});

describe("GetTeamComponents schema", () => {
  it("accepts optional pageSize + cursor", () => {
    expect(
      GetTeamComponents.input.safeParse({ teamId: "T1", pageSize: 30, cursor: "c1" }).success
    ).toBe(true);
  });

  it("output { components, nextCursor? }", () => {
    expect(
      GetTeamComponents.output.safeParse({
        components: [{ key: "k", name: "n", description: "" }],
        nextCursor: "after:100",
      }).success
    ).toBe(true);
    expect(GetTeamComponents.output.safeParse({ components: [] }).success).toBe(true);
  });
});

describe("GetTeamStyles schema", () => {
  it("accepts optional pageSize + cursor", () => {
    expect(
      GetTeamStyles.input.safeParse({ teamId: "T1", pageSize: 25, cursor: "c1" }).success
    ).toBe(true);
  });

  it("output { styles, nextCursor? }", () => {
    expect(GetTeamStyles.output.safeParse({ styles: [], nextCursor: "200" }).success).toBe(true);
  });
});

describe("GetDevResources schema", () => {
  it("requires fileKey", () => {
    expect(GetDevResources.input.safeParse({ fileKey: "ABC" }).success).toBe(true);
  });

  it("accepts optional nodeIds filter", () => {
    expect(GetDevResources.input.safeParse({ fileKey: "ABC", nodeIds: ["1:2"] }).success).toBe(
      true
    );
  });

  it("output { devResources: [...] }", () => {
    expect(
      GetDevResources.output.safeParse({
        devResources: [{ id: "dr1", fileKey: "ABC", nodeId: "1:2", name: "Story", url: "u" }],
      }).success
    ).toBe(true);
  });
});

describe("PostDevResources schema", () => {
  it("requires non-empty resources", () => {
    expect(
      PostDevResources.input.safeParse({
        resources: [{ fileKey: "ABC", nodeId: "1:2", name: "Story", url: "https://u" }],
      }).success
    ).toBe(true);
    expect(PostDevResources.input.safeParse({ resources: [] }).success).toBe(false);
  });

  it("rejects entries with empty url", () => {
    expect(
      PostDevResources.input.safeParse({
        resources: [{ fileKey: "ABC", nodeId: "1:2", name: "X", url: "" }],
      }).success
    ).toBe(false);
  });
});

describe("ListTeamWebhooks schema", () => {
  it("requires teamId", () => {
    expect(ListTeamWebhooks.input.safeParse({ teamId: "T1" }).success).toBe(true);
    expect(ListTeamWebhooks.input.safeParse({}).success).toBe(false);
  });

  it("rejects empty teamId", () => {
    expect(ListTeamWebhooks.input.safeParse({ teamId: "" }).success).toBe(false);
  });

  it("rejects extraneous keys (strict)", () => {
    expect(ListTeamWebhooks.input.safeParse({ teamId: "T1", extra: 1 }).success).toBe(false);
  });

  it("output is { webhooks: [...] }", () => {
    expect(ListTeamWebhooks.output.safeParse({ webhooks: [] }).success).toBe(true);
    expect(
      ListTeamWebhooks.output.safeParse({
        webhooks: [
          {
            id: "wh1",
            eventType: "FILE_UPDATE",
            teamId: "T1",
            status: "ACTIVE",
            endpoint: "https://e",
            passcode: "p",
          },
        ],
      }).success
    ).toBe(true);
  });
});

describe("GetWebhook schema", () => {
  it("requires webhookId", () => {
    expect(GetWebhook.input.safeParse({ webhookId: "wh1" }).success).toBe(true);
    expect(GetWebhook.input.safeParse({}).success).toBe(false);
  });

  it("output is { webhook: {...} }", () => {
    expect(
      GetWebhook.output.safeParse({
        webhook: {
          id: "wh1",
          eventType: "FILE_COMMENT",
          teamId: "T1",
          status: "PAUSED",
          endpoint: "https://e",
          passcode: "p",
        },
      }).success
    ).toBe(true);
  });
});

describe("GetWebhookRequests schema", () => {
  it("requires webhookId", () => {
    expect(GetWebhookRequests.input.safeParse({ webhookId: "wh1" }).success).toBe(true);
  });

  it("accepts optional pageSize", () => {
    expect(GetWebhookRequests.input.safeParse({ webhookId: "wh1", pageSize: 10 }).success).toBe(
      true
    );
  });

  it("rejects non-positive pageSize", () => {
    expect(GetWebhookRequests.input.safeParse({ webhookId: "wh1", pageSize: 0 }).success).toBe(
      false
    );
  });

  it("output is { requests: [...] }", () => {
    expect(GetWebhookRequests.output.safeParse({ requests: [] }).success).toBe(true);
  });
});
