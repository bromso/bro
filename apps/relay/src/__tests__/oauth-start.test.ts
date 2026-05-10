import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleOAuthStart } from "../index";

declare global {
  namespace Cloudflare {
    interface Env {
      OAUTH_SESSION: DurableObjectNamespace;
      OAUTH_SESSION_TTL_MS: string;
      OAUTH_CALLBACK_URL: string;
      FIGMA_OAUTH_CLIENT_ID?: string;
      FIGMA_OAUTH_CLIENT_SECRET?: string;
    }
  }
}

describe("POST /oauth/start", () => {
  it("returns 400 with E_OAUTH_MISSING_SID when sid is omitted", async () => {
    const res = await SELF.fetch("https://relay/oauth/start", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("E_OAUTH_MISSING_SID");
  });

  it("returns 405 for non-POST", async () => {
    const res = await SELF.fetch("https://relay/oauth/start?sid=sid_abc12345", { method: "GET" });
    expect(res.status).toBe(405);
  });

  it("returns 400 with E_OAUTH_INVALID_SID for malformed sid", async () => {
    const res = await SELF.fetch("https://relay/oauth/start?sid=not-a-sid", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("E_OAUTH_INVALID_SID");
  });

  it("returns 400 with E_OAUTH_INVALID_SID for too-short sid", async () => {
    const res = await SELF.fetch("https://relay/oauth/start?sid=sid_a", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("E_OAUTH_INVALID_SID");
  });

  it("returns authorizeUrl pointing at figma.com/oauth with all params", async () => {
    const res = await SELF.fetch("https://relay/oauth/start?sid=sid_happypath123", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ authorizeUrl: string }>();
    expect(body.authorizeUrl.startsWith("https://www.figma.com/oauth?")).toBe(true);
    const u = new URL(body.authorizeUrl);
    expect(u.searchParams.get("client_id")).toBe(env.FIGMA_OAUTH_CLIENT_ID ?? "test-client-id");
    expect(u.searchParams.get("redirect_uri")).toBe(env.OAUTH_CALLBACK_URL);
    expect(u.searchParams.get("state")).toBe("sid_happypath123");
    expect(u.searchParams.get("response_type")).toBe("code");
    const scope = u.searchParams.get("scope") ?? "";
    expect(scope).toContain("file_read");
    expect(scope).toContain("file_variables:read");
    expect(scope).toContain("webhooks:write");
    expect(scope).toContain("current_user:read");
  });

  it("registers the sid as pending in the OauthSessionDurableObject", async () => {
    const res = await SELF.fetch("https://relay/oauth/start?sid=sid_pendingverify1", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    // Pending side-effect: /oauth/result should now return 202 (not 404).
    const id = env.OAUTH_SESSION.idFromName("sid_pendingverify1");
    const stub = env.OAUTH_SESSION.get(id);
    const result = await stub.fetch("https://do/result", { method: "GET" });
    expect(result.status).toBe(202);
  });
});

describe("handleOAuthStart (env validation)", () => {
  function fakeEnv(overrides: Partial<Cloudflare.Env>): Cloudflare.Env {
    return {
      ...env,
      ...overrides,
    } as Cloudflare.Env;
  }

  it("returns E_OAUTH_NOT_CONFIGURED when FIGMA_OAUTH_CLIENT_ID is empty", async () => {
    const fake = fakeEnv({ FIGMA_OAUTH_CLIENT_ID: "" });
    const res = await handleOAuthStart(fake as never, "sid_envcheckone1");
    expect(res.status).toBe(500);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("E_OAUTH_NOT_CONFIGURED");
  });

  it("returns E_OAUTH_NOT_CONFIGURED when FIGMA_OAUTH_CLIENT_ID is undefined", async () => {
    const fake = fakeEnv({ FIGMA_OAUTH_CLIENT_ID: undefined });
    const res = await handleOAuthStart(fake as never, "sid_envchecktwo2");
    expect(res.status).toBe(500);
  });

  it("returns E_OAUTH_NOT_CONFIGURED when OAUTH_CALLBACK_URL is empty", async () => {
    const fake = fakeEnv({ OAUTH_CALLBACK_URL: "" });
    const res = await handleOAuthStart(fake as never, "sid_envcheckthree3");
    expect(res.status).toBe(500);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("E_OAUTH_NOT_CONFIGURED");
  });

  it("rejects malformed sid before checking env", async () => {
    const fake = fakeEnv({});
    const res = await handleOAuthStart(fake as never, "bad-sid");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("E_OAUTH_INVALID_SID");
  });
});
