export interface UserMeResponse {
  readonly id: string;
  readonly email: string;
  readonly handle: string;
  readonly img_url: string;
}

export interface FigmaFile {
  readonly name: string;
  readonly lastModified: string;
  readonly version: string;
  readonly role: string;
  readonly editorType: string;
  readonly document: {
    readonly id: string;
    readonly type: string;
    readonly children?: readonly FigmaNode[];
  };
}

export interface FigmaNode {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
  readonly children?: readonly FigmaNode[];
}

export interface NodesResponse {
  readonly nodes: Record<string, { readonly document: FigmaNode } | null>;
}

export interface PageSummary {
  readonly id: string;
  readonly name: string;
}

export interface StyleEntry {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly style_type: string;
  readonly node_id?: string;
}

export interface StylesResponse {
  readonly meta: { readonly styles: readonly StyleEntry[] };
}

export interface ComponentEntry {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly node_id?: string;
  readonly containing_frame?: { readonly name?: string; readonly nodeId?: string };
}

export interface ComponentsResponse {
  readonly meta: { readonly components: readonly ComponentEntry[] };
}

export interface ComponentSetEntry {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly node_id?: string;
}

export interface ComponentSetsResponse {
  readonly meta: { readonly component_sets: readonly ComponentSetEntry[] };
}

export interface FileVersion {
  readonly id: string;
  readonly created_at: string;
  readonly label: string;
  readonly description: string;
  readonly user: { readonly handle: string };
}

export interface VersionsResponse {
  readonly versions: readonly FileVersion[];
  readonly pagination: { readonly prev_page?: string; readonly next_page?: string };
}

export interface BranchEntry {
  readonly key: string;
  readonly name: string;
  readonly thumbnail_url: string;
  readonly last_modified: string;
  readonly link_access: string;
}

export interface BranchesResponse {
  readonly main_file_key: string;
  readonly branches: readonly BranchEntry[];
}

export interface ImagesResponse {
  readonly err: string | null;
  readonly images: Record<string, string | null>;
}

export interface ImageFillsResponse {
  readonly meta: { readonly images: Record<string, string> };
  readonly error: boolean;
  readonly status: number;
}

export interface CommentClientMeta {
  readonly x: number;
  readonly y: number;
}

export interface Comment {
  readonly id: string;
  readonly message: string;
  readonly file_key: string;
  readonly parent_id: string;
  readonly user: { readonly handle: string };
  readonly created_at: string;
  readonly client_meta?: CommentClientMeta;
  readonly resolved_at?: string;
}

export interface CommentsResponse {
  readonly comments: readonly Comment[];
}

export interface ProjectEntry {
  readonly id: string;
  readonly name: string;
}

export interface ProjectsResponse {
  readonly name: string;
  readonly projects: readonly ProjectEntry[];
}

export interface ProjectFileEntry {
  readonly key: string;
  readonly name: string;
  readonly thumbnail_url: string;
  readonly last_modified: string;
}

export interface ProjectFilesResponse {
  readonly name: string;
  readonly files: readonly ProjectFileEntry[];
}

export interface TeamComponentsResponse {
  readonly meta: {
    readonly components: readonly ComponentEntry[];
    readonly cursor?: { readonly before?: number; readonly after?: number };
  };
}

export interface TeamStylesResponse {
  readonly meta: {
    readonly styles: readonly StyleEntry[];
    readonly cursor?: { readonly before?: number; readonly after?: number };
  };
}

export interface DevResource {
  readonly id: string;
  readonly file_key: string;
  readonly node_id: string;
  readonly name: string;
  readonly url: string;
}

export interface DevResourceInput {
  readonly file_key: string;
  readonly node_id: string;
  readonly name: string;
  readonly url: string;
}

export interface DevResourcesResponse {
  readonly dev_resources: readonly DevResource[];
}
