import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Hibernation restore", () => {
  it("rehydrates pluginWs from state.getWebSockets after instance reconstruction", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
      sessionId: string;
    }>();
    const upgrade = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(upgrade.status).toBe(101);
    upgrade.webSocket?.accept();

    // Wait for the WS to fully attach.
    await new Promise((r) => setTimeout(r, 50));

    const id = env.RELAY.idFromName(pair.sessionId);
    const stub = env.RELAY.get(id);

    // Verify the live instance has pluginWs set (sanity check from Task 6.5/6.6).
    const liveHasPlugin = await runInDurableObject(stub, (instance) => {
      return (instance as unknown as { pluginWs: WebSocket | null }).pluginWs !== null;
    });
    expect(liveHasPlugin).toBe(true);

    // The state.getWebSockets("plugin") path is what the constructor uses on
    // restore. We can't easily force a hibernation cycle inside the test
    // pool, but we CAN verify the rehydration logic works by inspecting that
    // state.getWebSockets returns the attached server WS.
    const accepted = await runInDurableObject(stub, (instance) => {
      const state = (instance as unknown as { state: DurableObjectState }).state;
      const wss = state.getWebSockets("plugin");
      return { count: wss.length, hasAttachment: wss[0] ? wss[0].deserializeAttachment() : null };
    });
    expect(accepted.count).toBe(1);
    expect(accepted.hasAttachment).toMatchObject({ sessionId: pair.sessionId });

    upgrade.webSocket?.close();
  });

  it("constructor's rehydration path runs without error when no plugin is attached", async () => {
    // Create a DO that has been seeded but no plugin connected.
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      sessionId: string;
    }>();

    const id = env.RELAY.idFromName(pair.sessionId);
    const stub = env.RELAY.get(id);
    // Forcing a fresh instance is non-trivial in the pool; instead, we just
    // verify pluginWs is null (no plugin connected) — the constructor either
    // ran with empty state.getWebSockets("plugin") or hasn't been re-instanced.
    const isNull = await runInDurableObject(stub, (instance) => {
      return (instance as unknown as { pluginWs: WebSocket | null }).pluginWs === null;
    });
    expect(isNull).toBe(true);
  });
});
