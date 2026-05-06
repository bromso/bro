import { FigmaFake } from "@repo/figma-adapter/testing";
import { defineTool } from "@repo/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PluginRegistryImpl } from "../plugin-registry";

const Ping = defineTool({
  name: "ping",
  description: "ping",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({ ok: z.literal(true) }),
});

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const ctx = () => ({ logger: noopLogger, figma: new FigmaFake() });

describe("PluginRegistryImpl", () => {
  it("dispatches a registered tool", async () => {
    const reg = new PluginRegistryImpl();
    reg.register(Ping, async () => ({ ok: true as const }));
    const result = await reg.dispatch("ping", {}, ctx());
    expect(result).toEqual({ ok: true });
  });

  it("validates input via the tool's Zod schema", async () => {
    const reg = new PluginRegistryImpl();
    reg.register(Ping, async () => ({ ok: true as const }));
    await expect(reg.dispatch("ping", { extra: "field" }, ctx())).rejects.toThrow(/input/i);
  });

  it("rejects an unknown tool name with E_PROTOCOL_UNKNOWN_TOOL", async () => {
    const reg = new PluginRegistryImpl();
    await expect(reg.dispatch("nope", {}, ctx())).rejects.toMatchObject({
      code: "E_PROTOCOL_UNKNOWN_TOOL",
    });
  });

  it("validates the handler's output via the tool's Zod schema", async () => {
    const reg = new PluginRegistryImpl();
    reg.register(Ping, async () => ({ ok: false }) as unknown as { ok: true });
    await expect(reg.dispatch("ping", {}, ctx())).rejects.toThrow(/output/i);
  });

  it("`has` reports whether a tool is registered", () => {
    const reg = new PluginRegistryImpl();
    expect(reg.has("ping")).toBe(false);
    reg.register(Ping, async () => ({ ok: true as const }));
    expect(reg.has("ping")).toBe(true);
  });
});
