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
  PostDevResources,
  PostFileComment,
} from "@repo/tools-rest";
import { describe, expect, it } from "vitest";

describe("Phase 11 tool catalog", () => {
  it("exposes 20 REST tools with the expected names", () => {
    const names = [
      GetFileMetadata.name,
      GetFilePages.name,
      GetNodeById.name,
      GetFileVersions.name,
      GetFileStyles.name,
      GetFileComponents.name,
      GetFileComponentSets.name,
      GetFileBranches.name,
      GetImageRenders.name,
      GetImageFills.name,
      GetUserMe.name,
      GetFileComments.name,
      PostFileComment.name,
      DeleteFileComment.name,
      GetTeamProjects.name,
      GetProjectFiles.name,
      GetTeamComponents.name,
      GetTeamStyles.name,
      GetDevResources.name,
      PostDevResources.name,
    ];
    expect(new Set(names).size).toBe(20);
    expect(names).toEqual([
      "get_file_metadata",
      "get_file_pages",
      "get_node_by_id",
      "get_file_versions",
      "get_file_styles",
      "get_file_components",
      "get_file_component_sets",
      "get_file_branches",
      "get_image_renders",
      "get_image_fills",
      "get_user_me",
      "get_file_comments",
      "post_file_comment",
      "delete_file_comment",
      "get_team_projects",
      "get_project_files",
      "get_team_components",
      "get_team_styles",
      "get_dev_resources",
      "post_dev_resources",
    ]);
  });

  it("every input schema rejects extraneous keys (strict)", () => {
    const tools = [
      GetFileMetadata,
      GetFilePages,
      GetNodeById,
      GetFileVersions,
      GetFileStyles,
      GetFileComponents,
      GetFileComponentSets,
      GetFileBranches,
      GetImageRenders,
      GetImageFills,
      GetUserMe,
      GetFileComments,
      PostFileComment,
      DeleteFileComment,
      GetTeamProjects,
      GetProjectFiles,
      GetTeamComponents,
      GetTeamStyles,
      GetDevResources,
      PostDevResources,
    ];
    for (const tool of tools) {
      const r = tool.input.safeParse({ __unexpected: 1 });
      expect(r.success).toBe(false);
    }
  });

  it("the three write-gated tools are clearly named (post_/delete_)", () => {
    expect(PostFileComment.name).toBe("post_file_comment");
    expect(DeleteFileComment.name).toBe("delete_file_comment");
    expect(PostDevResources.name).toBe("post_dev_resources");
  });
});
