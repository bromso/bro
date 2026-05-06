import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

declare global {
  namespace Cloudflare {
    interface Env {
      RELAY: DurableObjectNamespace;
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

  it("routes /seed-pair to a stub returning 501 (not yet implemented)", async () => {
    const id = env.RELAY.idFromName("test-2");
    const stub = env.RELAY.get(id);
    const response = await stub.fetch("https://relay/seed-pair", { method: "POST" });
    expect(response.status).toBe(501);
  });

  it("routes /connect-plugin to a stub returning 501 (not yet implemented)", async () => {
    const id = env.RELAY.idFromName("test-3");
    const stub = env.RELAY.get(id);
    const response = await stub.fetch("https://relay/connect-plugin");
    expect(response.status).toBe(501);
  });

  it("routes /mcp POST to a stub returning 501 (not yet implemented)", async () => {
    const id = env.RELAY.idFromName("test-4");
    const stub = env.RELAY.get(id);
    const response = await stub.fetch("https://relay/mcp", { method: "POST" });
    expect(response.status).toBe(501);
  });
});
