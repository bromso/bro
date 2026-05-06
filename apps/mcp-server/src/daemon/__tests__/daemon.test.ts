import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FigmaFake } from "@repo/figma-adapter/testing";
import type { RequestEnvelope } from "@repo/protocol";
import { defineTool } from "@repo/protocol";
import { Correlator, UnixSocketClientTransport } from "@repo/transport";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Daemon } from "../daemon";

const Echo = defineTool({
  name: "echo",
  description: "echo",
  streaming: false,
  input: z.object({ msg: z.string() }),
  output: z.object({ msg: z.string() }),
});

describe("Daemon", () => {
  it("dispatches a server tool call from a connected IPC client", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
      figma: new FigmaFake(),
      packs: [
        {
          name: "echo-pack",
          tools: [Echo],
          registerServer: (reg) => reg.register(Echo, async (args) => ({ msg: args.msg })),
        },
      ],
    });

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    const correlator = new Correlator(client);

    const result = await correlator.request<{ msg: string }>({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "echo",
      args: { msg: "hi" },
    });
    expect(result).toEqual({ msg: "hi" });

    await client.close();
    await daemon.stop();
  });

  it("returns an error envelope for an unknown tool", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
      figma: new FigmaFake(),
      packs: [],
    });

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    const correlator = new Correlator(client);

    await expect(
      correlator.request({
        kind: "request",
        id: "r1",
        sourceClientId: "shim-A",
        tool: "ghost",
        args: {},
      } as RequestEnvelope)
    ).rejects.toMatchObject({ code: "E_PROTOCOL_UNKNOWN_TOOL" });

    await client.close();
    await daemon.stop();
  });

  it("dispatches a plugin tool call against the daemon's FigmaFake", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-"));
    const socketPath = join(dir, "daemon.sock");

    const PluginEcho = defineTool({
      name: "plugin_echo",
      description: "uses figma adapter",
      streaming: false,
      input: z.object({}).strict(),
      output: z.object({ editorType: z.string() }),
    });

    const figma = new FigmaFake();
    figma.__setEditorType("figjam");

    const daemon = await Daemon.start({
      socketPath,
      figma,
      packs: [
        {
          name: "plugin-pack",
          tools: [PluginEcho],
          registerPlugin: (reg) =>
            reg.register(PluginEcho, async (_args, { figma: f }) => ({ editorType: f.editorType })),
        },
      ],
    });

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    const correlator = new Correlator(client);

    const result = await correlator.request<{ editorType: string }>({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "plugin_echo",
      args: {},
    });
    expect(result).toEqual({ editorType: "figjam" });

    await client.close();
    await daemon.stop();
  });

  it("multiplexes multiple clients with sourceClientId routing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
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

    const a = new Correlator(await UnixSocketClientTransport.connect({ path: socketPath }));
    const b = new Correlator(await UnixSocketClientTransport.connect({ path: socketPath }));

    const [ra, rb] = await Promise.all([
      a.request<{ msg: string }>({
        kind: "request",
        id: "ra",
        sourceClientId: "A",
        tool: "echo",
        args: { msg: "from-a" },
      }),
      b.request<{ msg: string }>({
        kind: "request",
        id: "rb",
        sourceClientId: "B",
        tool: "echo",
        args: { msg: "from-b" },
      }),
    ]);

    expect(ra.msg).toBe("FROM-A");
    expect(rb.msg).toBe("FROM-B");

    await daemon.stop();
  });
});
