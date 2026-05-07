import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  createSlidePluginHandler,
  createSlideRowPluginHandler,
  deleteSlidePluginHandler,
  duplicateSlidePluginHandler,
  getSlideGridPluginHandler,
  getSlidePluginHandler,
  listSlideRowsPluginHandler,
  listSlidesPluginHandler,
  moveSlidePluginHandler,
  setActiveSlidePluginHandler,
  setSlideBackgroundPluginHandler,
  setSlideNamePluginHandler,
  setSlideSkippedPluginHandler,
  setSlidesViewPluginHandler,
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

describe("moveSlidePluginHandler", () => {
  it("repositions a slide within the grid", async () => {
    const ctx = slidesCtx();
    await ctx.figma.createSlideRow({}); // row 0
    await ctx.figma.createSlideRow({}); // row 1
    const a = await ctx.figma.createSlide({ rowIndex: 0, columnIndex: 0 });
    await ctx.figma.createSlide({ rowIndex: 1, columnIndex: 0 });
    const out = await moveSlidePluginHandler({ slideId: a.id, rowIndex: 1, columnIndex: 1 }, ctx);
    expect(out).toEqual({ nodeId: a.id, rowIndex: 1, columnIndex: 1 });
    const grid = await ctx.figma.getSlideGrid();
    expect(grid[1][1]).toBe(a.id);
  });

  it("rejects unknown slideId", async () => {
    const ctx = slidesCtx();
    await expect(
      moveSlidePluginHandler({ slideId: "missing", rowIndex: 0, columnIndex: 0 }, ctx)
    ).rejects.toThrow(/not found/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a FigJam editor", async () => {
    await expect(
      moveSlidePluginHandler({ slideId: "sld1", rowIndex: 0, columnIndex: 0 }, figJamCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("duplicateSlidePluginHandler", () => {
  it("clones a slide and returns the new id", async () => {
    const ctx = slidesCtx();
    const a = await ctx.figma.createSlide({ name: "Intro" });
    const out = await duplicateSlidePluginHandler({ slideId: a.id }, ctx);
    expect(out.type).toBe("SLIDE");
    expect(out.nodeId).not.toBe(a.id);
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { name?: string }).name).toBe("Intro");
  });

  it("rejects unknown slideId", async () => {
    const ctx = slidesCtx();
    await expect(duplicateSlidePluginHandler({ slideId: "missing" }, ctx)).rejects.toThrow(
      /not found/i
    );
  });
});

describe("deleteSlidePluginHandler", () => {
  it("deletes a slide and returns deleted: true", async () => {
    const ctx = slidesCtx();
    const a = await ctx.figma.createSlide({});
    const out = await deleteSlidePluginHandler({ slideId: a.id }, ctx);
    expect(out).toEqual({ slideId: a.id, deleted: true });
    expect(await ctx.figma.getNodeById({ nodeId: a.id })).toBeNull();
  });

  it("rejects unknown slideId", async () => {
    const ctx = slidesCtx();
    await expect(deleteSlidePluginHandler({ slideId: "missing" }, ctx)).rejects.toThrow(
      /not found/i
    );
  });
});

describe("listSlidesPluginHandler", () => {
  it("returns every slide id when rowIndex is omitted", async () => {
    const ctx = slidesCtx();
    const a = await ctx.figma.createSlide({});
    const b = await ctx.figma.createSlide({});
    const out = await listSlidesPluginHandler({}, ctx);
    expect(out.nodeIds).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(out.count).toBeGreaterThanOrEqual(2);
  });

  it("returns slides in a single row when rowIndex is supplied", async () => {
    const ctx = slidesCtx();
    await ctx.figma.createSlideRow({});
    const a = await ctx.figma.createSlide({ rowIndex: 0 });
    const out = await listSlidesPluginHandler({ rowIndex: 0 }, ctx);
    expect(out.nodeIds).toContain(a.id);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(listSlidesPluginHandler({}, figmaCtx())).rejects.toThrow(
      /E_FIGMA_EDITOR_TYPE_MISMATCH/
    );
  });
});

describe("listSlideRowsPluginHandler", () => {
  it("returns row ids in order", async () => {
    const ctx = slidesCtx();
    const r0 = await ctx.figma.createSlideRow({});
    const r1 = await ctx.figma.createSlideRow({});
    const out = await listSlideRowsPluginHandler({}, ctx);
    expect(out.rowIds).toEqual(expect.arrayContaining([r0.id, r1.id]));
  });
});

describe("setActiveSlidePluginHandler", () => {
  it("focuses a slide", async () => {
    const ctx = slidesCtx();
    const a = await ctx.figma.createSlide({});
    const out = await setActiveSlidePluginHandler({ slideId: a.id }, ctx);
    expect(out).toEqual({ slideId: a.id });
    expect(await ctx.figma.getActiveSlideId()).toBe(a.id);
  });

  it("rejects unknown slideId", async () => {
    const ctx = slidesCtx();
    await expect(setActiveSlidePluginHandler({ slideId: "missing" }, ctx)).rejects.toThrow(
      /not found/i
    );
  });
});

describe("getSlidePluginHandler", () => {
  it("returns structured summary for the slide", async () => {
    const ctx = slidesCtx();
    const a = await ctx.figma.createSlide({ name: "Intro" });
    await ctx.figma.setSlideTransition({
      slideId: a.id,
      style: "DISSOLVE",
      durationSec: 0.5,
    });
    const out = await getSlidePluginHandler({ slideId: a.id }, ctx);
    expect(out.nodeId).toBe(a.id);
    expect(out.name).toBe("Intro");
    expect(out.isSkipped).toBe(false);
    expect(out.transition.style).toBe("DISSOLVE");
    expect(out.transition.durationSec).toBe(0.5);
    expect(out.isFirst).toBe(true);
  });

  it("flags isFirst correctly when the slide is not the first", async () => {
    const ctx = slidesCtx();
    await ctx.figma.createSlide({});
    const b = await ctx.figma.createSlide({});
    const out = await getSlidePluginHandler({ slideId: b.id }, ctx);
    expect(out.isFirst).toBe(false);
  });

  it("rejects unknown slideId", async () => {
    const ctx = slidesCtx();
    await expect(getSlidePluginHandler({ slideId: "missing" }, ctx)).rejects.toThrow(
      /expected slide node|not found/i
    );
  });

  it("falls back to empty name and isSkipped=false when the node lacks them", async () => {
    // Real Figma plugin runtime can return SLIDE nodes that don't expose
    // every field; we defend with `?? ""` / `?? false`. The FigmaFake
    // always populates them, so cover the fallback branches with a stub
    // adapter whose getNodeById returns a minimal {type:"SLIDE"} record.
    const stub = {
      editorType: "slides",
      async getNodeById() {
        return { id: "sld_x", type: "SLIDE" };
      },
      async getSlideTransition() {
        return { style: "NONE", duration: 0, curve: "LINEAR" };
      },
      async getSlideGrid() {
        return [["sld_x"]];
      },
    } as unknown as FigmaFake;
    const out = await getSlidePluginHandler(
      { slideId: "sld_x" },
      { logger: noopLogger, figma: stub }
    );
    expect(out.name).toBe("");
    expect(out.isSkipped).toBe(false);
    expect(out.isFirst).toBe(true);
  });
});

describe("setSlidesViewPluginHandler", () => {
  it("sets the viewport mode", async () => {
    const ctx = slidesCtx();
    await setSlidesViewPluginHandler({ view: "single-slide" }, ctx);
    expect(await ctx.figma.getSlidesView()).toBe("single-slide");
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(setSlidesViewPluginHandler({ view: "grid" }, figmaCtx())).rejects.toThrow(
      /E_FIGMA_EDITOR_TYPE_MISMATCH/
    );
  });
});

describe("getSlideGridPluginHandler", () => {
  it("returns the 2D grid of slide ids", async () => {
    const ctx = slidesCtx();
    await ctx.figma.createSlideRow({});
    const a = await ctx.figma.createSlide({ rowIndex: 0 });
    const out = await getSlideGridPluginHandler({}, ctx);
    expect(out.grid.flat()).toContain(a.id);
  });
});
