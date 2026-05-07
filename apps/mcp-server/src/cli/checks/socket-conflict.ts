import type { Check } from "../doctor";

export interface SocketConflictOptions {
  readonly socketPath: string;
  readonly probeConnect: () => Promise<{ ok: boolean; code?: string }>;
  readonly lockfileActive: () => Promise<{ pid: number } | null>;
}

export const createSocketConflictCheck = (opts: SocketConflictOptions): Check => ({
  name: "socket-conflict",
  async run() {
    const probe = await opts.probeConnect();
    if (!probe.ok) {
      return { status: "ok" as const, detail: "socket path unbound" };
    }
    const active = await opts.lockfileActive();
    if (!active) {
      return {
        status: "error" as const,
        detail: `E_PORT_CONFLICT: ${opts.socketPath} accepts connections but no daemon lockfile`,
      };
    }
    return { status: "ok" as const, detail: `socket bound to pid=${active.pid}` };
  },
});
