import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * Worker-level routing edges. These exercise the cheap fallthrough branches in
 * `src/index.ts` that aren't covered by the happy-path or error-path tests:
 *   - 405 on non-{POST,GET} for /pair
 *   - 405 on non-POST for /mcp/{sessionId}
 *   - 404 fallback for unknown paths
 *
 * Plus the plugin-notification broadcast branch in
 * `RelayDurableObject.routePluginMessage` (a JSON-RPC frame with `method` and
 * no `id` — broadcast to every open AI SSE writer without closing the stream).
 */
describe("worker routing edges", () => {
  it("405s on /pair with disallowed method", async () => {
    const res = await SELF.fetch("https://relay/pair", { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  it("405s on /mcp/{sessionId} with non-POST method", async () => {
    const res = await SELF.fetch("https://relay/mcp/ses_abc123def456", { method: "GET" });
    expect(res.status).toBe(405);
  });

  it("404s on an unknown path", async () => {
    const res = await SELF.fetch("https://relay/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("broadcasts plugin notifications (no `id`) to open AI SSE streams", async () => {
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

    // Plugin replies to the request with: a notification first (broadcast,
    // no close), then the response (closes the stream).
    pluginWs.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data as string) as { id: number };
      pluginWs.send(
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: { p: 1 } })
      );
      pluginWs.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { ok: true } }));
    });

    const aiResp = await SELF.fetch(`https://relay/mcp/${pair.sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }),
    });
    expect(aiResp.status).toBe(200);

    const reader = aiResp.body!.getReader();
    let collected = "";
    while (true) {
      const { value, done } = await reader.read();
      if (value) collected += new TextDecoder().decode(value);
      if (collected.includes('"id":7')) break;
      if (done) break;
    }
    expect(collected).toContain("notifications/progress");
    expect(collected).toContain('"id":7');

    pluginWs.close();
  });
});
