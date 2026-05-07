import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import { CreateSlide, createSlidePluginHandler } from "@repo/tools-slides";
import { describe, expect, it } from "vitest";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";

describe("Slides editor-type mismatch", () => {
  it("returns E_FIGMA_EDITOR_TYPE_MISMATCH when called on a Figma editor", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-sl-"));
    const socketPath = join(dir, "daemon.sock");

    const figma = new FigmaFake({ editorType: "figma" });

    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0,
      version: "0.0.0",
      figma,
      packs: [
        {
          name: "tools-slides",
          tools: [CreateSlide],
          registerPlugin: (reg) => {
            reg.register(CreateSlide, createSlidePluginHandler);
          },
        },
      ],
    });

    try {
      const shim = await createStdioShim({
        socketPath,
        sourceClientId: "shim-sl-test",
        tools: [CreateSlide],
        mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
      });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await shim.connectMcp(serverTransport);
      const client = new Client({ name: "test-client", version: "0.0.0" });
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "create_slide",
        arguments: {},
      });

      // The shim returns the handler's error wrapped as a tool-call result
      // with isError: true. The structured content (or text content) carries
      // the discriminator string verbatim.
      expect(result.isError).toBe(true);
      const text =
        Array.isArray(result.content) && result.content[0]?.type === "text"
          ? (result.content[0] as { text: string }).text
          : JSON.stringify(result);
      expect(text).toContain("E_FIGMA_EDITOR_TYPE_MISMATCH");
      expect(text).toContain("create_slide");
    } finally {
      await daemon.stop();
    }
  });
});
