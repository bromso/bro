import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

declare global {
  namespace Cloudflare {
    interface Env {
      OAUTH_SESSION: DurableObjectNamespace;
      OAUTH_SESSION_TTL_MS: string;
    }
  }
}

const sampleTokens = {
  accessToken: "access_xyz",
  refreshToken: "refresh_abc",
  expiresAt: Date.now() + 60 * 60 * 1000,
  scope: "file_read",
};

describe("OauthSessionDurableObject", () => {
  it("returns 404 for unknown internal paths", async () => {
    const id = env.OAUTH_SESSION.idFromName("sid_unknown_path");
    const stub = env.OAUTH_SESSION.get(id);
    const res = await stub.fetch("https://do/__wat__");
    expect(res.status).toBe(404);
  });

  it("returns 404 from /result before /pending was called", async () => {
    const id = env.OAUTH_SESSION.idFromName("sid_pre_pending");
    const stub = env.OAUTH_SESSION.get(id);
    const res = await stub.fetch("https://do/result", { method: "GET" });
    expect(res.status).toBe(404);
  });

  it("returns 202 from /result after /pending but before /complete", async () => {
    const id = env.OAUTH_SESSION.idFromName("sid_pending_only");
    const stub = env.OAUTH_SESSION.get(id);
    const pending = await stub.fetch("https://do/pending", { method: "POST" });
    expect(pending.status).toBe(200);
    const result = await stub.fetch("https://do/result", { method: "GET" });
    expect(result.status).toBe(202);
  });

  it("returns 200 with tokens from /result after /complete", async () => {
    const id = env.OAUTH_SESSION.idFromName("sid_completed");
    const stub = env.OAUTH_SESSION.get(id);
    await stub.fetch("https://do/pending", { method: "POST" });
    const completeRes = await stub.fetch("https://do/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: sampleTokens }),
    });
    expect(completeRes.status).toBe(200);

    const result = await stub.fetch("https://do/result", { method: "GET" });
    expect(result.status).toBe(200);
    const body = await result.json<{ tokens: typeof sampleTokens }>();
    expect(body.tokens).toEqual(sampleTokens);
  });

  it("returns 404 from /complete when no /pending was recorded", async () => {
    const id = env.OAUTH_SESSION.idFromName("sid_complete_no_pending");
    const stub = env.OAUTH_SESSION.get(id);
    const completeRes = await stub.fetch("https://do/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: sampleTokens }),
    });
    expect(completeRes.status).toBe(404);
  });

  it("returns 400 from /complete with invalid JSON body", async () => {
    const id = env.OAUTH_SESSION.idFromName("sid_complete_bad_json");
    const stub = env.OAUTH_SESSION.get(id);
    await stub.fetch("https://do/pending", { method: "POST" });
    const res = await stub.fetch("https://do/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 from /complete with missing tokens field", async () => {
    const id = env.OAUTH_SESSION.idFromName("sid_complete_no_tokens");
    const stub = env.OAUTH_SESSION.get(id);
    await stub.fetch("https://do/pending", { method: "POST" });
    const res = await stub.fetch("https://do/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 from /complete with malformed tokens (missing fields)", async () => {
    const id = env.OAUTH_SESSION.idFromName("sid_complete_bad_tokens");
    const stub = env.OAUTH_SESSION.get(id);
    await stub.fetch("https://do/pending", { method: "POST" });
    const res = await stub.fetch("https://do/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: { accessToken: "only" } }),
    });
    expect(res.status).toBe(400);
  });

  it("/pending returns expiresAt in the future", async () => {
    const id = env.OAUTH_SESSION.idFromName("sid_pending_expires");
    const stub = env.OAUTH_SESSION.get(id);
    const before = Date.now();
    const res = await stub.fetch("https://do/pending", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; expiresAt: number }>();
    expect(body.ok).toBe(true);
    expect(body.expiresAt).toBeGreaterThan(before);
  });

  it("rejects unknown HTTP methods on each route", async () => {
    const id = env.OAUTH_SESSION.idFromName("sid_methods");
    const stub = env.OAUTH_SESSION.get(id);
    const get = await stub.fetch("https://do/pending", { method: "GET" });
    expect(get.status).toBe(404);
    const post = await stub.fetch("https://do/result", { method: "POST" });
    expect(post.status).toBe(404);
  });
});
