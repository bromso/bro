import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
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
import { describe, expect, it } from "vitest";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";

const allTools = [ExtractStyles, ExtractComponents, ExtractLocalVariables, BridgeStatus];

const setupDaemonAndShim = async () => {
  const dir = await mkdtemp(join(tmpdir(), "mcp-e2e-"));
  const socketPath = join(dir, "daemon.sock");

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
  figma.__seedVariables([
    { id: "v1", name: "color/red", resolvedType: "COLOR", valuesByMode: { m1: "#f00" } },
  ]);

  const daemon = await Daemon.start({
    socketPath,
    wsPort: 0,
    version: "0.0.0",
    figma,
    packs: [
      {
        name: "tools-extract",
        tools: allTools,
        registerPlugin: (reg) => {
          reg.register(ExtractStyles, extractStylesPluginHandler);
          reg.register(ExtractComponents, extractComponentsPluginHandler);
          reg.register(ExtractLocalVariables, extractLocalVariablesPluginHandler);
        },
        registerServer: (reg) => {
          reg.register(
            BridgeStatus,
            createBridgeStatusServerHandler({
              getDaemonInfo: () => ({ pid: process.pid, version: "0.0.0", uptimeMs: 0 }),
              getPluginState: () => ({ connected: false }),
            })
          );
        },
      },
    ],
  });

  const shim = await createStdioShim({
    socketPath,
    sourceClientId: "e2e-shim",
    tools: allTools,
    mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
  });

  const [serverT, clientT] = InMemoryTransport.createLinkedPair();
  await shim.connectMcp(serverT);
  const client = new Client({ name: "e2e", version: "0.0.0" }, { capabilities: {} });
  await client.connect(clientT);

  return { client, daemon, shim };
};

describe("e2e: AI client → stdio shim → daemon → in-process plugin", () => {
  it("extract_styles returns seeded styles", async () => {
    const { client, daemon, shim } = await setupDaemonAndShim();
    const r = await client.callTool({ name: "extract_styles", arguments: {} });
    expect(JSON.stringify(r)).toContain("primary");
    expect(JSON.stringify(r)).toContain("body");
    expect(JSON.stringify(r)).toContain("shadow");
    await shim.stop();
    await daemon.stop();
  });

  it("extract_components returns seeded components", async () => {
    const { client, daemon, shim } = await setupDaemonAndShim();
    const r = await client.callTool({ name: "extract_components", arguments: {} });
    expect(JSON.stringify(r)).toContain("Button");
    expect(JSON.stringify(r)).toContain("btn");
    await shim.stop();
    await daemon.stop();
  });

  it("extract_local_variables returns seeded variables", async () => {
    const { client, daemon, shim } = await setupDaemonAndShim();
    const r = await client.callTool({ name: "extract_local_variables", arguments: {} });
    expect(JSON.stringify(r)).toContain("color/red");
    await shim.stop();
    await daemon.stop();
  });

  it("bridge_status reports daemon state", async () => {
    const { client, daemon, shim } = await setupDaemonAndShim();
    const r = await client.callTool({ name: "bridge_status", arguments: {} });
    expect(JSON.stringify(r)).toContain('\\"connected\\":false');
    await shim.stop();
    await daemon.stop();
  });
});
