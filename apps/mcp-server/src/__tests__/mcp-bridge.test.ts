import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ProgressNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { defineTool, ErrorCode } from "@repo/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { registerToolsWithMcp } from "../mcp-bridge";

const Hello = defineTool({
  name: "hello",
  description: "say hi",
  streaming: false,
  input: z.object({ name: z.string() }),
  output: z.object({ greeting: z.string() }),
});

describe("registerToolsWithMcp", () => {
  it("registers tools and routes calls through the resolver", async () => {
    const server = new Server({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
    registerToolsWithMcp({
      mcpServer: server,
      tools: [Hello],
      resolve: async (_name, args) => ({
        greeting: `hi ${(args as { name: string }).name}`,
      }),
    });
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientT);

    const result = await client.callTool({
      name: "hello",
      arguments: { name: "Daisy" },
    });
    expect(result.isError).not.toBe(true);
    // The MCP SDK wraps `content` for outputs — verify the structured payload
    // ends up in the response.
    expect(JSON.stringify(result)).toContain("Daisy");
  });

  it("translates resolver errors into MCP tool-result errors with isError: true", async () => {
    const server = new Server({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
    registerToolsWithMcp({
      mcpServer: server,
      tools: [Hello],
      resolve: async () => {
        throw Object.assign(new Error("node not found"), {
          code: ErrorCode.E_FIGMA_NODE_NOT_FOUND,
          category: "figma",
        });
      },
    });
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientT);

    const result = await client.callTool({
      name: "hello",
      arguments: { name: "x" },
    });
    expect(result.isError).toBe(true);
  });

  it("listTools returns the registered tool descriptors", async () => {
    const server = new Server({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
    registerToolsWithMcp({
      mcpServer: server,
      tools: [Hello],
      resolve: async () => ({ greeting: "noop" }),
    });
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientT);

    const result = await client.listTools();
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({ name: "hello", description: "say hi" });
    expect(result.tools[0].inputSchema).toBeDefined();
  });

  it("returns isError for an unknown tool name", async () => {
    const server = new Server({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
    registerToolsWithMcp({
      mcpServer: server,
      tools: [Hello],
      resolve: async () => ({ greeting: "noop" }),
    });
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientT);

    const result = await client.callTool({ name: "ghost", arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("unknown tool");
  });

  it("emits notifications/progress when the resolver fires its emitProgress callback", async () => {
    const server = new Server({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
    registerToolsWithMcp({
      mcpServer: server,
      tools: [Hello],
      resolve: async (_name, args, ctx) => {
        ctx.emitProgress({ progress: 1, total: 3 });
        ctx.emitProgress({ progress: 2, total: 3 });
        ctx.emitProgress({ progress: 3, total: 3 });
        return { greeting: `hi ${(args as { name: string }).name}` };
      },
    });
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientT);

    const progresses: Array<{ progress: number; total?: number }> = [];
    client.setNotificationHandler(ProgressNotificationSchema, async (notification) => {
      progresses.push({
        progress: notification.params.progress,
        total: notification.params.total,
      });
    });

    await client.callTool({
      name: "hello",
      arguments: { name: "x" },
      _meta: { progressToken: "tok-1" },
    });

    // Notifications are async — give them a tick.
    await new Promise((r) => setTimeout(r, 50));
    expect(progresses).toHaveLength(3);
    expect(progresses[0]).toMatchObject({ progress: 1, total: 3 });
    expect(progresses[2]).toMatchObject({ progress: 3, total: 3 });
  });

  it("rethrows non-tool-level errors as JSON-RPC errors (no isError envelope)", async () => {
    const server = new Server({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
    registerToolsWithMcp({
      mcpServer: server,
      tools: [Hello],
      resolve: async () => {
        // E_TRANSPORT_* lives in the "transport" category, which is NOT
        // in TOOL_LEVEL_CATEGORIES — it should bubble as a JSON-RPC error.
        throw Object.assign(new Error("ipc died"), {
          code: ErrorCode.E_TRANSPORT_TIMEOUT,
          category: "transport",
        });
      },
    });
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientT);

    await expect(client.callTool({ name: "hello", arguments: { name: "x" } })).rejects.toThrow();
  });
});
