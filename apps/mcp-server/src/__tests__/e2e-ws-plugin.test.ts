import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BridgePluginRuntime } from "@repo/bridge-plugin/src/runtime";
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
import { WebSocketClientTransport } from "@repo/transport";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";

describe("e2e: AI client → stdio shim → daemon (WS) → in-memory plugin", () => {
  it("extract_styles flows through the WS plugin path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-e2e-ws-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0,
      figma: new FigmaFake(), // unused — WS plugin overrides
      version: "0.0.0",
      packs: [
        {
          name: "tools-extract-server-only",
          tools: [BridgeStatus, ExtractStyles, ExtractComponents, ExtractLocalVariables],
          registerServer: (reg) =>
            reg.register(
              BridgeStatus,
              createBridgeStatusServerHandler({
                getDaemonInfo: () => ({ pid: process.pid, version: "0.0.0", uptimeMs: 0 }),
                getPluginState: () => ({ connected: daemon.isPluginConnected }),
              })
            ),
          // No registerPlugin — the WS plugin handles them.
        },
      ],
    });

    // The "plugin": connect via WS, run handshake, register handlers.
    const figma = new FigmaFake();
    figma.__seedPaintStyles([{ id: "p1", name: "primary", type: "PAINT", paints: [] }]);
    figma.__seedTextStyles([
      {
        id: "t1",
        name: "body",
        type: "TEXT",
        fontName: { family: "Inter", style: "Regular" },
        fontSize: 14,
      },
    ]);
    figma.__seedEffectStyles([{ id: "e1", name: "shadow", type: "EFFECT", effects: [] }]);
    figma.__seedComponents([{ id: "c1", name: "Button", key: "btn" }]);

    const wsTransport = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${daemon.wsPort}`,
      WebSocketCtor: WebSocket as never,
    });
    const runtime = new BridgePluginRuntime({
      transport: wsTransport,
      version: "0.0.0",
      figma,
    });
    runtime.register(ExtractStyles, extractStylesPluginHandler);
    runtime.register(ExtractComponents, extractComponentsPluginHandler);
    runtime.register(ExtractLocalVariables, extractLocalVariablesPluginHandler);
    runtime.start();

    // Wait for handshake to complete daemon-side.
    const start = Date.now();
    while (!daemon.isPluginConnected && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(daemon.isPluginConnected).toBe(true);

    // Drive an MCP tool call through the stdio shim.
    const shim = await createStdioShim({
      socketPath,
      sourceClientId: "e2e-shim",
      tools: [BridgeStatus, ExtractStyles, ExtractComponents, ExtractLocalVariables],
      mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
    });
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await shim.connectMcp(serverT);
    const client = new Client({ name: "e2e-ws", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientT);

    const r = await client.callTool({ name: "extract_styles", arguments: {} });
    expect(JSON.stringify(r)).toContain("primary");
    expect(JSON.stringify(r)).toContain("body");

    await shim.stop();
    await wsTransport.close();
    await daemon.stop();
  });
});
