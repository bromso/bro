import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

declare global {
  namespace Cloudflare {
    interface Env {
      RELAY: DurableObjectNamespace;
      LOOKUP: DurableObjectNamespace;
      PAIRING_CODE_TTL_MS: string;
      RPC_TIMEOUT_MS: string;
    }
  }
}

describe("RelayDurableObject (routing)", () => {
  it("returns 404 for unknown internal paths", async () => {
    const id = env.RELAY.idFromName("test-1");
    const stub = env.RELAY.get(id);
    const response = await stub.fetch("https://relay/__unknown__");
    expect(response.status).toBe(404);
  });

  it("routes /seed-pair to handler returning a valid pairing payload", async () => {
    const id = env.RELAY.idFromName("test-2");
    const stub = env.RELAY.get(id);
    const response = await stub.fetch("https://relay/seed-pair?sessionId=ses_test", {
      method: "POST",
    });
    expect(response.status).toBe(200);
    const body = await response.json<{
      code: string;
      sessionId: string;
      expiresAt: number;
    }>();
    expect(body.code).toMatch(/^\d{6}$/);
    expect(body.sessionId).toBe("ses_test");
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("routes /connect-plugin and returns 426 when the Upgrade header is missing", async () => {
    const id = env.RELAY.idFromName("test-3");
    const stub = env.RELAY.get(id);
    const response = await stub.fetch("https://relay/connect-plugin");
    expect(response.status).toBe(426);
  });

  it("routes /mcp POST to handleMcp, which returns 404 when no pairing was seeded", async () => {
    const id = env.RELAY.idFromName("test-4");
    const stub = env.RELAY.get(id);
    const response = await stub.fetch("https://relay/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(404);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("E_RELAY_SESSION_NOT_FOUND");
  });
});
