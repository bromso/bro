import { FigmaApiError, mapStatusToCode } from "./errors";
import type {
  BranchesResponse,
  Comment,
  CommentsResponse,
  ComponentSetsResponse,
  ComponentsResponse,
  DevResource,
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

const notFound = (msg: string) =>
  new FigmaApiError({ status: 404, code: mapStatusToCode(404), message: msg });

const noAuth = (msg: string) =>
  new FigmaApiError({ status: 401, code: mapStatusToCode(401), message: msg });

/**
 * In-memory test double matching the FigmaApiClient surface. Seed data via
 * `__seedX(...)` methods; calls against unseeded resources throw
 * `FigmaApiError(404)` (or 401 for `getMe` — there is no "no user").
 */
export class FigmaApiFake {
  private me: UserMeResponse | null = null;
  private files = new Map<string, FigmaFile>();
  private styles = new Map<string, StylesResponse>();
  private components = new Map<string, ComponentsResponse>();
  private componentSets = new Map<string, ComponentSetsResponse>();
  private versions = new Map<string, VersionsResponse>();
  private branches = new Map<string, BranchesResponse>();
  private images = new Map<string, ImagesResponse>();
  private imageFills = new Map<string, ImageFillsResponse>();
  private comments = new Map<string, Comment[]>();
  private teamProjects = new Map<string, ProjectsResponse>();
  private projectFiles = new Map<string, ProjectFilesResponse>();
  private teamComponents = new Map<string, TeamComponentsResponse>();
  private teamStyles = new Map<string, TeamStylesResponse>();
  private devResources = new Map<string, DevResource[]>();
  private commentCounter = 0;
  private devResourceCounter = 0;

  // ---- seeders ----
  __seedMe(me: UserMeResponse) {
    this.me = me;
  }
  __seedFile(key: string, file: FigmaFile) {
    this.files.set(key, file);
  }
  __seedStyles(key: string, r: StylesResponse) {
    this.styles.set(key, r);
  }
  __seedComponents(key: string, r: ComponentsResponse) {
    this.components.set(key, r);
  }
  __seedComponentSets(key: string, r: ComponentSetsResponse) {
    this.componentSets.set(key, r);
  }
  __seedVersions(key: string, r: VersionsResponse) {
    this.versions.set(key, r);
  }
  __seedBranches(key: string, r: BranchesResponse) {
    this.branches.set(key, r);
  }
  __seedImages(key: string, r: ImagesResponse) {
    this.images.set(key, r);
  }
  __seedImageFills(key: string, r: ImageFillsResponse) {
    this.imageFills.set(key, r);
  }
  __seedTeamProjects(team: string, r: ProjectsResponse) {
    this.teamProjects.set(team, r);
  }
  __seedProjectFiles(project: string, r: ProjectFilesResponse) {
    this.projectFiles.set(project, r);
  }
  __seedTeamComponents(team: string, r: TeamComponentsResponse) {
    this.teamComponents.set(team, r);
  }
  __seedTeamStyles(team: string, r: TeamStylesResponse) {
    this.teamStyles.set(team, r);
  }
  __seedDevResources(key: string, r: readonly DevResource[]) {
    this.devResources.set(key, [...r]);
  }

  // ---- read methods ----
  async getMe(): Promise<UserMeResponse> {
    if (!this.me) throw noAuth("no FIGMA_API_KEY user seeded");
    return this.me;
  }

  async getFile(fileKey: string): Promise<FigmaFile> {
    const f = this.files.get(fileKey);
    if (!f) throw notFound(`file not found: ${fileKey}`);
    return f;
  }

  async getFileNodes(fileKey: string, ids: readonly string[]): Promise<NodesResponse> {
    const f = this.files.get(fileKey);
    if (!f) throw notFound(`file not found: ${fileKey}`);
    const nodes: Record<
      string,
      { readonly document: { id: string; type: string; name?: string } } | null
    > = {};
    type WalkNode = {
      readonly id: string;
      readonly type: string;
      readonly name?: string;
      readonly children?: readonly WalkNode[];
    };
    const visit = (node: WalkNode) => {
      if (ids.includes(node.id)) {
        nodes[node.id] = { document: { id: node.id, type: node.type, name: node.name } };
      }
      for (const c of node.children ?? []) visit(c);
    };
    visit(f.document);
    for (const id of ids) if (!(id in nodes)) nodes[id] = null;
    return { nodes };
  }

  async getFilePages(fileKey: string): Promise<readonly PageSummary[]> {
    const f = await this.getFile(fileKey);
    return (f.document.children ?? [])
      .filter((c) => c.type === "CANVAS")
      .map((c) => ({ id: c.id, name: c.name ?? "" }));
  }

  async getFileStyles(fileKey: string): Promise<StylesResponse> {
    const r = this.styles.get(fileKey);
    if (!r) throw notFound(`styles not found: ${fileKey}`);
    return r;
  }

  async getFileComponents(fileKey: string): Promise<ComponentsResponse> {
    const r = this.components.get(fileKey);
    if (!r) throw notFound(`components not found: ${fileKey}`);
    return r;
  }

  async getFileComponentSets(fileKey: string): Promise<ComponentSetsResponse> {
    const r = this.componentSets.get(fileKey);
    if (!r) throw notFound(`component_sets not found: ${fileKey}`);
    return r;
  }

  async getFileVersions(fileKey: string): Promise<VersionsResponse> {
    const r = this.versions.get(fileKey);
    if (!r) throw notFound(`versions not found: ${fileKey}`);
    return r;
  }

  async getFileBranches(fileKey: string): Promise<BranchesResponse> {
    const r = this.branches.get(fileKey);
    if (!r) throw notFound(`branches not found: ${fileKey}`);
    return r;
  }

  async getImages(
    fileKey: string,
    _opts: { ids: readonly string[]; format?: string; scale?: number }
  ): Promise<ImagesResponse> {
    const r = this.images.get(fileKey);
    if (!r) throw notFound(`images not found: ${fileKey}`);
    return r;
  }

  async getImageFills(fileKey: string): Promise<ImageFillsResponse> {
    const r = this.imageFills.get(fileKey);
    if (!r) throw notFound(`image_fills not found: ${fileKey}`);
    return r;
  }

  async getFileComments(fileKey: string): Promise<CommentsResponse> {
    if (!this.files.has(fileKey)) throw notFound(`file not found: ${fileKey}`);
    return { comments: this.comments.get(fileKey) ?? [] };
  }

  async postFileComment(
    fileKey: string,
    msg: { message: string; client_meta?: { x: number; y: number } }
  ): Promise<Comment> {
    if (!this.files.has(fileKey)) throw notFound(`file not found: ${fileKey}`);
    const c: Comment = {
      id: `c${++this.commentCounter}`,
      message: msg.message,
      file_key: fileKey,
      parent_id: "",
      user: { handle: "fake-user" },
      created_at: "2026-01-01T00:00:00Z",
      ...(msg.client_meta ? { client_meta: msg.client_meta } : {}),
    };
    const list = this.comments.get(fileKey) ?? [];
    list.push(c);
    this.comments.set(fileKey, list);
    return c;
  }

  async deleteFileComment(fileKey: string, commentId: string): Promise<void> {
    if (!this.files.has(fileKey)) throw notFound(`file not found: ${fileKey}`);
    const list = this.comments.get(fileKey) ?? [];
    const idx = list.findIndex((c) => c.id === commentId);
    if (idx === -1) throw notFound(`comment not found: ${commentId}`);
    list.splice(idx, 1);
    this.comments.set(fileKey, list);
  }

  async getTeamProjects(teamId: string): Promise<ProjectsResponse> {
    const r = this.teamProjects.get(teamId);
    if (!r) throw notFound(`team not found: ${teamId}`);
    return r;
  }

  async getProjectFiles(projectId: string): Promise<ProjectFilesResponse> {
    const r = this.projectFiles.get(projectId);
    if (!r) throw notFound(`project not found: ${projectId}`);
    return r;
  }

  async getTeamComponents(teamId: string): Promise<TeamComponentsResponse> {
    const r = this.teamComponents.get(teamId);
    if (!r) throw notFound(`team not found: ${teamId}`);
    return r;
  }

  async getTeamStyles(teamId: string): Promise<TeamStylesResponse> {
    const r = this.teamStyles.get(teamId);
    if (!r) throw notFound(`team not found: ${teamId}`);
    return r;
  }

  async getDevResources(
    fileKey: string,
    _opts: { node_ids?: readonly string[] } = {}
  ): Promise<DevResourcesResponse> {
    if (!this.files.has(fileKey)) throw notFound(`file not found: ${fileKey}`);
    return { dev_resources: this.devResources.get(fileKey) ?? [] };
  }

  async postDevResources(resources: readonly DevResourceInput[]): Promise<DevResourcesResponse> {
    const created: DevResource[] = resources.map((r) => ({
      id: `dr${++this.devResourceCounter}`,
      file_key: r.file_key,
      node_id: r.node_id,
      name: r.name,
      url: r.url,
    }));
    for (const c of created) {
      const list = this.devResources.get(c.file_key) ?? [];
      list.push(c);
      this.devResources.set(c.file_key, list);
    }
    return { dev_resources: created };
  }
}
