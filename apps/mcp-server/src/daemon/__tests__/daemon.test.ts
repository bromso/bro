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

  it("does not propagate broadcast errors when stopped mid-request", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-"));
    const socketPath = join(dir, "daemon.sock");

    let resolveSlow!: (value: { msg: string }) => void;
    const slowPromise = new Promise<{ msg: string }>((resolve) => {
      resolveSlow = resolve;
    });

    const Slow = defineTool({
      name: "slow",
      description: "blocks until external resolution",
      streaming: false,
      input: z.object({}).strict(),
      output: z.object({ msg: z.string() }),
    });

    const daemon = await Daemon.start({
      socketPath,
      figma: new FigmaFake(),
      packs: [
        {
          name: "slow-pack",
          tools: [Slow],
          registerServer: (reg) => reg.register(Slow, async () => slowPromise),
        },
      ],
    });

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    const correlator = new Correlator(client, { timeoutMs: 500 });

    // Issue the slow request, then stop the daemon while it's in flight.
    const reqPromise = correlator
      .request<{ msg: string }>({
        kind: "request",
        id: "slow-1",
        sourceClientId: "shim-A",
        tool: "slow",
        args: {},
      })
      .catch(() => {
        /* expected: timeout because daemon stopped before responding */
      });

    await daemon.stop();
    // Resolve the slow handler AFTER stop. The dispatch will succeed,
    // but the broadcast guard should short-circuit.
    resolveSlow({ msg: "ok" });
    await reqPromise;
    await client.close();

    // No unhandled rejection should bubble out — vitest will fail this
    // test if one does. The assertion is structural (test reaching here).
    expect(true).toBe(true);
  });
});
