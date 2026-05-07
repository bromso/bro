import { defineTool } from "@repo/protocol";
import { z } from "zod";

const FileKey = z.string().min(1);
const NodeId = z.string().min(1);

export const GetFileMetadata = defineTool({
  name: "get_file_metadata",
  description:
    "REST. Return narrowed metadata for a Figma file: name, lastModified, version, role, editorType.",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({
    name: z.string(),
    lastModified: z.string(),
    version: z.string(),
    role: z.string(),
    editorType: z.string(),
  }),
});

export const GetFilePages = defineTool({
  name: "get_file_pages",
  description: "REST. Return the page list (CANVAS children) of a Figma file.",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({
    pages: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

export const GetNodeById = defineTool({
  name: "get_node_by_id",
  description:
    "REST. Return the type/name of a node by id (returns found: false when the node does not exist).",
  streaming: false,
  input: z.object({ fileKey: FileKey, nodeId: NodeId }).strict(),
  output: z.object({
    id: z.string(),
    type: z.string(),
    name: z.string().optional(),
    found: z.boolean(),
  }),
});

export const GetFileVersions = defineTool({
  name: "get_file_versions",
  description: "REST. Return the version history of a Figma file (paginated via before/after).",
  streaming: false,
  input: z
    .object({
      fileKey: FileKey,
      pageSize: z.number().int().positive().optional(),
      before: z.string().optional(),
      after: z.string().optional(),
    })
    .strict(),
  output: z.object({
    versions: z.array(
      z.object({
        id: z.string(),
        createdAt: z.string(),
        label: z.string(),
        description: z.string(),
        userHandle: z.string(),
      })
    ),
    pagination: z.object({
      prevPage: z.string().optional(),
      nextPage: z.string().optional(),
    }),
  }),
});

const StyleSummary = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  nodeId: z.string().optional(),
});

export const GetFileStyles = defineTool({
  name: "get_file_styles",
  description: "REST. Return the file's local styles bucketed by type (paint/text/effect/grid).",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({
    paint: z.array(StyleSummary),
    text: z.array(StyleSummary),
    effect: z.array(StyleSummary),
    grid: z.array(StyleSummary),
  }),
});

const ComponentSummary = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  nodeId: z.string().optional(),
});

export const GetFileComponents = defineTool({
  name: "get_file_components",
  description: "REST. Return the file's published components.",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({ components: z.array(ComponentSummary) }),
});

export const GetFileComponentSets = defineTool({
  name: "get_file_component_sets",
  description: "REST. Return the file's published component sets (variants).",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({ componentSets: z.array(ComponentSummary) }),
});

export const GetFileBranches = defineTool({
  name: "get_file_branches",
  description: "REST. Return the file's branches.",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({
    mainFileKey: z.string(),
    branches: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        lastModified: z.string(),
      })
    ),
  }),
});

export const GetImageRenders = defineTool({
  name: "get_image_renders",
  description: "REST. Render specified nodes as PNG/SVG/PDF/JPG and return presigned URLs.",
  streaming: false,
  input: z
    .object({
      fileKey: FileKey,
      nodeIds: z.array(NodeId).min(1),
      format: z.enum(["png", "svg", "pdf", "jpg"]).optional(),
      scale: z.number().positive().optional(),
    })
    .strict(),
  output: z.object({
    images: z.record(z.string().nullable()),
  }),
});

export const GetImageFills = defineTool({
  name: "get_image_fills",
  description: "REST. Return the file's image fill asset URLs (by hash).",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({ images: z.record(z.string()) }),
});

export const GetUserMe = defineTool({
  name: "get_user_me",
  description: "REST. Return the authenticated user's profile.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({
    id: z.string(),
    email: z.string(),
    handle: z.string(),
    imgUrl: z.string(),
  }),
});

const CommentSummary = z.object({
  id: z.string(),
  message: z.string(),
  parentId: z.string().optional(),
  userHandle: z.string(),
  createdAt: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const GetFileComments = defineTool({
  name: "get_file_comments",
  description: "REST. Return the file's comments.",
  streaming: false,
  input: z.object({ fileKey: FileKey }).strict(),
  output: z.object({ comments: z.array(CommentSummary) }),
});

export const PostFileComment = defineTool({
  name: "post_file_comment",
  description: "REST. Post a new comment. WRITE — gated behind --enable-write-tools (default off).",
  streaming: false,
  input: z
    .object({
      fileKey: FileKey,
      message: z.string().min(1),
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .strict(),
  output: CommentSummary,
});

export const DeleteFileComment = defineTool({
  name: "delete_file_comment",
  description: "REST. Delete a comment. WRITE — gated behind --enable-write-tools (default off).",
  streaming: false,
  input: z.object({ fileKey: FileKey, commentId: z.string().min(1) }).strict(),
  output: z.object({ ok: z.literal(true) }),
});
