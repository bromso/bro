import { env, SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { handleOAuthCallback } from "../index";

declare global {
  namespace Cloudflare {
    interface Env {
      OAUTH_SESSION: DurableObjectNamespace;
      OAUTH_CALLBACK_URL: string;
      FIGMA_OAUTH_CLIENT_ID?: string;
      FIGMA_OAUTH_CLIENT_SECRET?: string;
    }
  }
}

function makeFetchStub(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    return impl(typeof input === "string" ? input : String(input), init);
  }) as unknown as typeof fetch;
}

const goodTokenBody = {
  access_token: "fa_access_xyz",
  refresh_token: "fa_refresh_abc",
  expires_in: 3600,
  scope: "file_read",
};

describe("GET /oauth/callback (router)", () => {
  it("returns 405 for non-GET", async () => {
    const res = await SELF.fetch("https://relay/oauth/callback?code=c&state=sid_route1234", {
      method: "POST",
    });
    expect(res.status).toBe(405);
  });

  it("returns 400 HTML when state is missing", async () => {
    const res = await SELF.fetch("https://relay/oauth/callback?code=c", { method: "GET" });
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/html");
  });
});

describe("handleOAuthCallback", () => {
  it("renders the user-facing error HTML when Figma returns ?error=", async () => {
    const fetchFn = makeFetchStub(() => new Response("nope"));
    const res = await handleOAuthCallback(
      env,
      { code: null, state: "sid_errorpath123", error: "access_denied" },
      fetchFn
    );
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("access_denied");
    expect(res.headers.get("Content-Type") ?? "").toContain("text/html");
  });

  it("returns 400 HTML when state is malformed", async () => {
    const fetchFn = makeFetchStub(() => new Response("nope"));
    const res = await handleOAuthCallback(
      env,
      { code: "thecode", state: "not-a-sid", error: null },
      fetchFn
    );
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Invalid state");
  });

  it("returns 400 HTML when code is missing", async () => {
    const fetchFn = makeFetchStub(() => new Response("nope"));
    const res = await handleOAuthCallback(
      env,
      { code: null, state: "sid_nocode12345", error: null },
      fetchFn
    );
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Missing authorization code");
  });

  it("returns 500 HTML when client_id/secret env is missing", async () => {
    const badEnv = { ...env, FIGMA_OAUTH_CLIENT_ID: "" } as Cloudflare.Env;
    const fetchFn = makeFetchStub(() => new Response("nope"));
    const res = await handleOAuthCallback(
      badEnv as never,
      { code: "thecode", state: "sid_noenvabc1234", error: null },
      fetchFn
    );
    expect(res.status).toBe(500);
    const html = await res.text();
    expect(html).toContain("not configured");
  });

  it("posts form-encoded to Figma's /v1/oauth/token with the right fields", async () => {
    // Pre-record the sid as pending so /complete on the DO succeeds.
    const sid = "sid_happytoken123";
    const sessionDo = env.OAUTH_SESSION.get(env.OAUTH_SESSION.idFromName(sid));
    await sessionDo.fetch("https://do/pending", { method: "POST" });

    const fetchFn = makeFetchStub((url, init) => {
      expect(url).toBe("https://api.figma.com/v1/oauth/token");
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      const body = String(init.body ?? "");
      expect(body).toContain("grant_type=authorization_code");
      expect(body).toContain("code=thecode123");
      expect(body).toContain("client_id=");
      expect(body).toContain("client_secret=");
      expect(body).toContain("redirect_uri=");
      return new Response(JSON.stringify(goodTokenBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const res = await handleOAuthCallback(
      env,
      { code: "thecode123", state: sid, error: null },
      fetchFn
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Figma connected");
  });

  it("stores tokens on the OauthSessionDurableObject after a happy exchange", async () => {
    const sid = "sid_storetokens12";
    const sessionDo = env.OAUTH_SESSION.get(env.OAUTH_SESSION.idFromName(sid));
    await sessionDo.fetch("https://do/pending", { method: "POST" });

    const fetchFn = makeFetchStub(
      () => new Response(JSON.stringify(goodTokenBody), { status: 200 })
    );
    const res = await handleOAuthCallback(env, { code: "c1", state: sid, error: null }, fetchFn);
    expect(res.status).toBe(200);

    const result = await sessionDo.fetch("https://do/result", { method: "GET" });
    expect(result.status).toBe(200);
    const body = await result.json<{
      tokens: { accessToken: string; refreshToken: string; scope: string };
    }>();
    expect(body.tokens.accessToken).toBe("fa_access_xyz");
    expect(body.tokens.refreshToken).toBe("fa_refresh_abc");
    expect(body.tokens.scope).toBe("file_read");
  });

  it("renders 502 HTML when Figma returns non-2xx", async () => {
    const sid = "sid_figma5xx12345";
    const sessionDo = env.OAUTH_SESSION.get(env.OAUTH_SESSION.idFromName(sid));
    await sessionDo.fetch("https://do/pending", { method: "POST" });

    const fetchFn = makeFetchStub(() => new Response("invalid_grant", { status: 400 }));
    const res = await handleOAuthCallback(
      env,
      { code: "badcode", state: sid, error: null },
      fetchFn
    );
    expect(res.status).toBe(502);
    const html = await res.text();
    expect(html).toContain("Figma rejected");
  });

  it("renders 502 HTML when Figma response is malformed JSON", async () => {
    const sid = "sid_figmajunk1234";
    const sessionDo = env.OAUTH_SESSION.get(env.OAUTH_SESSION.idFromName(sid));
    await sessionDo.fetch("https://do/pending", { method: "POST" });

    const fetchFn = makeFetchStub(
      () =>
        new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        })
    );
    const res = await handleOAuthCallback(env, { code: "c", state: sid, error: null }, fetchFn);
    expect(res.status).toBe(502);
    const html = await res.text();
    expect(html).toContain("Malformed");
  });

  it("renders 502 HTML when token response is missing access/refresh fields", async () => {
    const sid = "sid_figmamissing1";
    const sessionDo = env.OAUTH_SESSION.get(env.OAUTH_SESSION.idFromName(sid));
    await sessionDo.fetch("https://do/pending", { method: "POST" });

    const fetchFn = makeFetchStub(
      () => new Response(JSON.stringify({ access_token: "" }), { status: 200 })
    );
    const res = await handleOAuthCallback(env, { code: "c", state: sid, error: null }, fetchFn);
    expect(res.status).toBe(502);
    const html = await res.text();
    expect(html).toContain("Missing tokens");
  });

  it("renders 502 HTML when fetch to Figma throws", async () => {
    const sid = "sid_fetchthrows12";
    const sessionDo = env.OAUTH_SESSION.get(env.OAUTH_SESSION.idFromName(sid));
    await sessionDo.fetch("https://do/pending", { method: "POST" });

    const fetchFn = makeFetchStub(() => {
      throw new Error("ECONNRESET");
    });
    const res = await handleOAuthCallback(env, { code: "c", state: sid, error: null }, fetchFn);
    expect(res.status).toBe(502);
    const html = await res.text();
    expect(html).toContain("Token exchange failed");
    expect(html).toContain("ECONNRESET");
  });

  it("returns 404 HTML when sid was never recorded by /oauth/start", async () => {
    // Use a sid that's never been pending — DO returns 404 from /complete.
    const sid = "sid_notrecorded12";
    const fetchFn = makeFetchStub(
      () => new Response(JSON.stringify(goodTokenBody), { status: 200 })
    );
    const res = await handleOAuthCallback(env, { code: "c", state: sid, error: null }, fetchFn);
    // Bubble up the DO's status code (404).
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain("Session expired");
  });
});
