import { describe, expect, it } from "vitest";
import { createBridgeStatusServerHandler } from "../server-handlers";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe("createBridgeStatusServerHandler", () => {
  it("reports pid, version, uptime, and plugin state from the provider", async () => {
    const handler = createBridgeStatusServerHandler({
      getDaemonInfo: () => ({ pid: 1234, version: "0.0.0", uptimeMs: 50 }),
      getPluginState: () => ({ connected: true, lastConnectedAt: 1700000000000 }),
    });
    const result = await handler({}, { logger: noopLogger });
    expect(result.daemon.pid).toBe(1234);
    expect(result.plugin.connected).toBe(true);
    expect(result.plugin.lastConnectedAt).toBe(1700000000000);
  });

  it("works when the plugin has never connected", async () => {
    const handler = createBridgeStatusServerHandler({
      getDaemonInfo: () => ({ pid: 1, version: "0.0.0", uptimeMs: 0 }),
      getPluginState: () => ({ connected: false }),
    });
    const result = await handler({}, { logger: noopLogger });
    expect(result.plugin.connected).toBe(false);
    expect(result.plugin.lastConnectedAt).toBeUndefined();
  });
});
