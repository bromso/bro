/**
 * Figma MCP cloud relay — Cloudflare Worker + Durable Object.
 *
 * Routes:
 *   POST /pair                  → create a pairing session (Task 6.4)
 *   WSS  /pair?code={code}      → plugin connect (Task 6.5)
 *   POST /mcp/{sessionId}       → AI Streamable HTTP (Task 6.7)
 */

export interface Env {
  RELAY: DurableObjectNamespace;
  PAIRING_CODE_TTL_MS: string;
  RPC_TIMEOUT_MS: string;
}

export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response("relay scaffold", { status: 200 });
  },
};

export { RelayDurableObject } from "./durable-object";
