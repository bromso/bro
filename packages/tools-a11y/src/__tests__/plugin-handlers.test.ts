import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import { auditContrastPluginHandler, auditTargetSizePluginHandler } from "../plugin-handlers";

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const designCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "figma" }),
});
const figJamCtx = () => ({
  logger: noopLogger,
  figma: new FigmaFake({ editorType: "figjam" }),
});

describe("auditContrastPluginHandler", () => {
  it("returns 21:1 ratio + AA/AAA pass for black text on white background", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 200, height: 100 });
    await ctx.figma.setNodeFill({
      nodeId: frame.id,
      paint: { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 },
    });
    const text = await ctx.figma.createTextInFrame({
      parentId: frame.id,
      content: "Hello",
    });
    await ctx.figma.setNodeFill({
      nodeId: text.id,
      paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 },
    });
    const out = await auditContrastPluginHandler({ nodeId: text.id }, ctx);
    expect(out.ratio).toBeCloseTo(21, 1);
    expect(out.passesAA).toBe(true);
    expect(out.passesAAA).toBe(true);
    expect(out.foreground).toBe("#000000");
    expect(out.background).toBe("#FFFFFF");
  });

  it("returns null ratio when there is no resolvable background", async () => {
    const ctx = designCtx();
    const text = await ctx.figma.createText({ content: "orphan" });
    await ctx.figma.setNodeFill({
      nodeId: text.id,
      paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 },
    });
    const out = await auditContrastPluginHandler({ nodeId: text.id }, ctx);
    expect(out.ratio).toBeNull();
    expect(out.passesAA).toBeNull();
    expect(out.background).toBeNull();
    expect(out.reason).toMatch(/background/i);
  });

  it("returns null ratio when there is no text fill", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 200, height: 100 });
    await ctx.figma.setNodeFill({
      nodeId: frame.id,
      paint: { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 },
    });
    const text = await ctx.figma.createTextInFrame({
      parentId: frame.id,
      content: "no fill",
    });
    const out = await auditContrastPluginHandler({ nodeId: text.id }, ctx);
    expect(out.ratio).toBeNull();
    expect(out.foreground).toBeNull();
  });

  it("works on a FigJam editor (no editor-type guard)", async () => {
    const ctx = figJamCtx();
    const sticky = await ctx.figma.createSticky({ content: "label" });
    // FigJam stickies have a default fill; assertion is just "doesn't throw"
    const out = await auditContrastPluginHandler({ nodeId: sticky.id }, ctx);
    expect(out.nodeId).toBe(sticky.id);
  });

  it("rejects unknown nodeId", async () => {
    const ctx = designCtx();
    await expect(auditContrastPluginHandler({ nodeId: "missing" }, ctx)).rejects.toThrow(
      /not found/i
    );
  });
});

describe("auditTargetSizePluginHandler", () => {
  it("44×44 passes both minimum (24) and enhanced (44)", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 44, height: 44 });
    const out = await auditTargetSizePluginHandler({ nodeId: frame.id }, ctx);
    expect(out).toMatchObject({
      width: 44,
      height: 44,
      passesMinimum: true,
      passesEnhanced: true,
    });
  });

  it("24×24 passes minimum but fails enhanced", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 24, height: 24 });
    const out = await auditTargetSizePluginHandler({ nodeId: frame.id }, ctx);
    expect(out.passesMinimum).toBe(true);
    expect(out.passesEnhanced).toBe(false);
  });

  it("23×24 fails minimum (uses min(width, height))", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 23, height: 24 });
    const out = await auditTargetSizePluginHandler({ nodeId: frame.id }, ctx);
    expect(out.passesMinimum).toBe(false);
  });

  it("returns null bbox info when the node has no bounding box", async () => {
    const ctx = designCtx();
    ctx.figma.__seedBboxlessNode("bbox1");
    const out = await auditTargetSizePluginHandler({ nodeId: "bbox1" }, ctx);
    expect(out.width).toBeNull();
    expect(out.passesMinimum).toBeNull();
    expect(out.reason).toMatch(/bounding box/i);
  });

  it("works on a FigJam editor", async () => {
    const ctx = figJamCtx();
    const sticky = await ctx.figma.createSticky({ content: "x" });
    const out = await auditTargetSizePluginHandler({ nodeId: sticky.id }, ctx);
    expect(out.nodeId).toBe(sticky.id);
  });
});
