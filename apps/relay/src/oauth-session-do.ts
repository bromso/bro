/**
 * OauthSessionDurableObject — holds in-flight OAuth auth-code exchanges.
 *
 * Lifecycle (sid-keyed):
 *   1. Daemon POSTs /oauth/start?sid=<sid> on the Worker → Worker calls this
 *      DO's `/pending` to record the sid as awaiting a callback.
 *   2. User authorizes on figma.com → Figma redirects to the relay's
 *      `/oauth/callback?code=...&state=<sid>` → Worker exchanges the code
 *      with Figma's `/v1/oauth/token` and POSTs the resulting tokens to this
 *      DO's `/complete`.
 *   3. Daemon polls the Worker's `/oauth/result?sid=<sid>` which proxies to
 *      this DO's `/result`. While `pending` we return 202; once `completed`
 *      we return 200 with the tokens; after the TTL elapses, 410.
 *
 * Storage layout (per DO instance, keyed by sid via `idFromName`):
 *   key "session" → SessionEntry {
 *     status: "pending" | "completed",
 *     expiresAt: number,    // Unix-ms; after this, status is treated as expired
 *     tokens?: OAuthTokens, // present iff status === "completed"
 *   }
 *
 * The DO is purposefully single-sid: one DO instance per session id keeps
 * the state simple and lets us garbage-collect via `state.storage.deleteAll`
 * when expired. We don't bother with an explicit alarm — `/result` lazy-checks
 * `expiresAt` and surfaces 410 once stale, mirroring the LookupDurableObject
 * pattern in `lookup-do.ts`.
 */

export interface Env {
  OAUTH_SESSION_TTL_MS: string;
}

export interface OAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly scope: string;
}

interface PendingEntry {
  readonly status: "pending";
  readonly expiresAt: number;
}

interface CompletedEntry {
  readonly status: "completed";
  readonly expiresAt: number;
  readonly tokens: OAuthTokens;
}

type SessionEntry = PendingEntry | CompletedEntry;

const SESSION_KEY = "session";

export class OauthSessionDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/pending" && request.method === "POST") {
      return this.handlePending();
    }
    if (url.pathname === "/complete" && request.method === "POST") {
      return this.handleComplete(request);
    }
    if (url.pathname === "/result" && request.method === "GET") {
      return this.handleResult();
    }
    return new Response("not found", { status: 404 });
  }

  private async handlePending(): Promise<Response> {
    const ttlMs = this.parseTtl();
    const expiresAt = Date.now() + ttlMs;
    const entry: SessionEntry = { status: "pending", expiresAt };
    await this.state.storage.put(SESSION_KEY, entry);
    return Response.json({ ok: true, expiresAt });
  }

  private async handleComplete(request: Request): Promise<Response> {
    const existing = await this.state.storage.get<SessionEntry>(SESSION_KEY);
    if (!existing) {
      // Callback fired without a /pending — the sid is unknown to this DO.
      return new Response("unknown session", { status: 404 });
    }
    if (Date.now() >= existing.expiresAt) {
      await this.state.storage.deleteAll();
      return new Response("expired", { status: 410 });
    }
    let body: { tokens?: OAuthTokens };
    try {
      body = (await request.json()) as { tokens?: OAuthTokens };
    } catch {
      return new Response("invalid body", { status: 400 });
    }
    if (!body.tokens || !isOAuthTokens(body.tokens)) {
      return new Response("invalid tokens", { status: 400 });
    }
    const updated: SessionEntry = {
      status: "completed",
      expiresAt: existing.expiresAt,
      tokens: body.tokens,
    };
    await this.state.storage.put(SESSION_KEY, updated);
    return Response.json({ ok: true });
  }

  private async handleResult(): Promise<Response> {
    const entry = await this.state.storage.get<SessionEntry>(SESSION_KEY);
    if (!entry) {
      // No `/pending` was ever recorded for this DO instance.
      return new Response("unknown session", { status: 404 });
    }
    if (Date.now() >= entry.expiresAt) {
      await this.state.storage.deleteAll();
      return new Response("expired", { status: 410 });
    }
    if (entry.status === "completed") {
      return Response.json({ tokens: entry.tokens });
    }
    // pending — daemon should keep polling.
    return new Response(null, { status: 202 });
  }

  private parseTtl(): number {
    const parsed = Number.parseInt(this.env.OAUTH_SESSION_TTL_MS ?? "", 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 300_000;
  }
}

function isOAuthTokens(value: unknown): value is OAuthTokens {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === "string" &&
    typeof v.refreshToken === "string" &&
    typeof v.expiresAt === "number" &&
    typeof v.scope === "string"
  );
}
