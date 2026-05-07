import { FigmaApiError, mapStatusToCode } from "./errors";
import type {
  BranchesResponse,
  Comment,
  CommentsResponse,
  ComponentSetsResponse,
  ComponentsResponse,
  DevResourceInput,
  DevResourcesResponse,
  FigmaFile,
  ImageFillsResponse,
  ImagesResponse,
  NodesResponse,
  PageSummary,
  ProjectFilesResponse,
  ProjectsResponse,
  StylesResponse,
  TeamComponentsResponse,
  TeamStylesResponse,
  UserMeResponse,
  VersionsResponse,
} from "./types";

export interface FigmaApiClientOptions {
  readonly apiKey: string;
  readonly fetchFn?: typeof fetch;
  readonly baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.figma.com/v1";

export class FigmaApiClient {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: FigmaApiClientOptions) {
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  // ---- helpers ----

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    init: { query?: Record<string, string | number | undefined>; body?: unknown } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const fetchInit: RequestInit = {
      method,
      headers: {
        "X-Figma-Token": this.apiKey,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    };
    const resp = await this.fetchFn(url.toString(), fetchInit);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new FigmaApiError({
        status: resp.status,
        code: mapStatusToCode(resp.status),
        message: text || `HTTP ${resp.status}`,
      });
    }
    if (resp.status === 204 || method === "DELETE") return undefined as T;
    return (await resp.json()) as T;
  }

  // ---- file reads ----

  getMe(): Promise<UserMeResponse> {
    return this.request("GET", "/me");
  }

  getFile(
    fileKey: string,
    opts: { depth?: number; ids?: readonly string[] } = {}
  ): Promise<FigmaFile> {
    return this.request("GET", `/files/${fileKey}`, {
      query: {
        depth: opts.depth,
        ids: opts.ids?.length ? opts.ids.join(",") : undefined,
      },
    });
  }

  getFileNodes(fileKey: string, ids: readonly string[]): Promise<NodesResponse> {
    return this.request("GET", `/files/${fileKey}/nodes`, {
      query: { ids: ids.join(",") },
    });
  }

  async getFilePages(fileKey: string): Promise<readonly PageSummary[]> {
    const file = await this.getFile(fileKey, { depth: 1 });
    const children = file.document.children ?? [];
    return children
      .filter((c) => c.type === "CANVAS")
      .map((c) => ({ id: c.id, name: c.name ?? "" }));
  }

  getFileStyles(fileKey: string): Promise<StylesResponse> {
    return this.request("GET", `/files/${fileKey}/styles`);
  }

  getFileComponents(fileKey: string): Promise<ComponentsResponse> {
    return this.request("GET", `/files/${fileKey}/components`);
  }

  getFileComponentSets(fileKey: string): Promise<ComponentSetsResponse> {
    return this.request("GET", `/files/${fileKey}/component_sets`);
  }

  getFileVersions(
    fileKey: string,
    opts: { pageSize?: number; before?: string; after?: string } = {}
  ): Promise<VersionsResponse> {
    return this.request("GET", `/files/${fileKey}/versions`, {
      query: {
        page_size: opts.pageSize,
        before: opts.before,
        after: opts.after,
      },
    });
  }

  getFileBranches(fileKey: string): Promise<BranchesResponse> {
    return this.request("GET", `/files/${fileKey}/branches`);
  }

  // ---- images ----

  getImages(
    fileKey: string,
    opts: {
      ids: readonly string[];
      format?: "png" | "svg" | "pdf" | "jpg";
      scale?: number;
    }
  ): Promise<ImagesResponse> {
    return this.request("GET", `/images/${fileKey}`, {
      query: {
        ids: opts.ids.join(","),
        format: opts.format,
        scale: opts.scale,
      },
    });
  }

  getImageFills(fileKey: string): Promise<ImageFillsResponse> {
    return this.request("GET", `/files/${fileKey}/images`);
  }

  // ---- comments ----

  getFileComments(fileKey: string): Promise<CommentsResponse> {
    return this.request("GET", `/files/${fileKey}/comments`);
  }

  postFileComment(
    fileKey: string,
    msg: { message: string; client_meta?: { x: number; y: number } }
  ): Promise<Comment> {
    return this.request("POST", `/files/${fileKey}/comments`, { body: msg });
  }

  deleteFileComment(fileKey: string, commentId: string): Promise<void> {
    return this.request("DELETE", `/files/${fileKey}/comments/${commentId}`);
  }

  // ---- team / project ----

  getTeamProjects(teamId: string): Promise<ProjectsResponse> {
    return this.request("GET", `/teams/${teamId}/projects`);
  }

  getProjectFiles(
    projectId: string,
    opts: { branch_data?: boolean } = {}
  ): Promise<ProjectFilesResponse> {
    return this.request("GET", `/projects/${projectId}/files`, {
      query: { branch_data: opts.branch_data ? "true" : undefined },
    });
  }

  getTeamComponents(
    teamId: string,
    opts: { pageSize?: number; cursor?: string } = {}
  ): Promise<TeamComponentsResponse> {
    return this.request("GET", `/teams/${teamId}/components`, {
      query: { page_size: opts.pageSize, cursor: opts.cursor },
    });
  }

  getTeamStyles(
    teamId: string,
    opts: { pageSize?: number; cursor?: string } = {}
  ): Promise<TeamStylesResponse> {
    return this.request("GET", `/teams/${teamId}/styles`, {
      query: { page_size: opts.pageSize, cursor: opts.cursor },
    });
  }

  // ---- dev resources ----

  getDevResources(
    fileKey: string,
    opts: { node_ids?: readonly string[] } = {}
  ): Promise<DevResourcesResponse> {
    return this.request("GET", `/files/${fileKey}/dev_resources`, {
      query: { node_ids: opts.node_ids?.length ? opts.node_ids.join(",") : undefined },
    });
  }

  postDevResources(resources: readonly DevResourceInput[]): Promise<DevResourcesResponse> {
    return this.request("POST", "/dev_resources", { body: { dev_resources: resources } });
  }
}
