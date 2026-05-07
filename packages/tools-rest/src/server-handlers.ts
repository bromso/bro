import type { FigmaApi } from "@repo/figma-api-client";
import type { ServerHandler } from "@repo/protocol";
import { mapRestError, requireApiKey } from "./guards";
import type { GetFileMetadata, GetFilePages, GetFileVersions, GetNodeById } from "./tools";

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
