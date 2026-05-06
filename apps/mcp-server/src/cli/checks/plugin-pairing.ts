import type { Check } from "../doctor";

export interface PluginPairingProbe {
  request(method: "bridge_status"): Promise<{ pluginState?: { connected?: boolean } }>;
}

export const createPluginPairingCheck = (probe: () => Promise<PluginPairingProbe>): Check => ({
  name: "plugin-pairing",
  async run() {
    let p: PluginPairingProbe;
    try {
      p = await probe();
    } catch (err) {
      return { status: "error" as const, detail: `daemon unreachable: ${err}` };
    }
    const r = await p.request("bridge_status");
    if (r.pluginState?.connected) {
      return { status: "ok" as const, detail: "plugin paired" };
    }
    return { status: "warn" as const, detail: "plugin not paired" };
  },
});
