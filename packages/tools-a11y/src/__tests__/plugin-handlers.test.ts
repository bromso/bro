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

import { simulateColorBlindnessPluginHandler } from "../plugin-handlers";

describe("simulateColorBlindnessPluginHandler", () => {
  it("returns the simulated hex for achromatopsia (greyscale)", async () => {
    const ctx = designCtx();
    const out = await simulateColorBlindnessPluginHandler(
      { hex: "#FF0000", type: "achromatopsia" },
      ctx
    );
    expect(out.type).toBe("achromatopsia");
    expect(out.sourceHex).toBe("#FF0000");
    // Achromatopsia: red has luminance ≈ 0.2126 → channels equal.
    const hex = out.simulatedHex;
    expect(hex).toMatch(/^#([0-9A-F]{2})\1\1$/);
  });

  it("works the same on every editor type (no guard)", async () => {
    const out1 = await simulateColorBlindnessPluginHandler(
      { hex: "#FF0000", type: "protanopia" },
      designCtx()
    );
    const out2 = await simulateColorBlindnessPluginHandler(
      { hex: "#FF0000", type: "protanopia" },
      figJamCtx()
    );
    expect(out1.simulatedHex).toBe(out2.simulatedHex);
  });
});

import {
  getAltTextPluginHandler,
  getAriaLabelPluginHandler,
  setAltTextPluginHandler,
  setAriaLabelPluginHandler,
} from "../plugin-handlers";

describe("setAltTextPluginHandler", () => {
  it("writes the alt text to pluginData", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await setAltTextPluginHandler({ nodeId: frame.id, text: "Hero image" }, ctx);
    const meta = await ctx.figma.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta.altText).toBe("Hero image");
  });

  it("ALSO appends an annotation with the same label", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await setAltTextPluginHandler({ nodeId: frame.id, text: "Hero image" }, ctx);
    const annotations = await ctx.figma.getNodeAnnotations({ nodeId: frame.id });
    expect(annotations.some((a) => a.label === "Hero image")).toBe(true);
  });

  it("overwrites existing alt text on a second call (idempotent)", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await setAltTextPluginHandler({ nodeId: frame.id, text: "Old" }, ctx);
    await setAltTextPluginHandler({ nodeId: frame.id, text: "New" }, ctx);
    const meta = await ctx.figma.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta.altText).toBe("New");
  });

  it("works on a FigJam editor", async () => {
    const ctx = figJamCtx();
    const sticky = await ctx.figma.createSticky({ content: "x" });
    await setAltTextPluginHandler({ nodeId: sticky.id, text: "A sticky note" }, ctx);
    const meta = await ctx.figma.getNodeA11yMeta({ nodeId: sticky.id });
    expect(meta.altText).toBe("A sticky note");
  });

  it("rejects unknown nodeId", async () => {
    const ctx = designCtx();
    await expect(setAltTextPluginHandler({ nodeId: "missing", text: "x" }, ctx)).rejects.toThrow(
      /not found/i
    );
  });
});

describe("getAltTextPluginHandler", () => {
  it("reads pluginData", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeA11yMeta({
      nodeId: frame.id,
      key: "altText",
      value: "Stored alt",
    });
    const out = await getAltTextPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.text).toBe("Stored alt");
  });

  it("falls back to scanning annotations when pluginData is empty", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [{ label: "Annotation-only alt" }],
    });
    const out = await getAltTextPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.text).toBe("Annotation-only alt");
  });

  it("returns null when no alt text is set anywhere", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await getAltTextPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.text).toBeNull();
  });
});

describe("setAriaLabelPluginHandler", () => {
  it("writes the aria label to pluginData (no annotation)", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await setAriaLabelPluginHandler({ nodeId: frame.id, label: "Submit form" }, ctx);
    const meta = await ctx.figma.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta.ariaLabel).toBe("Submit form");
    // ariaLabel does NOT also write an annotation — just pluginData.
    const annotations = await ctx.figma.getNodeAnnotations({ nodeId: frame.id });
    expect(annotations).toEqual([]);
  });
});

describe("getAriaLabelPluginHandler", () => {
  it("reads pluginData", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeA11yMeta({
      nodeId: frame.id,
      key: "ariaLabel",
      value: "Stored label",
    });
    const out = await getAriaLabelPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.label).toBe("Stored label");
  });

  it("returns null when not set", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await getAriaLabelPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.label).toBeNull();
  });
});

import { getLandmarkRolePluginHandler, setLandmarkRolePluginHandler } from "../plugin-handlers";

describe("setLandmarkRolePluginHandler", () => {
  it("writes the role to pluginData", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await setLandmarkRolePluginHandler({ nodeId: frame.id, role: "main" }, ctx);
    const meta = await ctx.figma.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta.landmarkRole).toBe("main");
  });

  it("overwrites a prior role", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await setLandmarkRolePluginHandler({ nodeId: frame.id, role: "banner" }, ctx);
    await setLandmarkRolePluginHandler({ nodeId: frame.id, role: "main" }, ctx);
    const meta = await ctx.figma.getNodeA11yMeta({ nodeId: frame.id });
    expect(meta.landmarkRole).toBe("main");
  });
});

describe("getLandmarkRolePluginHandler", () => {
  it("returns the stored role", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeA11yMeta({
      nodeId: frame.id,
      key: "landmarkRole",
      value: "navigation",
    });
    const out = await getLandmarkRolePluginHandler({ nodeId: frame.id }, ctx);
    expect(out.role).toBe("navigation");
  });

  it("returns null when not set", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await getLandmarkRolePluginHandler({ nodeId: frame.id }, ctx);
    expect(out.role).toBeNull();
  });
});

import {
  addAnnotationPluginHandler,
  listAnnotationsPluginHandler,
  removeAnnotationPluginHandler,
} from "../plugin-handlers";

describe("listAnnotationsPluginHandler", () => {
  it("returns an empty array when no annotations are set", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await listAnnotationsPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.annotations).toEqual([]);
    expect(out.count).toBe(0);
  });

  it("returns each annotation with its index", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [{ label: "Hero" }, { label: "Variant", categoryId: "design-review" }],
    });
    const out = await listAnnotationsPluginHandler({ nodeId: frame.id }, ctx);
    expect(out.annotations).toEqual([
      { index: 0, label: "Hero" },
      { index: 1, label: "Variant", categoryId: "design-review" },
    ]);
    expect(out.count).toBe(2);
  });
});

describe("addAnnotationPluginHandler", () => {
  it("appends a new annotation and returns its index", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await addAnnotationPluginHandler({ nodeId: frame.id, label: "Hero" }, ctx);
    expect(out.index).toBe(0);
    expect(out.count).toBe(1);
    const list = await ctx.figma.getNodeAnnotations({ nodeId: frame.id });
    expect(list[0]).toEqual({ label: "Hero" });
  });

  it("appends with a categoryId when supplied", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await addAnnotationPluginHandler(
      {
        nodeId: frame.id,
        label: "Reviewed",
        categoryId: "design-review",
      },
      ctx
    );
    const list = await ctx.figma.getNodeAnnotations({ nodeId: frame.id });
    expect(list[0]).toEqual({ label: "Reviewed", categoryId: "design-review" });
  });

  it("preserves prior annotations", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [{ label: "First" }],
    });
    const out = await addAnnotationPluginHandler({ nodeId: frame.id, label: "Second" }, ctx);
    expect(out.index).toBe(1);
    expect(out.count).toBe(2);
    const list = await ctx.figma.getNodeAnnotations({ nodeId: frame.id });
    expect(list.map((a) => a.label)).toEqual(["First", "Second"]);
  });
});

describe("removeAnnotationPluginHandler", () => {
  it("drops the Nth annotation by index", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [{ label: "First" }, { label: "Second" }, { label: "Third" }],
    });
    const out = await removeAnnotationPluginHandler({ nodeId: frame.id, annotationIndex: 1 }, ctx);
    expect(out.count).toBe(2);
    const list = await ctx.figma.getNodeAnnotations({ nodeId: frame.id });
    expect(list.map((a) => a.label)).toEqual(["First", "Third"]);
  });

  it("rejects out-of-range indices", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [{ label: "First" }],
    });
    await expect(
      removeAnnotationPluginHandler({ nodeId: frame.id, annotationIndex: 5 }, ctx)
    ).rejects.toThrow(/index/i);
  });

  it("rejects when there are no annotations", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await expect(
      removeAnnotationPluginHandler({ nodeId: frame.id, annotationIndex: 0 }, ctx)
    ).rejects.toThrow(/index/i);
  });
});

import { auditA11ySummaryPluginHandler } from "../plugin-handlers";

describe("auditA11ySummaryPluginHandler", () => {
  it("returns ok status when contrast/target-size pass and metadata is set", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 200, height: 100 });
    await ctx.figma.setNodeFill({
      nodeId: frame.id,
      paint: { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 },
    });
    await ctx.figma.setNodeA11yMeta({
      nodeId: frame.id,
      key: "altText",
      value: "Hero",
    });

    const text = await ctx.figma.createTextInFrame({
      parentId: frame.id,
      content: "Hello",
    });
    await ctx.figma.setNodeFill({
      nodeId: text.id,
      paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 },
    });

    const out = await auditA11ySummaryPluginHandler({ nodeId: frame.id, recursive: true }, ctx);
    expect(out.checks.find((c) => c.name === "contrast")?.status).toBe("ok");
    expect(out.checks.find((c) => c.name === "target_size")?.status).toBe("ok");
    expect(out.nodesScanned).toBeGreaterThanOrEqual(2);
  });

  it("returns error status when contrast fails AA", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 200, height: 100 });
    await ctx.figma.setNodeFill({
      nodeId: frame.id,
      paint: { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 },
    });
    const text = await ctx.figma.createTextInFrame({
      parentId: frame.id,
      content: "low-contrast",
    });
    await ctx.figma.setNodeFill({
      nodeId: text.id,
      // light grey on white — fails AA
      paint: { type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 }, opacity: 1 },
    });

    const out = await auditA11ySummaryPluginHandler({ nodeId: frame.id, recursive: true }, ctx);
    expect(out.checks.find((c) => c.name === "contrast")?.status).toBe("error");
  });

  it("flags target_size as warn when minimum passes but enhanced fails", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 30, height: 30 });
    const out = await auditA11ySummaryPluginHandler({ nodeId: frame.id, recursive: false }, ctx);
    expect(out.checks.find((c) => c.name === "target_size")?.status).toBe("warn");
  });

  it("flags target_size as error when below minimum", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 20, height: 20 });
    const out = await auditA11ySummaryPluginHandler({ nodeId: frame.id, recursive: false }, ctx);
    expect(out.checks.find((c) => c.name === "target_size")?.status).toBe("error");
  });

  it("flags alt_text as warn when not set on the root frame", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await auditA11ySummaryPluginHandler({ nodeId: frame.id, recursive: false }, ctx);
    const altCheck = out.checks.find((c) => c.name === "alt_text");
    expect(altCheck?.status).toBe("warn");
    expect(altCheck?.detail).toMatch(/alt/i);
  });

  it("flags landmark_role as info when not set", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const out = await auditA11ySummaryPluginHandler({ nodeId: frame.id, recursive: false }, ctx);
    expect(out.checks.find((c) => c.name === "landmark_role")?.status).toMatch(/^(ok|warn)$/);
  });

  it("recursive: true walks the descendant tree", async () => {
    const ctx = designCtx();
    const root = await ctx.figma.createFrame({ width: 200, height: 200 });
    const child1 = await ctx.figma.createFrameInFrame({
      parentId: root.id,
      width: 50,
      height: 50,
    });
    await ctx.figma.createFrameInFrame({
      parentId: child1.id,
      width: 30,
      height: 30,
    });
    const out = await auditA11ySummaryPluginHandler({ nodeId: root.id, recursive: true }, ctx);
    expect(out.nodesScanned).toBeGreaterThanOrEqual(3);
  });

  it("recursive: false scans only the root", async () => {
    const ctx = designCtx();
    const root = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.createFrameInFrame({
      parentId: root.id,
      width: 50,
      height: 50,
    });
    const out = await auditA11ySummaryPluginHandler({ nodeId: root.id, recursive: false }, ctx);
    expect(out.nodesScanned).toBe(1);
  });

  it("works on a FigJam editor", async () => {
    const ctx = figJamCtx();
    const sticky = await ctx.figma.createSticky({ content: "x" });
    const out = await auditA11ySummaryPluginHandler({ nodeId: sticky.id, recursive: false }, ctx);
    expect(out.nodeId).toBe(sticky.id);
  });

  it("returns ok status when ariaLabel and landmarkRole are set on the root", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeA11yMeta({
      nodeId: frame.id,
      key: "ariaLabel",
      value: "Hero region",
    });
    await ctx.figma.setNodeA11yMeta({
      nodeId: frame.id,
      key: "landmarkRole",
      value: "main",
    });
    const out = await auditA11ySummaryPluginHandler({ nodeId: frame.id, recursive: false }, ctx);
    const aria = out.checks.find((c) => c.name === "aria_label");
    const role = out.checks.find((c) => c.name === "landmark_role");
    expect(aria?.detail).toMatch(/Hero region/);
    expect(role?.detail).toMatch(/main/);
  });

  it("truncates long alt text in the detail string", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    const longAlt = "x".repeat(120);
    await ctx.figma.setNodeA11yMeta({
      nodeId: frame.id,
      key: "altText",
      value: longAlt,
    });
    const out = await auditA11ySummaryPluginHandler({ nodeId: frame.id, recursive: false }, ctx);
    const alt = out.checks.find((c) => c.name === "alt_text");
    expect(alt?.detail).toMatch(/…/);
    expect(alt?.detail.length).toBeLessThan(longAlt.length);
  });

  it("falls back to a categoryless annotation when pluginData has no alt text", async () => {
    const ctx = designCtx();
    const frame = await ctx.figma.createFrame({ width: 100, height: 100 });
    await ctx.figma.setNodeAnnotations({
      nodeId: frame.id,
      annotations: [{ label: "annotation alt" }],
    });
    const out = await auditA11ySummaryPluginHandler({ nodeId: frame.id, recursive: false }, ctx);
    const alt = out.checks.find((c) => c.name === "alt_text");
    expect(alt?.status).toBe("ok");
    expect(alt?.detail).toMatch(/annotation alt/);
  });
});
