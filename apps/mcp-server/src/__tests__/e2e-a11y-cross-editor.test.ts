import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import { AuditContrast, auditContrastPluginHandler } from "@repo/tools-a11y";
import { describe, expect, it } from "vitest";
import { Daemon } from "../daemon/daemon";
import { createStdioShim } from "../shim/stdio-shim";

async function runAuditOn(editorType: "figma" | "figjam"): Promise<unknown> {
  const dir = await mkdtemp(join(tmpdir(), `mcp-a11y-${editorType}-`));
  const socketPath = join(dir, "daemon.sock");

  const figma = new FigmaFake({ editorType });
  // Seed a minimal text-on-frame composition so the audit has data.
  const frame = await figma.createFrame({ width: 200, height: 100 });
  await figma.setNodeFill({
    nodeId: frame.id,
    paint: { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 },
  });
  const text = await figma.createTextInFrame({
    parentId: frame.id,
    content: "Hello",
  });
  await figma.setNodeFill({
    nodeId: text.id,
    paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 },
  });

  const daemon = await Daemon.start({
    socketPath,
    wsPort: 0,
    version: "0.0.0",
    figma,
    packs: [
      {
        name: "tools-a11y",
        tools: [AuditContrast],
        registerPlugin: (reg) => {
          reg.register(AuditContrast, auditContrastPluginHandler);
        },
      },
    ],
  });

  try {
    const shim = await createStdioShim({
      socketPath,
      sourceClientId: `shim-${editorType}-test`,
      tools: [AuditContrast],
      mcpServerInfo: { name: "figma-mcp", version: "0.0.0" },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await shim.connectMcp(serverTransport);
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: "audit_contrast",
      arguments: { nodeId: text.id },
    });

    return result;
  } finally {
    await daemon.stop();
  }
}

describe("a11y tools — cross-editor", () => {
  it("audit_contrast succeeds on editorType: 'figma'", async () => {
    const result = (await runAuditOn("figma")) as {
      isError?: boolean;
      content?: ReadonlyArray<{ type: string; text?: string }>;
    };
    expect(result.isError).toBeFalsy();
    const text =
      result.content && result.content[0]?.type === "text" ? (result.content[0].text ?? "") : "";
    // 21:1 contrast for black on white
    expect(text).toMatch(/21|"ratio":\s?2[01]/);
  });

  it("audit_contrast succeeds on editorType: 'figjam' (no editor-type guard)", async () => {
    const result = (await runAuditOn("figjam")) as {
      isError?: boolean;
    };
    // The KEY assertion: no E_FIGMA_EDITOR_TYPE_MISMATCH on FigJam.
    expect(result.isError).toBeFalsy();
  });
});
