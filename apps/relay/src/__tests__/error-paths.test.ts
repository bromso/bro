import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * Error-path coverage for the relay (Task 6.11).
 *
 * The design doc lists four error branches the relay must handle gracefully:
 *   1. Expired pairing code         → covered at the unit level in `pairing.test.ts`
 *                                     against `PairingCodeStore.validate` /
 *                                     `consume` with an injected clock. There is
 *                                     no clean way to advance system time in the
 *                                     `cloudflare:test` runtime, so the e2e
 *                                     variant is intentionally omitted here.
 *   2. Double-use of a pairing code → tested below at the Worker level.
 *   3. Unknown sessionId on /mcp     → tested below at the Worker level.
 *   4. Plugin disconnect mid-request → tested below; exercises the
 *                                     `webSocketClose` notification path that
 *                                     drains pending AI SSE streams with
 *                                     `E_RELAY_PLUGIN_DISCONNECTED`.
 */
describe("relay error paths", () => {
  it("returns 404 for unknown sessionId on /mcp/{sessionId}", async () => {
    const res = await SELF.fetch("https://relay/mcp/ses_unknownabc123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("E_RELAY_SESSION_NOT_FOUND");
  });

  it("rejects re-use of a pairing code (double-use)", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
      sessionId: string;
    }>();

    const first = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(first.status).toBe(101);
    first.webSocket?.accept();

    const second = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(second.status).toBe(401);

    first.webSocket?.close();
  });

  it("emits E_RELAY_PLUGIN_DISCONNECTED when plugin closes mid-request", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
      sessionId: string;
    }>();

    const upgrade = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(upgrade.status).toBe(101);
    const pluginWs = upgrade.webSocket!;
    pluginWs.accept();

    // AI sends a request; we capture the response stream but defer reading
    // until after the plugin closes so the disconnect notice lands on the
    // SSE stream first.
    const aiResponse = await SELF.fetch(`https://relay/mcp/${pair.sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(aiResponse.status).toBe(200);

    pluginWs.close();

    const reader = aiResponse.body!.getReader();
    let collected = "";
    while (true) {
      const { value, done } = await reader.read();
      if (value) collected += new TextDecoder().decode(value);
      if (collected.includes("E_RELAY_PLUGIN_DISCONNECTED")) break;
      if (done) break;
    }
    expect(collected).toContain("event: error");
    expect(collected).toContain("E_RELAY_PLUGIN_DISCONNECTED");
  });
});
