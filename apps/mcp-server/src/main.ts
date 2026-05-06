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
import { mkdir } from "node:fs/promises";
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
import {
  createStreamStatusPluginHandler,
  ExportVariables,
  exportVariablesPluginHandler,
  ImportVariables,
  StreamStatus,
  UpdateVariablesBatch,
  updateVariablesBatchPluginHandler,
} from "@repo/tools-variables";
import { Daemon } from "./daemon/daemon";
import { isPidAliveDefault, LockfileManager } from "./daemon/lockfile";
import { resolveStartup } from "./orchestrator";
import { createStdioShim } from "./shim/stdio-shim";
import { createImportVariablesServerHandler } from "./streaming/import-handler";
import type { ChunkLoopTransport } from "./streaming/session-manager";

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
    // Ensure ~/.figma-mcp exists before binding the Unix socket inside it.
    await mkdir(DEFAULT_DIR, { recursive: true });
    const figma = new FigmaFake();
    const lifecycleStartedAt = Date.now();
    let daemonRef: Daemon | null = null;
    const buildImportTransport = (): ChunkLoopTransport => {
      const correlator = daemonRef?.pluginCorrelator;
      if (!daemonRef || !correlator) {
        throw new Error("plugin not connected");
      }
      const d = daemonRef;
      return {
        async send(env) {
          await d.wsBroadcast(env);
        },
        async request(env) {
          // Correlator.request is typed for RequestEnvelope but the
          // runtime only keys on `id` and forwards verbatim — chunk
          // envelopes have the same `id` shape so this is a typing
          // gap, not a runtime issue. Phase 6/7 will widen the
          // Correlator API.
          return correlator.request(env as never);
        },
      };
    };
    const daemon = await Daemon.start({
      socketPath: startup.socketPath,
      version: VERSION,
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
        {
          name: "tools-variables",
          tools: [ImportVariables, ExportVariables, UpdateVariablesBatch, StreamStatus],
          registerPlugin: (reg) => {
            reg.register(ExportVariables, exportVariablesPluginHandler);
            reg.register(UpdateVariablesBatch, updateVariablesBatchPluginHandler);
            reg.register(
              StreamStatus,
              createStreamStatusPluginHandler({
                // Phase 5 stream_status returns "unknown session" via the
                // handler's null-fallback. A real provider lands when the
                // plugin owns a StreamRuntime in-process (Phase 6/7).
                getStatus: () => null,
              })
            );
          },
          registerServer: (reg) => {
            reg.register(
              ImportVariables,
              createImportVariablesServerHandler({ buildTransport: buildImportTransport })
            );
          },
        },
      ],
    });
    daemonRef = daemon;
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
