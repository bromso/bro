import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import { FigmaApiFake } from "@repo/figma-api-client";
import { createPostFileCommentServerHandler, PostFileComment } from "@repo/tools-rest";
import { describe, expect, it } from "vitest";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";

describe("REST write-tool gate", () => {
  it("returns E_WRITE_TOOLS_DISABLED when --enable-write-tools is off", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-rest-"));
    const socketPath = join(dir, "daemon.sock");
    const figmaApi = new FigmaApiFake();
    figmaApi.__seedFile("ABC", {
      name: "F",
      lastModified: "x",
      version: "1",
      role: "owner",
      editorType: "figma",
      document: { id: "0:0", type: "DOCUMENT", children: [] },
    });

    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0,
      version: "0.0.0",
      figma: new FigmaFake(),
      figmaApi,
      packs: [
        {
          name: "tools-rest",
          tools: [PostFileComment],
          registerServer: (reg) => {
            reg.register(
              PostFileComment,
              createPostFileCommentServerHandler({ figmaApi, enableWriteTools: false })
            );
          },
        },
      ],
    });

    try {
      const shim = await createStdioShim({
        socketPath,
        sourceClientId: "shim-rest-test",
        tools: [PostFileComment],
        mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
      });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await shim.connectMcp(serverTransport);
      const client = new Client({ name: "test-client", version: "0.0.0" });
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "post_file_comment",
        arguments: { fileKey: "ABC", message: "hi" },
      });

      expect(result.isError).toBe(true);
      const text =
        Array.isArray(result.content) && result.content[0]?.type === "text"
          ? (result.content[0] as { text: string }).text
          : JSON.stringify(result);
      expect(text).toContain("E_WRITE_TOOLS_DISABLED");
      expect(text).toContain("post_file_comment");
    } finally {
      await daemon.stop();
    }
  });
});
