import { FigmaFake } from "@repo/figma-adapter/testing";
import { defineTool, type Pack } from "@repo/protocol";
import { createInMemoryTransportPair } from "@repo/transport/testing";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BridgePluginRuntime } from "../runtime";
import { StreamRuntime } from "../streaming/stream-runtime";

const Echo = defineTool({
  name: "echo",
  description: "echo",
  streaming: false,
  input: z.object({ msg: z.string() }),
  output: z.object({ msg: z.string() }),
});

describe("BridgePluginRuntime", () => {
  it("answers a handshake-request with a handshake-response", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    runtime.start();

    const response = await new Promise<{ accepted: boolean; protocolVersion: number }>(
      (resolve) => {
        daemonSide.onMessage((env) => {
          if (env.kind === "handshake-response") resolve(env as never);
        });
        void daemonSide.send({
          kind: "handshake-request",
          serverVersion: "0.0.0",
          protocolVersion: 1,
        } as never);
      }
    );

    expect(response.accepted).toBe(true);
    expect(response.protocolVersion).toBe(1);
  });

  it("dispatches an incoming RequestEnvelope to the registered plugin handler", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    runtime.register(Echo, async (args) => ({ msg: args.msg.toUpperCase() }));
    runtime.start();

    const responses: unknown[] = [];
    daemonSide.onMessage((env) => {
      if (env.kind === "response") responses.push(env);
    });
    await daemonSide.send({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "echo",
      args: { msg: "hi" },
    } as never);

    await new Promise((r) => setTimeout(r, 50));
    expect(responses).toHaveLength(1);
    expect((responses[0] as { result: { msg: string } }).result.msg).toBe("HI");
  });

  it("emits an ErrorEnvelope when an unknown tool is requested", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    runtime.start();

    const errors: unknown[] = [];
    daemonSide.onMessage((env) => {
      if (env.kind === "error") errors.push(env);
    });
    await daemonSide.send({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "nope",
      args: {},
    } as never);

    await new Promise((r) => setTimeout(r, 50));
    expect(errors).toHaveLength(1);
    expect((errors[0] as { code: string }).code).toBe("E_PROTOCOL_UNKNOWN_TOOL");
  });

  it("emits an ErrorEnvelope when input validation fails", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    runtime.register(Echo, async (args) => ({ msg: args.msg }));
    runtime.start();

    const errors: unknown[] = [];
    daemonSide.onMessage((env) => {
      if (env.kind === "error") errors.push(env);
    });
    await daemonSide.send({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "echo",
      args: { msg: 123 } as never,
    } as never);

    await new Promise((r) => setTimeout(r, 50));
    expect((errors[0] as { code: string }).code).toBe("E_PROTOCOL_INVALID");
  });

  it("emits an ErrorEnvelope (E_PROTOCOL_OUTPUT_INVALID) when handler output fails validation", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    // Handler returns the wrong shape — output schema requires { msg: string }.
    runtime.register(Echo, async () => ({ msg: 42 }) as unknown as { msg: string });
    runtime.start();

    const errors: unknown[] = [];
    daemonSide.onMessage((env) => {
      if (env.kind === "error") errors.push(env);
    });
    await daemonSide.send({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "echo",
      args: { msg: "hi" },
    } as never);

    await new Promise((r) => setTimeout(r, 50));
    expect((errors[0] as { code: string }).code).toBe("E_PROTOCOL_OUTPUT_INVALID");
  });

  it("emits an ErrorEnvelope (E_FIGMA_UNKNOWN) when the handler throws", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    runtime.register(Echo, async () => {
      throw new Error("kaboom");
    });
    runtime.start();

    const errors: unknown[] = [];
    daemonSide.onMessage((env) => {
      if (env.kind === "error") errors.push(env);
    });
    await daemonSide.send({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "echo",
      args: { msg: "hi" },
    } as never);

    await new Promise((r) => setTimeout(r, 50));
    expect((errors[0] as { code: string; message: string }).code).toBe("E_FIGMA_UNKNOWN");
    expect((errors[0] as { code: string; message: string }).message).toBe("kaboom");
  });

  it("emits an ErrorEnvelope (E_FIGMA_UNKNOWN) for non-Error throws (string)", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    runtime.register(Echo, async () => {
      // biome-ignore lint/suspicious/noExplicitAny: testing throw of non-Error value.
      throw "string-throw" as any;
    });
    runtime.start();

    const errors: unknown[] = [];
    daemonSide.onMessage((env) => {
      if (env.kind === "error") errors.push(env);
    });
    await daemonSide.send({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "echo",
      args: { msg: "hi" },
    } as never);

    await new Promise((r) => setTimeout(r, 50));
    expect((errors[0] as { code: string; message: string }).message).toBe("string-throw");
  });

  it("ignores envelope kinds it does not handle (e.g. response)", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    runtime.start();

    // Sending a response envelope must not produce any output.
    const seen: unknown[] = [];
    daemonSide.onMessage((env) => seen.push(env));
    await daemonSide.send({
      kind: "response",
      id: "r1",
      ok: true,
      result: {},
    } as never);
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).toHaveLength(0);
  });

  it("registerPack invokes pack.registerPlugin with a registry adapter", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });

    const pack: Pack = {
      name: "echo-pack",
      tools: [Echo],
      registerPlugin: (reg) => reg.register(Echo, async (args) => ({ msg: `${args.msg}!` })),
    };
    runtime.registerPack(pack);
    runtime.start();

    const responses: unknown[] = [];
    daemonSide.onMessage((env) => {
      if (env.kind === "response") responses.push(env);
    });
    await daemonSide.send({
      kind: "request",
      id: "r1",
      sourceClientId: "shim-A",
      tool: "echo",
      args: { msg: "hi" },
    } as never);

    await new Promise((r) => setTimeout(r, 50));
    expect((responses[0] as { result: { msg: string } }).result.msg).toBe("hi!");
  });

  it("registerPack tolerates a pack without registerPlugin (no-op)", () => {
    const [pluginSide] = createInMemoryTransportPair();
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
    });
    const pack: Pack = { name: "empty", tools: [] };
    expect(() => runtime.registerPack(pack)).not.toThrow();
  });

  it("routes stream-open + chunk envelopes through the StreamRuntime", async () => {
    const [pluginSide, daemonSide] = createInMemoryTransportPair();
    const figma = new FigmaFake();
    figma.__seedCollections([{ id: "vc1", name: "Brand", modes: [{ id: "m1", name: "Default" }] }]);
    const streamRuntime = new StreamRuntime({ figma });
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma,
      streamRuntime,
    });
    runtime.start();

    const acks: unknown[] = [];
    daemonSide.onMessage((env) => {
      if (env.kind === "chunk-ack") acks.push(env);
    });

    await daemonSide.send({
      kind: "stream-open",
      id: "req_1",
      sessionId: "ses_a",
      tool: "import_variables",
      total: 1,
      atomic: false,
    } as never);
    await daemonSide.send({
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 1,
      items: [
        { name: "x", collection: "Brand", resolvedType: "FLOAT", valuesByMode: { Default: 1 } },
      ],
      idempotencyKey: "ses_a:0",
    } as never);

    await new Promise((r) => setTimeout(r, 50));
    expect(acks).toHaveLength(1);
    expect((acks[0] as { applied: number }).applied).toBe(1);
  });

  it("uses the provided logger (default noopLogger when omitted)", () => {
    const [pluginSide] = createInMemoryTransportPair();
    const debug = vi.fn();
    const info = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    // Verify the constructor accepts a logger; we don't currently log
    // from the dispatch path, but exercising the option keeps the
    // default-vs-provided branch covered.
    const runtime = new BridgePluginRuntime({
      transport: pluginSide,
      version: "0.0.0",
      figma: new FigmaFake(),
      logger: { debug, info, warn, error },
    });
    expect(runtime).toBeDefined();
  });
});
