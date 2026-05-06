import { PairingCodeStore } from "./pairing";

export interface Env {
  RELAY: DurableObjectNamespace;
  LOOKUP: DurableObjectNamespace;
  PAIRING_CODE_TTL_MS: string;
  RPC_TIMEOUT_MS: string;
}

export class RelayDurableObject {
  private readonly pairing: PairingCodeStore;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: read in Task 6.6 message routing
  private pluginWs: WebSocket | null = null;

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

  // Hibernation API contract: the runtime requires `webSocketClose` (and, for
  // robustness, `webSocketError`) to be defined on the class once we call
  // `state.acceptWebSocket`. Real lifecycle handling — message routing,
  // pluginWs cleanup, reconnect signalling — lands in Task 6.6.
  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    // intentionally empty until Task 6.6
  }

  async webSocketError(_ws: WebSocket, _error: unknown) {
    // intentionally empty until Task 6.6
  }
}
