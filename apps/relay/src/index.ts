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
  OAUTH_SESSION: DurableObjectNamespace;
  PAIRING_CODE_TTL_MS: string;
  RPC_TIMEOUT_MS: string;
  OAUTH_SESSION_TTL_MS: string;
  OAUTH_CALLBACK_URL: string;
  FIGMA_OAUTH_CLIENT_ID?: string;
  FIGMA_OAUTH_CLIENT_SECRET?: string;
}

export { RelayDurableObject } from "./durable-object";
export { LookupDurableObject } from "./lookup-do";
export { OauthSessionDurableObject } from "./oauth-session-do";

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

async function routePluginConnect(env: Env, code: string, request: Request): Promise<Response> {
  // Resolve code → sessionId via global lookup DO. POST /resolve consumes the
  // code (single-use), so a second connect with the same code returns 410 Gone
  // from the lookup DO and we surface that as 401 to the plugin.
  const lookup = env.LOOKUP.get(lookupId(env));
  const resolveResp = await lookup.fetch(`https://lookup/resolve?code=${code}`, {
    method: "POST",
  });
  if (!resolveResp.ok) {
    return new Response("invalid code", { status: 401 });
  }
  const { sessionId } = await resolveResp.json<{ sessionId: string }>();
  const sessionDo = env.RELAY.get(env.RELAY.idFromName(sessionId));
  return sessionDo.fetch(`https://do/connect-plugin?sessionId=${sessionId}`, {
    headers: request.headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/pair") {
      if (request.method === "POST") {
        return handlePairCreate(env);
      }
      if (request.method === "GET") {
        if (request.headers.get("Upgrade") !== "websocket") {
          return new Response("upgrade required", { status: 426 });
        }
        const code = url.searchParams.get("code");
        if (!code) return new Response("missing code", { status: 400 });
        return routePluginConnect(env, code, request);
      }
      return new Response("method not allowed", { status: 405 });
    }

    const mcpMatch = url.pathname.match(/^\/mcp\/(ses_[a-z0-9]+)$/);
    if (mcpMatch) {
      if (request.method !== "POST") {
        return new Response("method not allowed", { status: 405 });
      }
      const sessionId = mcpMatch[1];
      const stub = env.RELAY.get(env.RELAY.idFromName(sessionId));
      return stub.fetch(`https://do/mcp?sessionId=${sessionId}`, {
        method: "POST",
        headers: request.headers,
        body: await request.text(),
      });
    }

    return new Response("not found", { status: 404 });
  },
};
