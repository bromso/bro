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
      wsPort: 0,
      version: "0.0.0",
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
      wsPort: 0,
      version: "0.0.0",
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
      wsPort: 0,
      version: "0.0.0",
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

  it("exposes pid and a non-negative uptimeMs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0,
      version: "0.0.0",
      figma: new FigmaFake(),
      packs: [],
    });

    expect(daemon.pid).toBe(process.pid);
    expect(daemon.uptimeMs).toBeGreaterThanOrEqual(0);

    await daemon.stop();
  });

  it("wraps non-RegistryError handler throws as E_FIGMA_UNKNOWN", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-"));
    const socketPath = join(dir, "daemon.sock");

    const Boom = defineTool({
      name: "boom",
      description: "throws a plain Error",
      streaming: false,
      input: z.object({}).strict(),
      output: z.object({ ok: z.boolean() }),
    });

    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0,
      version: "0.0.0",
      figma: new FigmaFake(),
      packs: [
        {
          name: "boom-pack",
          tools: [Boom],
          // Throw a non-RegistryError to exercise the fallback envelope branch.
          registerServer: (reg) =>
            reg.register(Boom, async () => {
              throw new Error("kaboom");
            }),
        },
      ],
    });

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    const correlator = new Correlator(client);

    await expect(
      correlator.request({
        kind: "request",
        id: "r1",
        sourceClientId: "shim-A",
        tool: "boom",
        args: {},
      } as RequestEnvelope)
    ).rejects.toMatchObject({ code: "E_FIGMA_UNKNOWN", message: "kaboom" });

    await client.close();
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
      wsPort: 0,
      version: "0.0.0",
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

describe("Daemon WS server", () => {
  it("binds a WebSocket server on a configurable port", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-ws-"));
    const socketPath = join(dir, "daemon.sock");

    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0, // ephemeral
      version: "0.0.0",
      figma: new FigmaFake(),
      packs: [],
    });
    expect(daemon.wsPort).toBeGreaterThan(0);
    await daemon.stop();
  });

  it("stop() releases the WS port", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-daemon-ws-stop-"));
    const socketPath = join(dir, "daemon.sock");
    const daemon = await Daemon.start({
      socketPath,
      wsPort: 0,
      version: "0.0.0",
      figma: new FigmaFake(),
      packs: [],
    });
    const port = daemon.wsPort;
    await daemon.stop();
    // Try to listen on the same port — should succeed because daemon released it.
    const { WebSocketServer } = await import("ws");
    const wss = new WebSocketServer({ port, host: "127.0.0.1" });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
});

const waitFor = <T>(fn: () => T | undefined, timeoutMs = 5000): Promise<T> =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const v = fn();
      if (v !== undefined) return resolve(v);
      if (Date.now() - start > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, 10);
    };
    tick();
  });

describe("Daemon plugin handshake", () => {
  it("completes handshake with a matching protocolVersion", { timeout: 15000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-handshake-"));
    const daemon = await Daemon.start({
      socketPath: join(dir, "daemon.sock"),
      wsPort: 0,
      figma: new FigmaFake(),
      packs: [],
      version: "0.0.0",
    });

    const { WebSocketClientTransport } = await import("@repo/transport");
    const { WebSocket } = await import("ws");
    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${daemon.wsPort}`,
      WebSocketCtor: WebSocket as never,
    });

    // Daemon sends HandshakeRequestEnvelope on connect; client responds.
    let received: unknown;
    client.onMessage((env) => {
      received = env;
    });
    await waitFor(() => (received !== undefined ? received : undefined));
    expect((received as { kind: string }).kind).toBe("handshake-request");

    await client.send({
      kind: "handshake-response",
      clientVersion: "0.0.0",
      protocolVersion: 1,
      accepted: true,
    } as never);

    await waitFor(() => (daemon.isPluginConnected ? true : undefined));
    expect(daemon.isPluginConnected).toBe(true);
    expect(daemon.pluginVersion).toBe("0.0.0");

    await client.close();
    await daemon.stop();
  });

  it("rejects a client with mismatched protocolVersion", { timeout: 15000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-handshake-mismatch-"));
    const daemon = await Daemon.start({
      socketPath: join(dir, "daemon.sock"),
      wsPort: 0,
      figma: new FigmaFake(),
      packs: [],
      version: "0.0.0",
    });

    const { WebSocketClientTransport } = await import("@repo/transport");
    const { WebSocket } = await import("ws");
    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${daemon.wsPort}`,
      WebSocketCtor: WebSocket as never,
    });

    await client.send({
      kind: "handshake-response",
      clientVersion: "0.0.0",
      protocolVersion: 999, // bogus
      accepted: true,
    } as never);

    let disconnected = false;
    client.onDisconnect(() => {
      disconnected = true;
    });
    await waitFor(() => (disconnected ? true : undefined));
    expect(daemon.isPluginConnected).toBe(false);

    await daemon.stop();
  });

  it("forwards a plugin-registry tool over WS when a plugin is connected", {
    timeout: 15000,
  }, async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-route-ws-"));
    const PluginPing = defineTool({
      name: "plugin_ping",
      description: "ping over the WS plugin",
      streaming: false,
      input: z.object({}).strict(),
      output: z.object({ ok: z.literal(true) }),
    });

    const daemon = await Daemon.start({
      socketPath: join(dir, "daemon.sock"),
      wsPort: 0,
      figma: new FigmaFake(),
      version: "0.0.0",
      packs: [
        {
          name: "ping-pack",
          tools: [PluginPing],
          registerPlugin: () => {
            /* intentionally empty — proves WS path is used, not in-process */
          },
        },
      ],
    });

    const { WebSocketClientTransport } = await import("@repo/transport");
    const { WebSocket } = await import("ws");
    const pluginTransport = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${daemon.wsPort}`,
      WebSocketCtor: WebSocket as never,
    });

    // Plugin side: respond to handshake AND to plugin tool requests.
    pluginTransport.onMessage(async (env) => {
      if (env.kind === "handshake-request") {
        await pluginTransport.send({
          kind: "handshake-response",
          clientVersion: "0.0.0",
          protocolVersion: 1,
          accepted: true,
        } as never);
      }
      if (env.kind === "request" && env.tool === "plugin_ping") {
        await pluginTransport.send({
          kind: "response",
          id: env.id,
          ok: true,
          result: { ok: true },
        } as never);
      }
    });

    await waitFor(() => (daemon.isPluginConnected ? true : undefined));

    // IPC client (a stand-in for a stdio shim) issues the request.
    const ipcClient = await UnixSocketClientTransport.connect({ path: join(dir, "daemon.sock") });
    const correlator = new Correlator(ipcClient);
    const result = await correlator.request<{ ok: true }>({
      kind: "request",
      id: "shim-r1",
      sourceClientId: "shim-A",
      tool: "plugin_ping",
      args: {},
    });
    expect(result).toEqual({ ok: true });

    await ipcClient.close();
    await pluginTransport.close();
    await daemon.stop();
  });
});
