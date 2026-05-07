import type { FigmaApi } from "@repo/figma-api-client";
import type { ServerHandler } from "@repo/protocol";
import { mapRestError, requireApiKey, requireWriteEnabled } from "./guards";
import type {
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
} from "./tools";

export interface RestDeps {
  readonly figmaApi: FigmaApi | null;
}

export function createGetFileMetadataServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileMetadata> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_metadata");
    try {
      const f = await api.getFile(args.fileKey);
      return {
        name: f.name,
        lastModified: f.lastModified,
        version: f.version,
        role: f.role,
        editorType: f.editorType,
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetFilePagesServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFilePages> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_pages");
    try {
      const pages = await api.getFilePages(args.fileKey);
      return { pages: [...pages] };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetNodeByIdServerHandler(deps: RestDeps): ServerHandler<typeof GetNodeById> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_node_by_id");
    try {
      const r = await api.getFileNodes(args.fileKey, [args.nodeId]);
      const entry = r.nodes[args.nodeId];
      if (!entry) return { id: args.nodeId, type: "", found: false };
      return {
        id: entry.document.id,
        type: entry.document.type,
        name: entry.document.name,
        found: true,
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetFileVersionsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileVersions> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_versions");
    try {
      const r = await api.getFileVersions(args.fileKey, {
        pageSize: args.pageSize,
        before: args.before,
        after: args.after,
      });
      return {
        versions: r.versions.map((v) => ({
          id: v.id,
          createdAt: v.created_at,
          label: v.label,
          description: v.description,
          userHandle: v.user.handle,
        })),
        pagination: {
          prevPage: r.pagination.prev_page,
          nextPage: r.pagination.next_page,
        },
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetFileStylesServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileStyles> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_styles");
    try {
      const r = await api.getFileStyles(args.fileKey);
      const out = {
        paint: [] as unknown[],
        text: [] as unknown[],
        effect: [] as unknown[],
        grid: [] as unknown[],
      };
      for (const s of r.meta.styles) {
        const summary = {
          key: s.key,
          name: s.name,
          description: s.description,
          nodeId: s.node_id,
        };
        if (s.style_type === "FILL") out.paint.push(summary);
        else if (s.style_type === "TEXT") out.text.push(summary);
        else if (s.style_type === "EFFECT") out.effect.push(summary);
        else if (s.style_type === "GRID") out.grid.push(summary);
      }
      return out as never;
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetFileComponentsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileComponents> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_components");
    try {
      const r = await api.getFileComponents(args.fileKey);
      return {
        components: r.meta.components.map((c) => ({
          key: c.key,
          name: c.name,
          description: c.description,
          nodeId: c.node_id,
        })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetFileComponentSetsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileComponentSets> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_component_sets");
    try {
      const r = await api.getFileComponentSets(args.fileKey);
      return {
        componentSets: r.meta.component_sets.map((c) => ({
          key: c.key,
          name: c.name,
          description: c.description,
          nodeId: c.node_id,
        })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetFileBranchesServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileBranches> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_branches");
    try {
      const r = await api.getFileBranches(args.fileKey);
      return {
        mainFileKey: r.main_file_key,
        branches: r.branches.map((b) => ({
          key: b.key,
          name: b.name,
          lastModified: b.last_modified,
        })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetImageRendersServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetImageRenders> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_image_renders");
    try {
      const r = await api.getImages(args.fileKey, {
        ids: args.nodeIds,
        format: args.format,
        scale: args.scale,
      });
      return { images: r.images };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetImageFillsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetImageFills> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_image_fills");
    try {
      const r = await api.getImageFills(args.fileKey);
      return { images: r.meta.images };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetUserMeServerHandler(deps: RestDeps): ServerHandler<typeof GetUserMe> {
  return async (_args) => {
    const api = requireApiKey(deps.figmaApi, "get_user_me");
    try {
      const me = await api.getMe();
      return { id: me.id, email: me.email, handle: me.handle, imgUrl: me.img_url };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export interface RestWriteDeps extends RestDeps {
  readonly enableWriteTools: boolean;
}

const narrowComment = (c: {
  id: string;
  message: string;
  parent_id?: string;
  user: { handle: string };
  created_at: string;
  client_meta?: { x: number; y: number };
}) => ({
  id: c.id,
  message: c.message,
  parentId: c.parent_id || undefined,
  userHandle: c.user.handle,
  createdAt: c.created_at,
  x: c.client_meta?.x,
  y: c.client_meta?.y,
});

export function createGetFileCommentsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetFileComments> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_file_comments");
    try {
      const r = await api.getFileComments(args.fileKey);
      return { comments: r.comments.map(narrowComment) };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createPostFileCommentServerHandler(
  deps: RestWriteDeps
): ServerHandler<typeof PostFileComment> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "post_file_comment");
    requireWriteEnabled(deps, "post_file_comment");
    try {
      const c = await api.postFileComment(args.fileKey, {
        message: args.message,
        ...(args.x !== undefined && args.y !== undefined
          ? { client_meta: { x: args.x, y: args.y } }
          : {}),
      });
      return narrowComment(c);
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createDeleteFileCommentServerHandler(
  deps: RestWriteDeps
): ServerHandler<typeof DeleteFileComment> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "delete_file_comment");
    requireWriteEnabled(deps, "delete_file_comment");
    try {
      await api.deleteFileComment(args.fileKey, args.commentId);
      return { ok: true as const };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetTeamProjectsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetTeamProjects> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_team_projects");
    try {
      const r = await api.getTeamProjects(args.teamId);
      return {
        name: r.name,
        projects: r.projects.map((p) => ({ id: p.id, name: p.name })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetProjectFilesServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetProjectFiles> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_project_files");
    try {
      const r = await api.getProjectFiles(args.projectId, {
        branch_data: args.branchData,
      });
      return {
        name: r.name,
        files: r.files.map((f) => ({
          key: f.key,
          name: f.name,
          lastModified: f.last_modified,
        })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetTeamComponentsServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetTeamComponents> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_team_components");
    try {
      const r = await api.getTeamComponents(args.teamId, {
        pageSize: args.pageSize,
        cursor: args.cursor,
      });
      const next = r.meta.cursor?.after;
      return {
        components: r.meta.components.map((c) => ({
          key: c.key,
          name: c.name,
          description: c.description,
          nodeId: c.node_id,
        })),
        ...(next !== undefined ? { nextCursor: String(next) } : {}),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetTeamStylesServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetTeamStyles> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_team_styles");
    try {
      const r = await api.getTeamStyles(args.teamId, {
        pageSize: args.pageSize,
        cursor: args.cursor,
      });
      const next = r.meta.cursor?.after;
      return {
        styles: r.meta.styles.map((s) => ({
          key: s.key,
          name: s.name,
          description: s.description,
          styleType: s.style_type,
        })),
        ...(next !== undefined ? { nextCursor: String(next) } : {}),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createGetDevResourcesServerHandler(
  deps: RestDeps
): ServerHandler<typeof GetDevResources> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "get_dev_resources");
    try {
      const r = await api.getDevResources(args.fileKey, { node_ids: args.nodeIds });
      return {
        devResources: r.dev_resources.map((d) => ({
          id: d.id,
          fileKey: d.file_key,
          nodeId: d.node_id,
          name: d.name,
          url: d.url,
        })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}

export function createPostDevResourcesServerHandler(
  deps: RestWriteDeps
): ServerHandler<typeof PostDevResources> {
  return async (args) => {
    const api = requireApiKey(deps.figmaApi, "post_dev_resources");
    requireWriteEnabled(deps, "post_dev_resources");
    try {
      const r = await api.postDevResources(
        args.resources.map((res) => ({
          file_key: res.fileKey,
          node_id: res.nodeId,
          name: res.name,
          url: res.url,
        }))
      );
      return {
        devResources: r.dev_resources.map((d) => ({
          id: d.id,
          fileKey: d.file_key,
          nodeId: d.node_id,
          name: d.name,
          url: d.url,
        })),
      };
    } catch (err) {
      mapRestError(err);
    }
  };
}
