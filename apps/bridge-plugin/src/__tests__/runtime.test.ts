import { FigmaFake } from "@repo/figma-adapter/testing";
import { defineTool } from "@repo/protocol";
import { createInMemoryTransportPair } from "@repo/transport/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BridgePluginRuntime } from "../runtime";

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
});
