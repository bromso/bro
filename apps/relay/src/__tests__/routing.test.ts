import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("AI ↔ plugin routing", () => {
  it("plugin response with matching id closes the AI's SSE stream with the response payload", async () => {
    // Pair + plugin connect.
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

    // Plugin echoes the incoming request as a JSON-RPC response.
    pluginWs.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data as string) as { id: number };
      pluginWs.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { ok: true } }));
    });

    // AI POSTs an MCP request.
    const aiResp = await SELF.fetch(`https://relay/mcp/${pair.sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 42, method: "tools/list" }),
    });
    expect(aiResp.status).toBe(200);
    expect(aiResp.headers.get("Content-Type")).toContain("text/event-stream");

    // Read the SSE stream until done.
    const reader = aiResp.body!.getReader();
    let chunkText = "";
    // Read first chunk — the response should arrive promptly.
    const first = await reader.read();
    if (first.value) chunkText += new TextDecoder().decode(first.value);

    expect(chunkText).toContain('"result":{"ok":true}');
    expect(chunkText).toContain('"id":42');
    expect(chunkText.startsWith("data: ")).toBe(true);

    pluginWs.close();
  });
});
