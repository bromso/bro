import type { FigmaApi } from "@repo/figma-api-client";
import type { ServerHandler } from "@repo/protocol";
import { mapRestError, requireApiKey } from "./guards";
import type {
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
