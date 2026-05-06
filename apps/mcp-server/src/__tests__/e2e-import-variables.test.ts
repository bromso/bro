import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BridgePluginRuntime } from "@repo/bridge-plugin/src/runtime";
import { StreamRuntime } from "@repo/bridge-plugin/src/streaming/stream-runtime";
import { FigmaFake } from "@repo/figma-adapter/testing";
import {
  createStreamStatusPluginHandler,
  ExportVariables,
  exportVariablesPluginHandler,
  ImportVariables,
  StreamStatus,
  UpdateVariablesBatch,
  updateVariablesBatchPluginHandler,
} from "@repo/tools-variables";
import { WebSocketClientTransport } from "@repo/transport";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";
import { createImportVariablesServerHandler } from "../streaming/import-handler";
import type { ChunkLoopTransport } from "../streaming/session-manager";

interface PipelineOpts {
  readonly atomic?: boolean;
  readonly injectFailureAt?: number;
}

interface ImportSummary {
  sessionId: string;
  total: number;
  applied: number;
  failed: number;
  failedDetails: unknown[];
}

/**
 * Unwrap the MCP CallToolResult — the SDK wraps a tool's structured
 * output as `content[0].text` (JSON-encoded). Parse it back into the
 * import_variables summary shape.
 */
function parseToolResult(r: unknown): ImportSummary {
  const content = (r as { content?: Array<{ type: string; text: string }> }).content;
  if (!content?.[0] || content[0].type !== "text") {
    throw new Error(`unexpected tool result shape: ${JSON.stringify(r)}`);
  }
  return JSON.parse(content[0].text) as ImportSummary;
}

interface Pipeline {
  readonly daemon: Daemon;
  readonly client: Client;
  readonly figma: FigmaFake;
  readonly streamRuntime: StreamRuntime;
  readonly close: () => Promise<void>;
}

async function setupPipeline(opts: PipelineOpts = {}): Promise<Pipeline> {
  const dir = await mkdtemp(join(tmpdir(), "mcp-import-"));
  const socketPath = join(dir, "daemon.sock");

  const figma = new FigmaFake();
  figma.__seedCollections([{ id: "vc1", name: "Brand", modes: [{ id: "m1", name: "Default" }] }]);

  // Inject a failure on the Nth createVariable call (atomic-rollback test).
  if (opts.injectFailureAt !== undefined) {
    let count = 0;
    const original = figma.createVariable.bind(figma);
    figma.createVariable = async (args) => {
      if (++count === opts.injectFailureAt) throw new Error("test-injected failure");
      return original(args);
    };
  }

  const daemon = await Daemon.start({
    socketPath,
    wsPort: 0,
    figma,
    version: "0.0.0",
    packs: [],
  });

  // Register the import_variables server handler post-construction so the
  // handler can close over the live `daemon.pluginCorrelator` (only set
  // after the WS handshake completes).
  const buildTransport = (): ChunkLoopTransport => {
    const correlator = daemon.pluginCorrelator;
    if (!correlator) throw new Error("plugin not connected");
    return {
      async send(env) {
        await daemon.wsBroadcast(env);
      },
      async request(env) {
        return correlator.request(env as never);
      },
    };
  };
  daemon.serverRegistry.register(
    ImportVariables,
    createImportVariablesServerHandler({ buildTransport })
  );

  // Plugin side: WS client + StreamRuntime + non-streaming handlers.
  const wsTransport = await WebSocketClientTransport.connect({
    url: `ws://127.0.0.1:${daemon.wsPort}`,
    WebSocketCtor: WebSocket as never,
  });
  const streamRuntime = new StreamRuntime({ figma });
  const runtime = new BridgePluginRuntime({
    transport: wsTransport,
    version: "0.0.0",
    figma,
    streamRuntime,
  });
  runtime.register(ExportVariables, exportVariablesPluginHandler);
  runtime.register(UpdateVariablesBatch, updateVariablesBatchPluginHandler);
  runtime.register(
    StreamStatus,
    createStreamStatusPluginHandler({ getStatus: (id) => streamRuntime.getStatus(id) })
  );
  runtime.start();

  // Wait for daemon handshake to complete.
  const start = Date.now();
  while (!daemon.isPluginConnected && Date.now() - start < 5000) {
    await new Promise((r) => setTimeout(r, 20));
  }
  if (!daemon.isPluginConnected) throw new Error("plugin handshake never completed");

  const shim = await createStdioShim({
    socketPath,
    sourceClientId: "e2e-import-shim",
    tools: [ImportVariables, ExportVariables, UpdateVariablesBatch, StreamStatus],
    mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
  });
  const [serverT, clientT] = InMemoryTransport.createLinkedPair();
  await shim.connectMcp(serverT);
  const client = new Client({ name: "e2e-import", version: "0.0.0" }, { capabilities: {} });
  await client.connect(clientT);

  return {
    daemon,
    client,
    figma,
    streamRuntime,
    async close() {
      await shim.stop();
      await wsTransport.close();
      await daemon.stop();
    },
  };
}

describe("e2e: import_variables", () => {
  it("imports 2k variables and reports the correct summary", async () => {
    const p = await setupPipeline();
    try {
      const items = Array.from({ length: 2000 }, (_, i) => ({
        name: `var-${i}`,
        collection: "Brand",
        resolvedType: "FLOAT" as const,
        valuesByMode: { Default: i },
      }));
      // The MCP SDK's default request timeout is 30s — insufficient for
      // 2k variables in CI. Override via the third argument to callTool.
      const r = await p.client.callTool(
        {
          name: "import_variables",
          arguments: { source: { kind: "inline", items }, atomic: false, chunkSize: 100 },
        },
        undefined,
        { timeout: 60_000 }
      );
      // The MCP CallToolResult wraps tool output in `content[0].text` as a
      // JSON string. Parse it to assert against the structured summary.
      const summary = parseToolResult(r);
      expect(summary.applied).toBe(2000);
      expect(summary.failed).toBe(0);
      const vars = await p.figma.getLocalVariablesAsync();
      expect(vars.length).toBe(2000);
    } finally {
      await p.close();
    }
  }, 90_000);

  it("atomic mode rolls back all created variables on first failure", async () => {
    // Inject failure on the 50th createVariable call: chunk size 25, so
    // chunk 0 (items 0–24) creates variables 1–25, chunk 1 (items 25–49)
    // tries to create 26–50 and fails at index 24 (50th call). Atomic
    // mode rolls back every variable created so far in the session.
    const p = await setupPipeline({ atomic: true, injectFailureAt: 50 });
    try {
      const items = Array.from({ length: 100 }, (_, i) => ({
        name: `atomic-${i}`,
        collection: "Brand",
        resolvedType: "FLOAT" as const,
        valuesByMode: { Default: 1 },
      }));
      await p.client.callTool(
        {
          name: "import_variables",
          arguments: { source: { kind: "inline", items }, atomic: true, chunkSize: 25 },
        },
        undefined,
        { timeout: 30_000 }
      );
      const vars = await p.figma.getLocalVariablesAsync();
      expect(vars.length).toBe(0);
    } finally {
      await p.close();
    }
  }, 60_000);

  it("10k variables import within the SDK timeout", async () => {
    const p = await setupPipeline();
    try {
      const items = Array.from({ length: 10_000 }, (_, i) => ({
        name: `large-${i}`,
        collection: "Brand",
        resolvedType: "FLOAT" as const,
        valuesByMode: { Default: i },
      }));
      const t0 = Date.now();
      const r = await p.client.callTool(
        {
          name: "import_variables",
          arguments: { source: { kind: "inline", items }, atomic: false, chunkSize: 200 },
        },
        undefined,
        { timeout: 180_000 }
      );
      const elapsed = Date.now() - t0;
      const summary = parseToolResult(r);
      expect(summary.applied).toBe(10_000);
      // Local target: <30s. CI is slower — the vitest test timeout
      // (240_000) is the hard cap; assert a generous bound here.
      expect(elapsed).toBeLessThan(180_000);
    } finally {
      await p.close();
    }
  }, 240_000);
});
