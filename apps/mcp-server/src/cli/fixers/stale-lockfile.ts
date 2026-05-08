import type { LockfileManager } from "../../daemon/lockfile";
import type { Fixer } from "../doctor";

/**
 * Auto-fix for the `daemon-liveness` doctor check.
 *
 * Behaviour:
 *   - If a lockfile exists, unlink it via `LockfileManager.clear()`.
 *   - If no lockfile exists (e.g. daemon was simply not running), this is a
 *     no-op — there's nothing to clear, so the fix reports that and the
 *     subsequent re-check just confirms "no daemon running".
 *
 * The fixer is intentionally idempotent: calling it twice in a row is safe.
 */
export const createStaleLockfileFixer = (lockfile: LockfileManager): Fixer => ({
  async run() {
    const existing = await lockfile.read();
    if (!existing) {
      return { detail: "no lockfile to clear" };
    }
    await lockfile.clear();
    return { detail: "stale lockfile cleared" };
  },
});
