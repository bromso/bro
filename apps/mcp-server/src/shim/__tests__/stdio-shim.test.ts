import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import { defineTool } from "@repo/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Daemon } from "../../daemon/daemon";
import { createStdioShim } from "../stdio-shim";

const Echo = defineTool({
  name: "echo",
  description: "echo",
  streaming: false,
  input: z.object({ msg: z.string() }),
  output: z.object({ msg: z.string() }),
});

describe("createStdioShim", () => {
  it("forwards an MCP tool call to the daemon and returns the result", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-shim-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0,
      version: "0.0.0",
      figma: new FigmaFake(),
      packs: [
        {
          name: "echo",
          tools: [Echo],
          registerServer: (reg) =>
            reg.register(Echo, async (args) => ({ msg: args.msg.toUpperCase() })),
        },
      ],
    });

    const shim = await createStdioShim({
      socketPath,
      sourceClientId: "test-shim",
      tools: [Echo],
      mcpServerInfo: { name: "test", version: "0.0.0" },
    });

    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await shim.connectMcp(serverT);
    const client = new Client({ name: "tester", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientT);

    const result = await client.callTool({ name: "echo", arguments: { msg: "hello" } });
    expect(JSON.stringify(result)).toContain("HELLO");

    await shim.stop();
    await daemon.stop();
  });
});
