import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LockfileManager } from "../../daemon/lockfile";
import { createStaleLockfileFixer } from "../fixers/stale-lockfile";

describe("createStaleLockfileFixer", () => {
  let dir: string;
  let lockPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "stale-lock-fixer-"));
    lockPath = join(dir, "daemon.lock");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("clears a stale lockfile and reports it cleared", async () => {
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 99999, version: "0.0.0", socketPath: "/tmp/x.sock" })
    );
    // PID is "alive" per stub, but for this test the fixer doesn't care —
    // it just clears whatever is on disk.
    const lockfile = new LockfileManager({ path: lockPath, isPidAlive: () => false });

    const fixer = createStaleLockfileFixer(lockfile);
    const result = await fixer.run();

    expect(result.detail).toBe("stale lockfile cleared");
    await expect(readFile(lockPath, "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("is a no-op when no lockfile exists", async () => {
    const lockfile = new LockfileManager({ path: lockPath, isPidAlive: () => true });
    const fixer = createStaleLockfileFixer(lockfile);

    const result = await fixer.run();

    expect(result.detail).toBe("no lockfile to clear");
  });

  it("clears the lockfile even if the PID happens to be alive (defensive)", async () => {
    // The doctor check decides whether the lockfile is stale; the fixer is
    // only invoked when the check has already classified it as stale, so the
    // fixer itself does not re-validate liveness.
    await writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, version: "0.0.0", socketPath: "/tmp/x.sock" })
    );
    const lockfile = new LockfileManager({ path: lockPath, isPidAlive: () => true });
    const fixer = createStaleLockfileFixer(lockfile);

    const result = await fixer.run();

    expect(result.detail).toBe("stale lockfile cleared");
    await expect(readFile(lockPath, "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("is idempotent — running twice does not throw", async () => {
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 1, version: "0.0.0", socketPath: "/tmp/x.sock" })
    );
    const lockfile = new LockfileManager({ path: lockPath, isPidAlive: () => false });
    const fixer = createStaleLockfileFixer(lockfile);

    const first = await fixer.run();
    const second = await fixer.run();

    expect(first.detail).toBe("stale lockfile cleared");
    expect(second.detail).toBe("no lockfile to clear");
  });
});
