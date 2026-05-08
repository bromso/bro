/**
 * Figma MCP cloud relay — Cloudflare Worker + Durable Object.
 *
 * Routes:
 *   POST /pair                  → create a pairing session (Task 6.4)
 *   WSS  /pair?code={code}      → plugin connect (Task 6.5)
 *   POST /mcp/{sessionId}       → AI Streamable HTTP (Task 6.7)
 *   POST /oauth/start           → daemon-initiated OAuth (Phase 22 Task 2)
 */

/**
 * Phase 22 — Figma OAuth scopes the relay requests on the daemon's behalf.
 *
 * Mirrors the set documented in Phase 21 (`apps/docs/.../cloud.mdx`). The
 * scopes cover everything the bridge plugin and tools-rest need; they're
 * hard-coded rather than user-selectable to keep the consent screen
 * deterministic for the daemon (which doesn't know up-front which tools
 * the user will invoke).
 */
const FIGMA_OAUTH_SCOPES = [
  "file_read",
  "file_metadata:read",
  "file_variables:read",
  "file_variables:write",
  "file_comments:read",
  "file_comments:write",
  "file_dev_resources:read",
  "file_dev_resources:write",
  "webhooks:read",
  "webhooks:write",
  "current_user:read",
].join(",");

const FIGMA_AUTHORIZE_URL = "https://www.figma.com/oauth";

const SID_PATTERN = /^sid_[A-Za-z0-9]{8,64}$/;

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

// Exported so the missing/empty-env tests can pass a fake Env without
// creating a parallel wrangler.toml. Real callers go through the
// `/oauth/start` route in `fetch` below.
export async function handleOAuthStart(env: Env, sid: string): Promise<Response> {
  if (!SID_PATTERN.test(sid)) {
    return Response.json({ error: "E_OAUTH_INVALID_SID" }, { status: 400 });
  }
  if (!env.FIGMA_OAUTH_CLIENT_ID || env.FIGMA_OAUTH_CLIENT_ID.length === 0) {
    return Response.json({ error: "E_OAUTH_NOT_CONFIGURED" }, { status: 500 });
  }
  if (!env.OAUTH_CALLBACK_URL || env.OAUTH_CALLBACK_URL.length === 0) {
    return Response.json({ error: "E_OAUTH_NOT_CONFIGURED" }, { status: 500 });
  }

  // Park the sid in the OauthSessionDurableObject so the /oauth/callback
  // handler can later prove this sid was issued by us (state validation
  // for the OAuth flow) and so /oauth/result has somewhere to read from.
  const sessionDo = env.OAUTH_SESSION.get(env.OAUTH_SESSION.idFromName(sid));
  const pendingResp = await sessionDo.fetch("https://do/pending", { method: "POST" });
  if (!pendingResp.ok) {
    return Response.json({ error: "E_OAUTH_PENDING_FAILED" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: env.FIGMA_OAUTH_CLIENT_ID,
    redirect_uri: env.OAUTH_CALLBACK_URL,
    scope: FIGMA_OAUTH_SCOPES,
    state: sid,
    response_type: "code",
  });
  const authorizeUrl = `${FIGMA_AUTHORIZE_URL}?${params.toString()}`;
  return Response.json({ authorizeUrl });
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

    if (url.pathname === "/oauth/start") {
      if (request.method !== "POST") {
        return new Response("method not allowed", { status: 405 });
      }
      const sid = url.searchParams.get("sid");
      if (!sid) {
        return Response.json({ error: "E_OAUTH_MISSING_SID" }, { status: 400 });
      }
      return handleOAuthStart(env, sid);
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
