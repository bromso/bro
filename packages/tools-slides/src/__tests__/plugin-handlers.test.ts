import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  createSlidePluginHandler,
  createSlideRowPluginHandler,
  setSlideBackgroundPluginHandler,
  setSlideNamePluginHandler,
  setSlideSkippedPluginHandler,
  setSlideTransitionPluginHandler,
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

describe("setSlideTransitionPluginHandler", () => {
  it("writes the transition to a slide", async () => {
    const ctx = slidesCtx();
    const slide = await ctx.figma.createSlide({});
    await setSlideTransitionPluginHandler(
      {
        slideId: slide.id,
        style: "DISSOLVE",
        durationSec: 0.5,
        curve: "EASE_OUT",
        timingType: "AFTER_DELAY",
        timingDelaySec: 1,
      },
      ctx
    );
    const t = await ctx.figma.getSlideTransition({ slideId: slide.id });
    expect(t.style).toBe("DISSOLVE");
    expect(t.duration).toBe(0.5);
    expect(t.curve).toBe("EASE_OUT");
    expect(t.timing).toEqual({ type: "AFTER_DELAY", delay: 1 });
  });

  it("rejects non-slide nodes", async () => {
    const ctx = slidesCtx();
    const row = await ctx.figma.createSlideRow({});
    await expect(
      setSlideTransitionPluginHandler({ slideId: row.id, style: "NONE" }, ctx)
    ).rejects.toThrow(/slide/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      setSlideTransitionPluginHandler({ slideId: "sld1", style: "DISSOLVE" }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("setSlideBackgroundPluginHandler", () => {
  it("writes a SOLID paint to the slide", async () => {
    const ctx = slidesCtx();
    const slide = await ctx.figma.createSlide({});
    await setSlideBackgroundPluginHandler(
      {
        slideId: slide.id,
        paint: { type: "SOLID", color: { r: 0.2, g: 0.4, b: 0.8 } },
      },
      ctx
    );
    const node = await ctx.figma.getNodeById({ nodeId: slide.id });
    const fills = (node as { fills?: ReadonlyArray<{ type: string }> }).fills;
    expect(fills?.[0].type).toBe("SOLID");
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      setSlideBackgroundPluginHandler(
        {
          slideId: "sld1",
          paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
        },
        figmaCtx()
      )
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});
