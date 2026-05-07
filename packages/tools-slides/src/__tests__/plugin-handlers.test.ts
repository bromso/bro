import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  createSlidePluginHandler,
  createSlideRowPluginHandler,
  setSlideNamePluginHandler,
  setSlideSkippedPluginHandler,
} from "../plugin-handlers";

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const slidesCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "slides" }),
});
const figmaCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "figma" }),
});
const figJamCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "figjam" }),
});

describe("createSlidePluginHandler", () => {
  it("creates a slide on a Slides editor", async () => {
    const ctx = slidesCtx();
    const out = await createSlidePluginHandler({ name: "Intro" }, ctx);
    expect(out.type).toBe("SLIDE");
    expect(out.nodeId).toMatch(/^sld/);
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { name?: string }).name).toBe("Intro");
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(createSlidePluginHandler({}, figmaCtx())).rejects.toThrow(
      /E_FIGMA_EDITOR_TYPE_MISMATCH/
    );
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a FigJam editor", async () => {
    await expect(createSlidePluginHandler({}, figJamCtx())).rejects.toThrow(
      /E_FIGMA_EDITOR_TYPE_MISMATCH/
    );
  });
});

describe("createSlideRowPluginHandler", () => {
  it("creates a slide row on a Slides editor", async () => {
    const ctx = slidesCtx();
    const out = await createSlideRowPluginHandler({}, ctx);
    expect(out.type).toBe("SLIDE_ROW");
    expect(out.nodeId).toMatch(/^slr/);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(createSlideRowPluginHandler({}, figmaCtx())).rejects.toThrow(
      /E_FIGMA_EDITOR_TYPE_MISMATCH/
    );
  });
});

describe("setSlideNamePluginHandler", () => {
  it("rewrites a slide's name", async () => {
    const ctx = slidesCtx();
    const slide = await ctx.figma.createSlide({ name: "Old" });
    await setSlideNamePluginHandler({ slideId: slide.id, name: "New" }, ctx);
    const node = await ctx.figma.getNodeById({ nodeId: slide.id });
    expect((node as { name?: string }).name).toBe("New");
  });

  it("rejects non-slide nodes", async () => {
    const ctx = slidesCtx();
    const row = await ctx.figma.createSlideRow({});
    await expect(setSlideNamePluginHandler({ slideId: row.id, name: "X" }, ctx)).rejects.toThrow(
      /slide/i
    );
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      setSlideNamePluginHandler({ slideId: "sld1", name: "X" }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("setSlideSkippedPluginHandler", () => {
  it("toggles isSkipped on a slide", async () => {
    const ctx = slidesCtx();
    const slide = await ctx.figma.createSlide({});
    await setSlideSkippedPluginHandler({ slideId: slide.id, skipped: true }, ctx);
    const node = await ctx.figma.getNodeById({ nodeId: slide.id });
    expect((node as { isSkipped?: boolean }).isSkipped).toBe(true);
  });

  it("rejects non-slide nodes", async () => {
    const ctx = slidesCtx();
    const row = await ctx.figma.createSlideRow({});
    await expect(
      setSlideSkippedPluginHandler({ slideId: row.id, skipped: true }, ctx)
    ).rejects.toThrow(/slide/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a FigJam editor", async () => {
    await expect(
      setSlideSkippedPluginHandler({ slideId: "sld1", skipped: true }, figJamCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});
