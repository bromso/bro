import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("e2e: pair → plugin connect → AI request → response", () => {
  it("routes a JSON-RPC request from AI to plugin and back", async () => {
    // 1. AI requests a pairing code.
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
      sessionId: string;
    }>();

    // 2. Plugin connects with the code.
    const upgrade = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(upgrade.status).toBe(101);
    const pluginWs = upgrade.webSocket!;
    pluginWs.accept();

    // Plugin echoes incoming messages with id matched and result reflected.
    const pluginGotMessage = new Promise<{ id: number | string }>((resolve) => {
      pluginWs.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data as string);
        resolve(msg);
        // Reply with a JSON-RPC response.
        pluginWs.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { ok: true } }));
      });
    });

    // 3. AI sends a request.
    const aiResponsePromise = SELF.fetch(`https://relay/mcp/${pair.sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    // 4. Plugin receives.
    await pluginGotMessage;

    // 5. AI's SSE stream receives the response.
    const aiResponse = await aiResponsePromise;
    expect(aiResponse.status).toBe(200);
    const reader = aiResponse.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"result":{"ok":true}');
  });
});
