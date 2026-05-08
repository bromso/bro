import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleOAuthCallback } from "../index";

declare global {
  namespace Cloudflare {
    interface Env {
      OAUTH_SESSION: DurableObjectNamespace;
    }
  }
}

const goodTokenBody = {
  access_token: "fa_access_xyz",
  refresh_token: "fa_refresh_abc",
  expires_in: 3600,
  scope: "file_read",
};

describe("GET /oauth/result", () => {
  it("returns 405 for non-GET", async () => {
    const res = await SELF.fetch("https://relay/oauth/result?sid=sid_resultmethod", {
      method: "POST",
    });
    expect(res.status).toBe(405);
  });

  it("returns 400 with E_OAUTH_MISSING_SID when sid is omitted", async () => {
    const res = await SELF.fetch("https://relay/oauth/result", { method: "GET" });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("E_OAUTH_MISSING_SID");
  });

  it("returns 400 with E_OAUTH_INVALID_SID for malformed sid", async () => {
    const res = await SELF.fetch("https://relay/oauth/result?sid=not-a-sid", { method: "GET" });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("E_OAUTH_INVALID_SID");
  });

  it("returns 404 when sid was never recorded", async () => {
    const res = await SELF.fetch("https://relay/oauth/result?sid=sid_neverrecord1", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  it("returns 202 while pending (no tokens yet)", async () => {
    // Record sid as pending via /oauth/start.
    const startRes = await SELF.fetch("https://relay/oauth/start?sid=sid_pendingpoll1", {
      method: "POST",
    });
    expect(startRes.status).toBe(200);

    const res = await SELF.fetch("https://relay/oauth/result?sid=sid_pendingpoll1", {
      method: "GET",
    });
    expect(res.status).toBe(202);
  });

  it("returns 200 with {tokens} once /oauth/callback completes", async () => {
    const sid = "sid_resultcomplete";
    // 1. Record pending.
    const startRes = await SELF.fetch(`https://relay/oauth/start?sid=${sid}`, {
      method: "POST",
    });
    expect(startRes.status).toBe(200);

    // 2. Drive the callback handler with a stubbed Figma fetch.
    const fetchFn = (async () =>
      new Response(JSON.stringify(goodTokenBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
    const cbRes = await handleOAuthCallback(
      env,
      { code: "thecode", state: sid, error: null },
      fetchFn
    );
    expect(cbRes.status).toBe(200);

    // 3. Poll /oauth/result — should now be 200 with tokens.
    const res = await SELF.fetch(`https://relay/oauth/result?sid=${sid}`, { method: "GET" });
    expect(res.status).toBe(200);
    const body = await res.json<{
      tokens: { accessToken: string; refreshToken: string; scope: string };
    }>();
    expect(body.tokens.accessToken).toBe("fa_access_xyz");
    expect(body.tokens.refreshToken).toBe("fa_refresh_abc");
    expect(body.tokens.scope).toBe("file_read");
  });
});
