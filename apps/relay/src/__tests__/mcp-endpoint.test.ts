import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("POST /mcp/{sessionId}", () => {
  it("returns 404 for an unknown sessionId", async () => {
    const response = await SELF.fetch("https://relay/mcp/ses_unknownsess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns 503 when no plugin is connected", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      sessionId: string;
    }>();
    const response = await SELF.fetch(`https://relay/mcp/${pair.sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(503);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("E_RELAY_PLUGIN_NOT_CONNECTED");
  });
});
