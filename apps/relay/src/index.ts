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
  LOOKUP: DurableObjectNamespace;
  PAIRING_CODE_TTL_MS: string;
  RPC_TIMEOUT_MS: string;
}

export { RelayDurableObject } from "./durable-object";
export { LookupDurableObject } from "./lookup-do";

const newSessionId = (): string => `ses_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

const lookupId = (env: Env) => env.LOOKUP.idFromName("global");

async function handlePairCreate(env: Env): Promise<Response> {
  const sessionId = newSessionId();
  const sessionDo = env.RELAY.get(env.RELAY.idFromName(sessionId));
  const seedResp = await sessionDo.fetch(`https://do/seed-pair?sessionId=${sessionId}`, {
    method: "POST",
  });
  if (!seedResp.ok) return seedResp;
  const { code, expiresAt } = await seedResp.json<{
    code: string;
    expiresAt: number;
  }>();

  const lookup = env.LOOKUP.get(lookupId(env));
  await lookup.fetch("https://lookup/register", {
    method: "POST",
    body: JSON.stringify({ code, sessionId, expiresAt }),
  });

  return Response.json({ code, sessionId, expiresAt });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/pair") {
      if (request.method === "POST") {
        return handlePairCreate(env);
      }
      return new Response("method not allowed", { status: 405 });
    }

    return new Response("not found", { status: 404 });
  },
};
