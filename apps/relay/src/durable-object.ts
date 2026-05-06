import { PairingCodeStore } from "./pairing";

export interface Env {
  RELAY: DurableObjectNamespace;
  LOOKUP: DurableObjectNamespace;
  PAIRING_CODE_TTL_MS: string;
  RPC_TIMEOUT_MS: string;
}

export class RelayDurableObject {
  private readonly pairing: PairingCodeStore;
  private pluginWs: WebSocket | null = null;
  // Test-only diagnostic: counts plugin frames observed by webSocketMessage so
  // hibernation tests can verify dispatch without mocking the runtime. Stays
  // through Phase 6 — an integer field is a cheap, durable test seam.
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: read by hibernation tests via runInDurableObject
  private __pluginMessageCount = 0;
  // Pending AI requests awaiting a plugin response. Keyed by JSON-RPC `id` as a
  // string. Task 6.7 sets up the seam (set/timeout-clear); Task 6.8 reads this
  // map to route plugin → AI replies onto the SSE writer.
  private readonly pendingAiRequests = new Map<string, WritableStreamDefaultWriter<Uint8Array>>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {
    const ttlMs = Number.parseInt(env.PAIRING_CODE_TTL_MS, 10);
    this.pairing = new PairingCodeStore({ ttlMs });

    // Restore: after a hibernation cycle, the runtime rebuilds the DO instance
    // with a fresh `this.pluginWs = null`. Look at the accepted WebSockets that
    // survived hibernation (tags + attachments persist) and reattach.
    const surviving = this.state.getWebSockets("plugin");
    if (surviving.length > 0) {
      this.pluginWs = surviving[0];
    }
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

  private async handleMcp(request: Request): Promise<Response> {
    // Distinguish "session never created" from "plugin not connected": the
    // `/seed-pair` handler writes the `pairing` storage entry, so its absence
    // means no /pair call ever targeted this DO. DOs are conjured on first
    // access, so without this check unknown sessionIds would fall through to
    // the 503 branch.
    const pairing = await this.state.storage.get("pairing");
    if (!pairing) {
      return Response.json({ error: "E_RELAY_SESSION_NOT_FOUND" }, { status: 404 });
    }
    if (!this.pluginWs) {
      return Response.json({ error: "E_RELAY_PLUGIN_NOT_CONNECTED" }, { status: 503 });
    }

    const body = await request.json<{
      jsonrpc: "2.0";
      id: number | string;
      method: string;
      params?: unknown;
    }>();

    // SSE response stream. The writable end is parked in `pendingAiRequests`
    // for Task 6.8 to drain when the plugin responds; the timeout below is the
    // safety net if no response arrives.
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const requestKey = String(body.id);
    this.pendingAiRequests.set(requestKey, writer);

    // Forward the JSON-RPC frame to the plugin verbatim.
    this.pluginWs.send(JSON.stringify(body));

    const timeoutMs = Number.parseInt(this.env.RPC_TIMEOUT_MS, 10);
    setTimeout(async () => {
      const pending = this.pendingAiRequests.get(requestKey);
      if (!pending) return;
      try {
        await pending.write(
          new TextEncoder().encode(
            `event: error\ndata: ${JSON.stringify({ error: "E_RELAY_TIMEOUT" })}\n\n`
          )
        );
        await pending.close();
      } catch {
        // Stream may already be aborted by the AI client; nothing to do.
      }
      this.pendingAiRequests.delete(requestKey);
    }, timeoutMs);

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
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

  private async routePluginMessage(payload: string): Promise<void> {
    let parsed: { id?: string | number; method?: string };
    try {
      parsed = JSON.parse(payload);
    } catch {
      return; // Drop malformed
    }

    // Identify the message kind:
    //   - Response/error: has `id`, no `method`. Route to matching writer + close.
    //   - Notification:   has `method`, no `id`. Broadcast to all writers, no close.
    //   - Other:          drop.
    const id = parsed.id !== undefined ? String(parsed.id) : null;
    const isNotification = parsed.method !== undefined && id === null;
    const isResponse = id !== null && parsed.method === undefined;

    const sseFrame = `data: ${payload}\n\n`;
    const bytes = new TextEncoder().encode(sseFrame);

    if (isResponse) {
      const writer = this.pendingAiRequests.get(id);
      if (!writer) return; // Late response with no matching pending — drop.
      try {
        await writer.write(bytes);
        await writer.close();
      } catch {
        // AI client may have aborted the stream.
      }
      this.pendingAiRequests.delete(id);
      return;
    }

    if (isNotification) {
      // Broadcast to every open AI stream — they're all interested in notifications
      // for the session.
      for (const writer of this.pendingAiRequests.values()) {
        try {
          await writer.write(bytes);
        } catch {
          // Stream aborted; cleanup happens via webSocketClose / timeout.
        }
      }
    }
  }

  private async routeAiMessage(_payload: string): Promise<void> {
    // Forward to the plugin. Implemented in Task 6.8.
  }
}
