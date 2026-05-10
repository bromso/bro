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
  TeamWebhooksResponse,
  UserMeResponse,
  VersionsResponse,
  WebhookRequestsResponse,
  WebhookV2EventType,
  WebhookV2Response,
  WebhookV2Status,
} from "./types";

export interface FigmaApiClientOptions {
  /**
   * Personal Access Token. Sent as the `X-Figma-Token` header (existing
   * Phase 11 behavior). Optional now that OAuth is supported, but still the
   * default for self-hosted users.
   */
  readonly apiKey?: string;
  /**
   * Static OAuth bearer token. Sent as `Authorization: Bearer <token>`.
   * If both `apiKey` and `oauthToken` are configured, OAuth wins —
   * Phase 21 lets PAT users opt into OAuth without a config wipe.
   */
  readonly oauthToken?: string;
  /**
   * Dynamic OAuth bearer-token provider. Called once per request, so it
   * can transparently refresh expired tokens. Beats `oauthToken` when
   * both are configured.
   */
  readonly getOauthToken?: () => Promise<string>;
  readonly fetchFn?: typeof fetch;
  readonly baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.figma.com/v1";

export class FigmaApiClient {
  private readonly apiKey: string | undefined;
  private readonly oauthToken: string | undefined;
  private readonly getOauthTokenFn: (() => Promise<string>) | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: FigmaApiClientOptions) {
    this.apiKey = opts.apiKey;
    this.oauthToken = opts.oauthToken;
    this.getOauthTokenFn = opts.getOauthToken;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    if (!this.apiKey && !this.oauthToken && !this.getOauthTokenFn) {
      throw new Error("FigmaApiClient: provide apiKey, oauthToken, or getOauthToken");
    }
  }

  /**
   * Resolve the auth header for one request. OAuth wins over PAT — if a
   * dynamic provider is configured it's called per request so the daemon
   * can refresh tokens transparently.
   */
  private async getAuthHeader(): Promise<Record<string, string>> {
    if (this.getOauthTokenFn) {
      const tok = await this.getOauthTokenFn();
      return { Authorization: `Bearer ${tok}` };
    }
    if (this.oauthToken) {
      return { Authorization: `Bearer ${this.oauthToken}` };
    }
    return { "X-Figma-Token": this.apiKey ?? "" };
  }

  // ---- helpers ----

  /**
   * Phase 19: v2 endpoints (webhooks) live at `/v2/...`. Compute the v2
   * base URL by swapping the `/v1` suffix on `this.baseUrl` so any test
   * override (e.g. `https://example.test/v1`) still falls through cleanly
   * to `https://example.test/v2`.
   */
  private get v2BaseUrl(): string {
    return this.baseUrl.replace(/\/v1$/, "/v2");
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE" | "PUT",
    path: string,
    init: { query?: Record<string, string | number | undefined>; body?: unknown } = {}
  ): Promise<T> {
    return this.fetchTo<T>(this.baseUrl, method, path, init);
  }

  private async requestV2<T>(
    method: "GET" | "POST" | "DELETE" | "PUT",
    path: string,
    init: { query?: Record<string, string | number | undefined>; body?: unknown } = {}
  ): Promise<T> {
    return this.fetchTo<T>(this.v2BaseUrl, method, path, init);
  }

  private async fetchTo<T>(
    base: string,
    method: "GET" | "POST" | "DELETE" | "PUT",
    path: string,
    init: { query?: Record<string, string | number | undefined>; body?: unknown }
  ): Promise<T> {
    const url = new URL(`${base}${path}`);
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const auth = await this.getAuthHeader();
    const fetchInit: RequestInit = {
      method,
      headers: {
        ...auth,
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

  // ---- v2 webhooks ----

  listTeamWebhooks(teamId: string): Promise<TeamWebhooksResponse> {
    return this.requestV2("GET", `/teams/${teamId}/webhooks`);
  }

  getWebhook(webhookId: string): Promise<WebhookV2Response> {
    return this.requestV2("GET", `/webhooks/${webhookId}`);
  }

  getWebhookRequests(
    webhookId: string,
    opts: { pageSize?: number } = {}
  ): Promise<WebhookRequestsResponse> {
    return this.requestV2("GET", `/webhooks/${webhookId}/requests`, {
      query: { page_size: opts.pageSize },
    });
  }

  createWebhook(input: {
    event_type: WebhookV2EventType;
    team_id: string;
    endpoint: string;
    passcode: string;
    status?: WebhookV2Status;
    description?: string;
  }): Promise<WebhookV2Response> {
    return this.requestV2("POST", "/webhooks", { body: input });
  }

  updateWebhook(
    webhookId: string,
    input: {
      endpoint?: string;
      passcode?: string;
      status?: WebhookV2Status;
      description?: string;
    }
  ): Promise<WebhookV2Response> {
    return this.requestV2("PUT", `/webhooks/${webhookId}`, { body: input });
  }

  deleteWebhook(webhookId: string): Promise<void> {
    return this.requestV2("DELETE", `/webhooks/${webhookId}`);
  }
}
