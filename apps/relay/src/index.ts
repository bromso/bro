/**
 * Figma MCP cloud relay — Cloudflare Worker + Durable Object.
 *
 * Routes:
 *   POST /pair                  → create a pairing session (Task 6.4)
 *   WSS  /pair?code={code}      → plugin connect (Task 6.5)
 *   POST /mcp/{sessionId}       → AI Streamable HTTP (Task 6.7)
 *   POST /oauth/start           → daemon-initiated OAuth (Phase 22 Task 2)
 *   GET  /oauth/callback        → Figma redirect lands here (Phase 22 Task 3)
 *   GET  /oauth/result?sid=...  → daemon polls for tokens (Phase 22 Task 4)
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
const FIGMA_TOKEN_URL = "https://api.figma.com/v1/oauth/token";

const SID_PATTERN = /^sid_[A-Za-z0-9]{8,64}$/;

interface FigmaTokenResponse {
  readonly access_token?: unknown;
  readonly refresh_token?: unknown;
  readonly expires_in?: unknown;
  readonly scope?: unknown;
}

function renderHtml(opts: {
  readonly title: string;
  readonly heading: string;
  readonly body: string;
}): string {
  // Minimal CSP-friendly inline page. Browsers land here once and the user
  // closes the tab; we deliberately keep external assets out so the page
  // works inside corp networks where CDNs are blocked.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(opts.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { font-size: 1.4rem; }
    p { line-height: 1.5; }
  </style>
</head>
<body>
  <h1>${escapeHtml(opts.heading)}</h1>
  <p>${escapeHtml(opts.body)}</p>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

/**
 * Phase 22 — handle Figma's redirect back to the relay after the user
 * approves the OAuth consent screen. The auth code is exchanged for an
 * `access_token` + `refresh_token` against Figma's `/v1/oauth/token`,
 * stashed in the OauthSessionDurableObject keyed by `state` (the sid),
 * and we render a "you can close this window" HTML page.
 *
 * `fetchFn` is injectable so tests can stub the Figma side without making
 * real network calls. Default is the global `fetch`.
 */
export async function handleOAuthCallback(
  env: Env,
  params: { code: string | null; state: string | null; error: string | null },
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  if (params.error) {
    return new Response(
      renderHtml({
        title: "Figma authorization failed",
        heading: "Figma authorization failed",
        body: `Figma reported: ${params.error}. Close this window and re-run "figma-mcp setup --cloud --oauth".`,
      }),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  if (!params.state || !SID_PATTERN.test(params.state)) {
    return new Response(
      renderHtml({
        title: "Invalid state",
        heading: "Invalid state",
        body: "The OAuth state parameter is missing or malformed. Close this window and re-run setup.",
      }),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  if (!params.code) {
    return new Response(
      renderHtml({
        title: "Missing authorization code",
        heading: "Missing authorization code",
        body: "Figma did not return an auth code. Close this window and re-run setup.",
      }),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  if (!env.FIGMA_OAUTH_CLIENT_ID || !env.FIGMA_OAUTH_CLIENT_SECRET || !env.OAUTH_CALLBACK_URL) {
    return new Response(
      renderHtml({
        title: "OAuth not configured",
        heading: "OAuth not configured",
        body: "The relay is missing FIGMA_OAUTH_CLIENT_ID/SECRET. Contact the relay operator.",
      }),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Exchange the auth code for tokens. Figma's /v1/oauth/token expects
  // `application/x-www-form-urlencoded` with grant_type=authorization_code.
  const body = new URLSearchParams({
    client_id: env.FIGMA_OAUTH_CLIENT_ID,
    client_secret: env.FIGMA_OAUTH_CLIENT_SECRET,
    redirect_uri: env.OAUTH_CALLBACK_URL,
    code: params.code,
    grant_type: "authorization_code",
  }).toString();

  let tokenResp: Response;
  try {
    tokenResp = await fetchFn(FIGMA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    return new Response(
      renderHtml({
        title: "Token exchange failed",
        heading: "Token exchange failed",
        body: `Could not reach Figma to exchange the auth code: ${
          err instanceof Error ? err.message : String(err)
        }. Close this window and try again.`,
      }),
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (!tokenResp.ok) {
    const detail = await tokenResp.text().catch(() => "");
    return new Response(
      renderHtml({
        title: "Figma rejected the auth code",
        heading: "Figma rejected the auth code",
        body: `Figma returned HTTP ${tokenResp.status}${
          detail ? `: ${detail.slice(0, 200)}` : ""
        }. Close this window and re-run setup.`,
      }),
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const json = (await tokenResp.json().catch(() => null)) as FigmaTokenResponse | null;
  if (!json) {
    return new Response(
      renderHtml({
        title: "Malformed Figma response",
        heading: "Malformed Figma response",
        body: "Figma returned a non-JSON token response. Close this window and re-run setup.",
      }),
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : "";
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 0;
  const scope = typeof json.scope === "string" ? json.scope : "";
  if (!accessToken || !refreshToken) {
    return new Response(
      renderHtml({
        title: "Missing tokens",
        heading: "Missing tokens",
        body: "Figma's response did not include both access and refresh tokens. Close this window and re-run setup.",
      }),
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const tokens = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scope,
  };

  const sessionDo = env.OAUTH_SESSION.get(env.OAUTH_SESSION.idFromName(params.state));
  const completeResp = await sessionDo.fetch("https://do/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens }),
  });
  if (!completeResp.ok) {
    return new Response(
      renderHtml({
        title: "Session expired",
        heading: "Session expired",
        body: "The OAuth session has expired or is unknown. Re-run setup to start a new flow.",
      }),
      { status: completeResp.status, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  return new Response(
    renderHtml({
      title: "Figma connected",
      heading: "Figma connected",
      body: "Authorization complete. You can close this window — the daemon will pick up your tokens automatically.",
    }),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
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

    if (url.pathname === "/oauth/result") {
      if (request.method !== "GET") {
        return new Response("method not allowed", { status: 405 });
      }
      const sid = url.searchParams.get("sid");
      if (!sid) {
        return Response.json({ error: "E_OAUTH_MISSING_SID" }, { status: 400 });
      }
      if (!SID_PATTERN.test(sid)) {
        return Response.json({ error: "E_OAUTH_INVALID_SID" }, { status: 400 });
      }
      const sessionDo = env.OAUTH_SESSION.get(env.OAUTH_SESSION.idFromName(sid));
      // Proxy verbatim — the DO already returns 202/200/410/404 with the
      // right shape (200 carries `{tokens}` JSON; 202 has no body; 410/404
      // are plain text). Daemon distinguishes by status code, not body.
      return sessionDo.fetch("https://do/result", { method: "GET" });
    }

    if (url.pathname === "/oauth/callback") {
      if (request.method !== "GET") {
        return new Response("method not allowed", { status: 405 });
      }
      return handleOAuthCallback(env, {
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
        error: url.searchParams.get("error"),
      });
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
