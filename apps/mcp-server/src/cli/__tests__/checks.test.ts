import { describe, expect, it, vi } from "vitest";
import type { LockfileManager, LockRecord } from "../../daemon/lockfile";
import { createAiClientConfigsCheck } from "../checks/ai-client-configs";
import { createDaemonLivenessCheck } from "../checks/daemon-liveness";
import { createPluginPairingCheck, type PluginPairingProbe } from "../checks/plugin-pairing";
import { createRecentErrorsCheck } from "../checks/recent-errors";
import type { DetectedClient } from "../detect";

const makeLockfile = (
  active: LockRecord | null,
  stored: LockRecord | null = active
): LockfileManager =>
  ({
    readActive: vi.fn(async () => active),
    read: vi.fn(async () => stored),
  }) as unknown as LockfileManager;

const RECORD: LockRecord = { pid: 42, version: "1.2.3", socketPath: "/tmp/x.sock" };

describe("daemon-liveness check", () => {
  it("returns ok with pid+version when daemon is active", async () => {
    const check = createDaemonLivenessCheck(makeLockfile(RECORD));
    const r = await check.run();
    expect(r.status).toBe("ok");
    expect(r.detail).toContain("pid=42");
    expect(r.detail).toContain("version=1.2.3");
  });

  it("returns error when lockfile is stale (read but not active)", async () => {
    const check = createDaemonLivenessCheck(makeLockfile(null, RECORD));
    const r = await check.run();
    expect(r.status).toBe("error");
    expect(r.detail).toMatch(/stale lockfile/);
    expect(r.detail).toContain("pid=42");
  });

  it("returns warn when no lockfile is present", async () => {
    const check = createDaemonLivenessCheck(makeLockfile(null, null));
    const r = await check.run();
    expect(r.status).toBe("warn");
    expect(r.detail).toBe("no daemon running");
  });
});

describe("plugin-pairing check", () => {
  it("returns error when probe throws", async () => {
    const probe = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const check = createPluginPairingCheck(probe as unknown as () => Promise<PluginPairingProbe>);
    const r = await check.run();
    expect(r.status).toBe("error");
    expect(r.detail).toMatch(/daemon unreachable/);
    expect(r.detail).toMatch(/ECONNREFUSED/);
  });

  it("returns ok when bridge_status reports connected:true", async () => {
    const probe: PluginPairingProbe = {
      request: vi.fn(async () => ({ pluginState: { connected: true } })),
    };
    const check = createPluginPairingCheck(async () => probe);
    const r = await check.run();
    expect(r.status).toBe("ok");
    expect(r.detail).toBe("plugin paired");
  });

  it("returns warn when bridge_status reports connected:false", async () => {
    const probe: PluginPairingProbe = {
      request: vi.fn(async () => ({ pluginState: { connected: false } })),
    };
    const check = createPluginPairingCheck(async () => probe);
    const r = await check.run();
    expect(r.status).toBe("warn");
    expect(r.detail).toBe("plugin not paired");
  });
});

const makeClient = (
  id: DetectedClient["id"],
  present: boolean,
  configPath = `/p/${id}.json`
): DetectedClient => ({ id, name: id, configPath, present });

describe("ai-client-configs check", () => {
  it("returns ok when no clients are present", async () => {
    const clients: DetectedClient[] = [
      makeClient("claude-code", false),
      makeClient("cursor", false),
    ];
    const readFile = vi.fn(async () => "");
    const r = await createAiClientConfigsCheck(clients, readFile).run();
    expect(r.status).toBe("ok");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("returns ok when all present clients have valid mcpServers.figma", async () => {
    const clients = [makeClient("claude-code", true), makeClient("cursor", true)];
    const readFile = vi.fn(async () =>
      JSON.stringify({ mcpServers: { figma: { command: "figma-mcp" } } })
    );
    const r = await createAiClientConfigsCheck(clients, readFile).run();
    expect(r.status).toBe("ok");
    expect(r.detail).toMatch(/all configured clients valid/);
  });

  it("returns warn when a present client is missing mcpServers.figma", async () => {
    const clients = [makeClient("claude-code", true)];
    const readFile = vi.fn(async () => JSON.stringify({ mcpServers: { other: {} } }));
    const r = await createAiClientConfigsCheck(clients, readFile).run();
    expect(r.status).toBe("warn");
    expect(r.detail).toMatch(/claude-code: missing mcpServers\.figma/);
  });

  it("returns warn when a present client's config is invalid JSON", async () => {
    const clients = [makeClient("cursor", true)];
    const readFile = vi.fn(async () => "{not valid json");
    const r = await createAiClientConfigsCheck(clients, readFile).run();
    expect(r.status).toBe("warn");
    expect(r.detail).toMatch(/cursor:/);
  });
});

describe("recent-errors check", () => {
  it("returns ok when the log file does not exist", async () => {
    const readFile = vi.fn(async () => {
      throw new Error("ENOENT");
    });
    const r = await createRecentErrorsCheck("/nope.log", readFile).run();
    expect(r.status).toBe("ok");
    expect(r.detail).toMatch(/no daemon log present/);
  });

  it("returns ok when the log has no error-level entries", async () => {
    const readFile = vi.fn(async () =>
      ['{"level":"info","msg":"ok"}', '{"level":"warn","msg":"hmm"}'].join("\n")
    );
    const r = await createRecentErrorsCheck("/log", readFile).run();
    expect(r.status).toBe("ok");
    expect(r.detail).toMatch(/no recent errors/);
  });

  it("returns warn including the last error when error entries exist", async () => {
    const lines = [
      '{"level":"info","msg":"start"}',
      '{"level":"error","msg":"first boom"}',
      '{"level":"info","msg":"mid"}',
      '{"level":"error","msg":"last boom"}',
    ];
    const readFile = vi.fn(async () => lines.join("\n"));
    const r = await createRecentErrorsCheck("/log", readFile).run();
    expect(r.status).toBe("warn");
    expect(r.detail).toMatch(/2 recent error\(s\)/);
    expect(r.detail).toMatch(/last boom/);
  });
});
