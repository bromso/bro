import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { isPidAliveDefault, LockfileManager } from "../lockfile";

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mcp-lock-"));
  path = join(dir, "daemon.lock");
});

describe("LockfileManager", () => {
  it("read() returns null when no lockfile exists", async () => {
    const lf = new LockfileManager({ path, isPidAlive: () => true });
    expect(await lf.read()).toBeNull();
  });

  it("write() then read() returns the same record", async () => {
    const lf = new LockfileManager({ path, isPidAlive: () => true });
    await lf.write({ pid: process.pid, version: "0.0.0", socketPath: "/tmp/x.sock" });
    const r = await lf.read();
    expect(r?.pid).toBe(process.pid);
    expect(r?.version).toBe("0.0.0");
    expect(r?.socketPath).toBe("/tmp/x.sock");
  });

  it("readActive() ignores stale lockfiles whose PID is dead", async () => {
    const lf = new LockfileManager({ path, isPidAlive: () => false });
    await lf.write({ pid: 999999, version: "0.0.0", socketPath: "/tmp/x.sock" });
    expect(await lf.readActive()).toBeNull();
  });

  it("readActive() returns the record when the PID is alive", async () => {
    const lf = new LockfileManager({ path, isPidAlive: () => true });
    await lf.write({ pid: 1, version: "0.0.0", socketPath: "/tmp/x.sock" });
    const r = await lf.readActive();
    expect(r?.pid).toBe(1);
  });

  it("clear() removes the lockfile (idempotent)", async () => {
    const lf = new LockfileManager({ path, isPidAlive: () => true });
    await lf.write({ pid: 1, version: "0.0.0", socketPath: "/tmp/x.sock" });
    await lf.clear();
    expect(await lf.read()).toBeNull();
    await lf.clear(); // second call is a no-op
    expect(await lf.read()).toBeNull();
  });

  it("read() returns null on a corrupted lockfile (treats as missing)", async () => {
    await import("node:fs/promises").then((fs) => fs.writeFile(path, "not json"));
    const lf = new LockfileManager({ path, isPidAlive: () => true });
    expect(await lf.read()).toBeNull();
  });

  it("read() returns null when JSON parses but required fields are missing", async () => {
    // Valid JSON but missing `socketPath` — exercises the schema-shape guard
    // that distinguishes a parse failure from a partial record.
    await writeFile(path, JSON.stringify({ pid: 1, version: "0.0.0" }));
    const lf = new LockfileManager({ path, isPidAlive: () => true });
    expect(await lf.read()).toBeNull();
  });
});

describe("isPidAliveDefault", () => {
  it("returns true for the current process", () => {
    expect(isPidAliveDefault(process.pid)).toBe(true);
  });

  it("returns false for a PID that is not running", () => {
    // POSIX reserves PID 0; Node's process.kill(0, 0) on Linux/macOS rejects
    // with ESRCH for unreachable targets. Use a comically high PID instead.
    expect(isPidAliveDefault(2_147_483_646)).toBe(false);
  });
});
