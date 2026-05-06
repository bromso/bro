import { PairingCodeStore } from "./pairing";

export interface Env {
  RELAY: DurableObjectNamespace;
  LOOKUP: DurableObjectNamespace;
  PAIRING_CODE_TTL_MS: string;
  RPC_TIMEOUT_MS: string;
}

export class RelayDurableObject {
  private readonly pairing: PairingCodeStore;

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

  private async handleConnectPlugin(_request: Request): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  }

  private async handleMcp(_request: Request): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  }
}
