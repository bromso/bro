export interface Env {
  RELAY: DurableObjectNamespace;
  PAIRING_CODE_TTL_MS: string;
  RPC_TIMEOUT_MS: string;
}

export class RelayDurableObject {
  constructor(
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: used by handlers in Tasks 6.4+.
    private readonly _state: DurableObjectState,
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: used by handlers in Tasks 6.4+.
    private readonly _env: Env
  ) {}

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

  private async handleSeedPair(_request: Request): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  }

  private async handleConnectPlugin(_request: Request): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  }

  private async handleMcp(_request: Request): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  }
}
