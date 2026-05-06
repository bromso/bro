import { PairingCodeStore } from "./pairing";

export interface Env {
  RELAY: DurableObjectNamespace;
  LOOKUP: DurableObjectNamespace;
  PAIRING_CODE_TTL_MS: string;
  RPC_TIMEOUT_MS: string;
}

export class RelayDurableObject {
  private readonly pairing: PairingCodeStore;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: assigned in handleConnectPlugin, cleared in webSocketClose, read by Task 6.8 routing and hibernation tests
  private pluginWs: WebSocket | null = null;
  // Test-only diagnostic: counts plugin frames observed by webSocketMessage so
  // hibernation tests can verify dispatch without mocking the runtime. Stays
  // through Phase 6 — an integer field is a cheap, durable test seam.
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: read by hibernation tests via runInDurableObject
  private __pluginMessageCount = 0;

  constructor(
    private readonly state: DurableObjectState,
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: env reserved for future config use
    private readonly _env: Env
  ) {
    const ttlMs = Number.parseInt(_env.PAIRING_CODE_TTL_MS, 10);
    this.pairing = new PairingCodeStore({ ttlMs });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/seed-pair" && request.method === "POST") {
      return this.handleSeedPair(request);
    }
    if (url.pathname === "/connect-plugin") {
      return this.handleConnectPlugin(request);
    }
    if (url.pathname === "/mcp" && request.method === "POST") {
      return this.handleMcp(request);
    }
    return new Response("not found", { status: 404 });
  }

  private async handleSeedPair(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("missing sessionId", { status: 400 });

    const { code, expiresAt } = this.pairing.generate(sessionId);
    await this.state.storage.put("pairing", {
      code,
      sessionId,
      expiresAt,
      consumed: false,
    });
    return Response.json({ code, sessionId, expiresAt });
  }

  private async handleConnectPlugin(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("upgrade required", { status: 426 });
    }
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("missing sessionId", { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // Hibernation API: register the WS so the runtime can hibernate the DO.
    // Tags survive hibernation; we identify the plugin side later via getTags(ws).
    this.state.acceptWebSocket(server, ["plugin", sessionId]);
    // Persist per-WS metadata that survives hibernation. Task 6.9 reads this
    // back via the rehydration path in the constructor.
    server.serializeAttachment({ sessionId, attachedAt: Date.now() });
    this.pluginWs = server;

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleMcp(_request: Request): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  }

  // Hibernation API handlers. workerd dispatches these by name on the DO class
  // for any WebSocket registered via `state.acceptWebSocket`. They run whether
  // the DO is awake or freshly resurrected from hibernation; tags on the WS
  // (set in `acceptWebSocket(server, ["plugin", sessionId])`) survive the
  // hibernate/restore boundary and let us identify which side a frame came from.
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const tags = this.state.getTags(ws);
    const payload = typeof message === "string" ? message : new TextDecoder().decode(message);
    if (tags.includes("plugin")) {
      this.__pluginMessageCount++;
      await this.routePluginMessage(payload);
    } else if (tags.includes("ai")) {
      await this.routeAiMessage(payload);
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    const tags = this.state.getTags(ws);
    if (tags.includes("plugin")) {
      this.pluginWs = null;
    }
    // Task 6.11 extends this to notify pending AI requests of plugin disconnect.
  }

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    // Best-effort log seam. The WS lifecycle guarantees `webSocketClose` fires
    // after an error, so state cleanup happens there.
  }

  private async routePluginMessage(_payload: string): Promise<void> {
    // Forward to the AI side. Implemented in Task 6.8.
  }

  private async routeAiMessage(_payload: string): Promise<void> {
    // Forward to the plugin. Implemented in Task 6.8.
  }
}
