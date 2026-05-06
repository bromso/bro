import type { ServerHandler } from "@repo/protocol";
import type { BridgeStatus as BridgeStatusTool } from "./tools";

export interface BridgeStatusProviders {
  readonly getDaemonInfo: () => {
    pid: number;
    version: string;
    uptimeMs: number;
  };
  readonly getPluginState: () => {
    connected: boolean;
    lastConnectedAt?: number;
  };
}

/**
 * Factory: returns a `bridge_status` server handler bound to the
 * provided daemon-state providers. The factory shape lets the daemon
 * inject its real lifecycle hooks while keeping the handler test-pure.
 */
export function createBridgeStatusServerHandler(
  providers: BridgeStatusProviders
): ServerHandler<typeof BridgeStatusTool> {
  return async (_args, _ctx) => ({
    daemon: providers.getDaemonInfo(),
    plugin: providers.getPluginState(),
  });
}
