import { env, runInDurableObject, SELF } from "cloudflare:test";
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

describe("Hibernation lifecycle", () => {
  it("a plugin message reaches webSocketMessage and triggers routePluginMessage", async () => {
    // Pair + plugin connect.
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
      sessionId: string;
    }>();
    const upgrade = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(upgrade.status).toBe(101);
    upgrade.webSocket?.accept();

    // Plugin sends a frame.
    upgrade.webSocket?.send("hello-from-plugin");

    // Drive into the DO to inspect that webSocketMessage observed the frame.
    // We use runInDurableObject + a test-only counter exposed on the DO via
    // a Symbol or a simple test seam: incrementing a counter in
    // routePluginMessage. Read it from inside the DO context.
    const id = env.RELAY.idFromName(pair.sessionId);
    const stub = env.RELAY.get(id);

    // Give the message a tick to land.
    await new Promise((r) => setTimeout(r, 50));

    const observed = await runInDurableObject(stub, (instance) => {
      // Cast to the test-visible shape — runInDurableObject gives us the actual instance.
      return (instance as unknown as { __pluginMessageCount: number }).__pluginMessageCount ?? 0;
    });
    expect(observed).toBeGreaterThanOrEqual(1);
  });

  it("webSocketClose clears the pluginWs reference", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
      sessionId: string;
    }>();
    const upgrade = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    upgrade.webSocket?.accept();
    upgrade.webSocket?.close();

    // Wait for close to propagate.
    await new Promise((r) => setTimeout(r, 50));

    const id = env.RELAY.idFromName(pair.sessionId);
    const stub = env.RELAY.get(id);

    const pluginWs = await runInDurableObject(stub, (instance) => {
      return (instance as unknown as { pluginWs: WebSocket | null }).pluginWs;
    });
    expect(pluginWs).toBeNull();
  });
});
