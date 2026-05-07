import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import { createSectionPluginHandler, createStickyPluginHandler } from "../plugin-handlers";

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const figJamCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "figjam" }),
});
const figmaCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "figma" }),
});

describe("createStickyPluginHandler", () => {
  it("creates a sticky on a FigJam editor", async () => {
    const ctx = figJamCtx();
    const out = await createStickyPluginHandler({ content: "hello" }, ctx);
    expect(out.type).toBe("STICKY");
    expect(out.nodeId).toMatch(/^stk/);
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { content?: string }).content).toBe("hello");
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(createStickyPluginHandler({ content: "hello" }, figmaCtx())).rejects.toThrow(
      /E_FIGMA_EDITOR_TYPE_MISMATCH/
    );
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Slides editor", async () => {
    const ctx = {
      logger: noopLogger,
      figma: new FigmaFake({ editorType: "slides" }),
    };
    await expect(createStickyPluginHandler({ content: "hi" }, ctx)).rejects.toThrow(
      /E_FIGMA_EDITOR_TYPE_MISMATCH/
    );
  });
});

describe("createSectionPluginHandler", () => {
  it("creates a section on a FigJam editor", async () => {
    const ctx = figJamCtx();
    const out = await createSectionPluginHandler(
      { name: "Goals", x: 0, y: 0, width: 400, height: 300 },
      ctx
    );
    expect(out.type).toBe("SECTION");
    expect(out.nodeId).toMatch(/^sec/);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createSectionPluginHandler({ name: "Goals", x: 0, y: 0, width: 400, height: 300 }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});
