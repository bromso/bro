/**
 * @repo/mcp-server — entry point.
 *
 * Two modes selected by `resolveStartup`:
 *   - default (no flag): stdio shim. Forks a daemon if none is running.
 *   - --daemon: daemon main loop. Launched detached by a stdio shim.
 *
 * Excluded from coverage (see vitest.config.ts); branches exercised by
 * Task 3.16's spawn smoke test.
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import {
  BridgeStatus,
  createBridgeStatusServerHandler,
  ExtractComponents,
  ExtractLocalVariables,
  ExtractStyles,
  extractComponentsPluginHandler,
  extractLocalVariablesPluginHandler,
  extractStylesPluginHandler,
} from "@repo/tools-extract";
import { Daemon } from "./daemon/daemon";
import { isPidAliveDefault, LockfileManager } from "./daemon/lockfile";
import { resolveStartup } from "./orchestrator";
import { createStdioShim } from "./shim/stdio-shim";

const VERSION = "0.0.0";
const DEFAULT_DIR = join(homedir(), ".figma-mcp");
const SOCKET_PATH = join(DEFAULT_DIR, "daemon.sock");
const LOCK_PATH = join(DEFAULT_DIR, "daemon.lock");

async function main(): Promise<void> {
  const lockfile = new LockfileManager({ path: LOCK_PATH, isPidAlive: isPidAliveDefault });

  const startup = await resolveStartup({
    argv: process.argv,
    version: VERSION,
    lockfile,
    socketPath: SOCKET_PATH,
    spawnDaemon: async () => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--daemon"], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      // Poll the lockfile until the daemon writes it.
      const start = Date.now();
      while (Date.now() - start < 5_000) {
        const active = await lockfile.readActive();
        if (active) return { pid: active.pid, socketPath: active.socketPath };
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("daemon did not start within 5s");
    },
  });

  if (startup.mode === "daemon") {
    const figma = new FigmaFake();
    const lifecycleStartedAt = Date.now();
    const daemon = await Daemon.start({
      socketPath: startup.socketPath,
      figma,
      packs: [
        {
          name: "tools-extract",
          tools: [ExtractStyles, ExtractComponents, ExtractLocalVariables, BridgeStatus],
          registerPlugin: (reg) => {
            reg.register(ExtractStyles, extractStylesPluginHandler);
            reg.register(ExtractComponents, extractComponentsPluginHandler);
            reg.register(ExtractLocalVariables, extractLocalVariablesPluginHandler);
          },
          registerServer: (reg) => {
            reg.register(
              BridgeStatus,
              createBridgeStatusServerHandler({
                getDaemonInfo: () => ({
                  pid: process.pid,
                  version: VERSION,
                  uptimeMs: Date.now() - lifecycleStartedAt,
                }),
                getPluginState: () => ({ connected: false }),
              })
            );
          },
        },
      ],
    });
    await lockfile.write({
      pid: process.pid,
      version: VERSION,
      socketPath: startup.socketPath,
    });
    process.on("SIGTERM", async () => {
      await daemon.stop();
      await lockfile.clear();
      process.exit(0);
    });
    return;
  }

  const shim = await createStdioShim({
    socketPath: startup.socketPath,
    sourceClientId: `shim-${process.pid}`,
    tools: [ExtractStyles, ExtractComponents, ExtractLocalVariables, BridgeStatus],
    mcpServerInfo: { name: "figma-mcp", version: VERSION },
  });
  await shim.connectMcp(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
