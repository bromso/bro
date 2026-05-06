import { describe, expect, it, vi } from "vitest";
import { resolveStartup } from "../orchestrator";

describe("resolveStartup", () => {
  it("uses the existing daemon when the lockfile is active", async () => {
    const lf = {
      readActive: vi.fn().mockResolvedValue({
        pid: 1234,
        version: "0.0.0",
        socketPath: "/tmp/x.sock",
      }),
      write: vi.fn(),
      clear: vi.fn(),
      read: vi.fn(),
    };
    const spawn = vi.fn();
    const result = await resolveStartup({
      argv: ["node", "main.js"],
      version: "0.0.0",
      lockfile: lf as never,
      spawnDaemon: spawn,
      socketPath: "/tmp/x.sock",
    });
    expect(result).toEqual({ mode: "shim", socketPath: "/tmp/x.sock" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawns a daemon when no active lockfile exists", async () => {
    const lf = {
      readActive: vi.fn().mockResolvedValue(null),
      write: vi.fn(),
      clear: vi.fn(),
      read: vi.fn(),
    };
    const spawn = vi.fn().mockResolvedValue({ socketPath: "/tmp/x.sock", pid: 9999 });
    const result = await resolveStartup({
      argv: ["node", "main.js"],
      version: "0.0.0",
      lockfile: lf as never,
      spawnDaemon: spawn,
      socketPath: "/tmp/x.sock",
    });
    expect(spawn).toHaveBeenCalled();
    expect(result).toEqual({ mode: "shim", socketPath: "/tmp/x.sock" });
  });

  it("returns 'daemon' mode when --daemon flag is present", async () => {
    const lf = {
      readActive: vi.fn(),
      write: vi.fn(),
      clear: vi.fn(),
      read: vi.fn(),
    };
    const result = await resolveStartup({
      argv: ["node", "main.js", "--daemon"],
      version: "0.0.0",
      lockfile: lf as never,
      spawnDaemon: vi.fn(),
      socketPath: "/tmp/x.sock",
    });
    expect(result).toEqual({ mode: "daemon", socketPath: "/tmp/x.sock" });
  });

  it("clears a stale lockfile before spawning", async () => {
    const lf = {
      readActive: vi.fn().mockResolvedValue(null),
      read: vi.fn().mockResolvedValue({ pid: 999999, version: "0.0.0", socketPath: "/tmp/x.sock" }),
      write: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const spawn = vi.fn().mockResolvedValue({ socketPath: "/tmp/x.sock", pid: 1 });
    await resolveStartup({
      argv: ["node", "main.js"],
      version: "0.0.0",
      lockfile: lf as never,
      spawnDaemon: spawn,
      socketPath: "/tmp/x.sock",
    });
    expect(lf.clear).toHaveBeenCalled();
    expect(spawn).toHaveBeenCalled();
  });
});
