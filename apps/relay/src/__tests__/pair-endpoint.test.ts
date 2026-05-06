import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("POST /pair", () => {
  it("returns 6-digit code + sessionId + expiresAt", async () => {
    const response = await SELF.fetch("https://relay/pair", { method: "POST" });
    expect(response.status).toBe(200);
    const body = await response.json<{ code: string; sessionId: string; expiresAt: number }>();
    expect(body.code).toMatch(/^\d{6}$/);
    expect(body.sessionId).toMatch(/^ses_/);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("returns 426 for GET /pair without an Upgrade header", async () => {
    const response = await SELF.fetch("https://relay/pair", { method: "GET" });
    expect(response.status).toBe(426);
  });

  it("each POST returns a different sessionId", async () => {
    const a = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      sessionId: string;
    }>();
    const b = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      sessionId: string;
    }>();
    expect(a.sessionId).not.toBe(b.sessionId);
  });
});
