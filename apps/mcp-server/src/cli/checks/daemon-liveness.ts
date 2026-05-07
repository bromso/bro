import type { LockfileManager } from "../../daemon/lockfile";
import type { Check } from "../doctor";

export const createDaemonLivenessCheck = (lockfile: LockfileManager): Check => ({
  name: "daemon-liveness",
  async run() {
    const active = await lockfile.readActive();
    if (active) {
      return { status: "ok" as const, detail: `pid=${active.pid} version=${active.version}` };
    }
    const stale = await lockfile.read();
    if (stale) {
      return { status: "error" as const, detail: `stale lockfile (pid=${stale.pid} not alive)` };
    }
    return { status: "warn" as const, detail: "no daemon running" };
  },
});
