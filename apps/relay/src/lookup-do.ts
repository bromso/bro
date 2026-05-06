/**
 * LookupDurableObject — singleton DO mapping pairing codes to session IDs.
 *
 * The Worker registers a `code → sessionId` entry on POST /pair so that a
 * plugin connecting later (Task 6.5) with just the 6-digit code can resolve
 * which session DO to forward to. Single-use semantics: once `/resolve`
 * succeeds, the entry is marked consumed and subsequent resolves return 410.
 */

export interface Env {
  PAIRING_CODE_TTL_MS: string;
}

interface LookupEntry {
  sessionId: string;
  expiresAt: number;
  consumed: boolean;
}

export class LookupDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: env reserved for future config use
    private readonly _env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/register" && request.method === "POST") {
      const body = await request.json<{
        code: string;
        sessionId: string;
        expiresAt: number;
      }>();
      await this.state.storage.put(`code:${body.code}`, {
        sessionId: body.sessionId,
        expiresAt: body.expiresAt,
        consumed: false,
      } satisfies LookupEntry);
      return new Response("ok");
    }

    if (url.pathname === "/resolve" && request.method === "POST") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("missing code", { status: 400 });
      const entry = await this.state.storage.get<LookupEntry>(`code:${code}`);
      if (!entry) return new Response("unknown code", { status: 404 });
      if (Date.now() >= entry.expiresAt) {
        await this.state.storage.delete(`code:${code}`);
        return new Response("expired", { status: 410 });
      }
      if (entry.consumed) return new Response("already used", { status: 410 });
      entry.consumed = true;
      await this.state.storage.put(`code:${code}`, entry);
      return Response.json({ sessionId: entry.sessionId });
    }

    return new Response("not found", { status: 404 });
  }
}
