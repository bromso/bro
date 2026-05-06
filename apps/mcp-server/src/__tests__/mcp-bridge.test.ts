import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
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
});
