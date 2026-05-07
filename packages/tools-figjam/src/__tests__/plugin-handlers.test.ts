import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  createCodeBlockPluginHandler,
  createConnectorPluginHandler,
  createSectionPluginHandler,
  createShapeWithTextPluginHandler,
  createStickyPluginHandler,
  createTablePluginHandler,
  listSectionChildrenPluginHandler,
  moveIntoSectionPluginHandler,
  setSectionNamePluginHandler,
  setStickyContentPluginHandler,
} from "../plugin-handlers";

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

describe("createConnectorPluginHandler", () => {
  it("creates a connector between two existing nodes", async () => {
    const figma = new FigmaFake({ editorType: "figjam" });
    const a = await figma.createSticky({ content: "a" });
    const b = await figma.createSticky({ content: "b" });
    const out = await createConnectorPluginHandler(
      { startNodeId: a.id, endNodeId: b.id },
      { logger: noopLogger, figma }
    );
    expect(out.type).toBe("CONNECTOR");
    expect(out.nodeId).toMatch(/^cn/);
  });

  it("rejects when startNodeId is unknown", async () => {
    const figma = new FigmaFake({ editorType: "figjam" });
    const b = await figma.createSticky({ content: "b" });
    await expect(
      createConnectorPluginHandler(
        { startNodeId: "missing", endNodeId: b.id },
        { logger: noopLogger, figma }
      )
    ).rejects.toThrow(/not found/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createConnectorPluginHandler({ startNodeId: "a", endNodeId: "b" }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("createCodeBlockPluginHandler", () => {
  it("creates a code block with default language", async () => {
    const ctx = figJamCtx();
    const out = await createCodeBlockPluginHandler({ code: "raw", language: "plaintext" }, ctx);
    expect(out.type).toBe("CODE_BLOCK");
    expect(out.nodeId).toMatch(/^cb/);
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { language?: string }).language).toBe("plaintext");
  });

  it("uses an explicit language", async () => {
    const ctx = figJamCtx();
    const out = await createCodeBlockPluginHandler(
      { code: "const x = 1;", language: "typescript" },
      ctx
    );
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { language?: string }).language).toBe("typescript");
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createCodeBlockPluginHandler({ code: "x", language: "plaintext" }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("createShapeWithTextPluginHandler", () => {
  it("creates a SHAPE_WITH_TEXT with the given variant + content", async () => {
    const ctx = figJamCtx();
    const out = await createShapeWithTextPluginHandler(
      { shape: "diamond", content: "Decide", width: 100, height: 80 },
      ctx
    );
    expect(out.type).toBe("SHAPE_WITH_TEXT");
    expect(out.nodeId).toMatch(/^swt/);
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { shape?: string }).shape).toBe("diamond");
    expect((node as { content?: string }).content).toBe("Decide");
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createShapeWithTextPluginHandler(
        { shape: "square", content: "X", width: 10, height: 10 },
        figmaCtx()
      )
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("createTablePluginHandler", () => {
  it("creates a TABLE with the given grid", async () => {
    const ctx = figJamCtx();
    const out = await createTablePluginHandler(
      { rows: 3, columns: 4, width: 400, height: 300 },
      ctx
    );
    expect(out.type).toBe("TABLE");
    expect(out.nodeId).toMatch(/^tbl/);
    const node = await ctx.figma.getNodeById({ nodeId: out.nodeId });
    expect((node as { rows?: number }).rows).toBe(3);
    expect((node as { columns?: number }).columns).toBe(4);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      createTablePluginHandler({ rows: 1, columns: 1, width: 10, height: 10 }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("setStickyContentPluginHandler", () => {
  it("rewrites a sticky's content", async () => {
    const ctx = figJamCtx();
    const stk = await ctx.figma.createSticky({ content: "old" });
    await setStickyContentPluginHandler({ nodeId: stk.id, content: "new" }, ctx);
    const node = await ctx.figma.getNodeById({ nodeId: stk.id });
    expect((node as { content?: string }).content).toBe("new");
  });

  it("rejects non-sticky nodes", async () => {
    const ctx = figJamCtx();
    const sec = await ctx.figma.createSection({
      name: "X",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    await expect(
      setStickyContentPluginHandler({ nodeId: sec.id, content: "x" }, ctx)
    ).rejects.toThrow(/sticky/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      setStickyContentPluginHandler({ nodeId: "stk1", content: "x" }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("setSectionNamePluginHandler", () => {
  it("rewrites a section's name", async () => {
    const ctx = figJamCtx();
    const sec = await ctx.figma.createSection({
      name: "Old",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    await setSectionNamePluginHandler({ nodeId: sec.id, name: "New" }, ctx);
    const node = await ctx.figma.getNodeById({ nodeId: sec.id });
    expect((node as { name?: string }).name).toBe("New");
  });

  it("rejects non-section nodes", async () => {
    const ctx = figJamCtx();
    const stk = await ctx.figma.createSticky({ content: "x" });
    await expect(setSectionNamePluginHandler({ nodeId: stk.id, name: "X" }, ctx)).rejects.toThrow(
      /section/i
    );
  });
});

describe("moveIntoSectionPluginHandler", () => {
  it("appends node ids to a section's children", async () => {
    const ctx = figJamCtx();
    const sec = await ctx.figma.createSection({
      name: "G",
      x: 0,
      y: 0,
      width: 1000,
      height: 1000,
    });
    const a = await ctx.figma.createSticky({ content: "a" });
    const b = await ctx.figma.createSticky({ content: "b" });
    const out = await moveIntoSectionPluginHandler(
      { sectionId: sec.id, nodeIds: [a.id, b.id] },
      ctx
    );
    expect(out).toEqual({ sectionId: sec.id, moved: 2 });
    const ids = await ctx.figma.listSectionChildren({ sectionId: sec.id });
    expect([...ids]).toEqual([a.id, b.id]);
  });

  it("rejects unknown section", async () => {
    const ctx = figJamCtx();
    await expect(
      moveIntoSectionPluginHandler({ sectionId: "missing", nodeIds: [] }, ctx)
    ).rejects.toThrow(/section.*not found/i);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      moveIntoSectionPluginHandler({ sectionId: "sec1", nodeIds: [] }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});

describe("listSectionChildrenPluginHandler", () => {
  it("returns the current child node ids and their count", async () => {
    const ctx = figJamCtx();
    const sec = await ctx.figma.createSection({
      name: "G",
      x: 0,
      y: 0,
      width: 1000,
      height: 1000,
    });
    const a = await ctx.figma.createSticky({ content: "a" });
    await ctx.figma.moveIntoSection({ sectionId: sec.id, nodeIds: [a.id] });
    const out = await listSectionChildrenPluginHandler({ sectionId: sec.id }, ctx);
    expect(out).toEqual({ nodeIds: [a.id], count: 1 });
  });

  it("returns empty list for an unsourced section", async () => {
    const ctx = figJamCtx();
    const sec = await ctx.figma.createSection({
      name: "Empty",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const out = await listSectionChildrenPluginHandler({ sectionId: sec.id }, ctx);
    expect(out).toEqual({ nodeIds: [], count: 0 });
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on a Figma editor", async () => {
    await expect(
      listSectionChildrenPluginHandler({ sectionId: "sec1" }, figmaCtx())
    ).rejects.toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });
});
