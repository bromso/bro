import { describe, expect, it } from "vitest";
import type { SolidPaint } from "../adapter";
import { FigmaFake } from "../figma-fake";

describe("FigmaFake.getLocalVariablesAsync", () => {
  it("returns an empty array on a fresh instance", async () => {
    const fake = new FigmaFake();
    expect(await fake.getLocalVariablesAsync()).toEqual([]);
  });

  it("returns variables seeded via __seedVariables", async () => {
    const fake = new FigmaFake();
    fake.__seedVariables([
      {
        id: "v1",
        name: "color/red",
        resolvedType: "COLOR",
        valuesByMode: { mode1: "#ff0000" },
      },
    ]);
    const result = await fake.getLocalVariablesAsync();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("v1");
  });
});

describe("FigmaFake.setValueForMode", () => {
  it("mutates the value at the given mode", async () => {
    const fake = new FigmaFake();
    fake.__seedVariables([
      {
        id: "v1",
        name: "color/red",
        resolvedType: "COLOR",
        valuesByMode: { mode1: "#ff0000" },
      },
    ]);
    await fake.setValueForMode({
      variableId: "v1",
      modeId: "mode1",
      value: "#aa0000",
    });
    const [v] = await fake.getLocalVariablesAsync();
    expect(v.valuesByMode.mode1).toBe("#aa0000");
  });

  it("rejects when the variable does not exist", async () => {
    const fake = new FigmaFake();
    await expect(
      fake.setValueForMode({ variableId: "missing", modeId: "mode1", value: 0 })
    ).rejects.toThrow(/not found/i);
  });

  it("creates a new mode entry on a known variable", async () => {
    const fake = new FigmaFake();
    fake.__seedVariables([
      {
        id: "v1",
        name: "x",
        resolvedType: "FLOAT",
        valuesByMode: { mode1: 1 },
      },
    ]);
    await fake.setValueForMode({ variableId: "v1", modeId: "mode2", value: 2 });
    const [v] = await fake.getLocalVariablesAsync();
    expect(v.valuesByMode).toEqual({ mode1: 1, mode2: 2 });
  });
});

describe("FigmaFake.createRectangle", () => {
  it("returns a node with a unique id and the RECTANGLE type", () => {
    const fake = new FigmaFake();
    const a = fake.createRectangle();
    const b = fake.createRectangle();
    expect(a.type).toBe("RECTANGLE");
    expect(a.id).not.toBe(b.id);
  });

  it("appears in currentPageSelection only when explicitly selected", () => {
    const fake = new FigmaFake();
    const node = fake.createRectangle();
    expect(fake.currentPageSelection.nodeIds).toEqual([]);
    fake.__select([node.id]);
    expect(fake.currentPageSelection.nodeIds).toEqual([node.id]);
  });
});

describe("FigmaFake editor type", () => {
  it("defaults to figma", () => {
    expect(new FigmaFake().editorType).toBe("figma");
  });
});

describe("FigmaFake.__setEditorType", () => {
  it("switches editorType after construction", () => {
    const fake = new FigmaFake();
    fake.__setEditorType("figjam");
    expect(fake.editorType).toBe("figjam");
    fake.__setEditorType("slides");
    expect(fake.editorType).toBe("slides");
  });

  it("accepts editorType in the constructor", () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    expect(fake.editorType).toBe("figjam");
  });
});

describe("FigmaFake.getLocalPaintStylesAsync", () => {
  it("returns seeded paint styles", async () => {
    const fake = new FigmaFake();
    fake.__seedPaintStyles([
      { id: "p1", name: "primary", type: "PAINT", paints: [{ type: "SOLID" }] },
    ]);
    expect(await fake.getLocalPaintStylesAsync()).toHaveLength(1);
  });
});

describe("FigmaFake.getLocalTextStylesAsync", () => {
  it("returns seeded text styles", async () => {
    const fake = new FigmaFake();
    fake.__seedTextStyles([
      {
        id: "t1",
        name: "body",
        type: "TEXT",
        fontName: { family: "Inter", style: "Regular" },
        fontSize: 16,
      },
    ]);
    expect((await fake.getLocalTextStylesAsync())[0].fontName.family).toBe("Inter");
  });
});

describe("FigmaFake.getLocalEffectStylesAsync", () => {
  it("returns seeded effect styles", async () => {
    const fake = new FigmaFake();
    fake.__seedEffectStyles([
      { id: "e1", name: "shadow", type: "EFFECT", effects: [{ type: "DROP_SHADOW" }] },
    ]);
    expect(await fake.getLocalEffectStylesAsync()).toHaveLength(1);
  });
});

describe("FigmaFake.getLocalComponentsAsync", () => {
  it("returns seeded components", async () => {
    const fake = new FigmaFake();
    fake.__seedComponents([{ id: "c1", name: "Button", key: "abc" }]);
    expect((await fake.getLocalComponentsAsync())[0].key).toBe("abc");
  });
});

describe("FigmaFake.createVariableCollection", () => {
  it("returns a collection with id starting vc, name as passed, and a Default mode", async () => {
    const fake = new FigmaFake();
    const c = await fake.createVariableCollection({ name: "Brand" });
    expect(c.id).toMatch(/^vc/);
    expect(c.name).toBe("Brand");
    expect(c.modes).toHaveLength(1);
    expect(c.modes[0].name).toBe("Default");
  });
});

describe("FigmaFake.createVariable", () => {
  it("rejects when the collection is missing", async () => {
    const fake = new FigmaFake();
    await expect(
      fake.createVariable({ name: "x", collectionId: "missing", resolvedType: "FLOAT" })
    ).rejects.toThrow(/not found/i);
  });
  it("creates a variable in an existing collection", async () => {
    const fake = new FigmaFake();
    const c = await fake.createVariableCollection({ name: "Brand" });
    const v = await fake.createVariable({
      name: "color/red",
      collectionId: c.id,
      resolvedType: "COLOR",
    });
    expect(v.id).toMatch(/^v/);
    expect(v.resolvedType).toBe("COLOR");
    const list = await fake.getLocalVariablesAsync();
    expect(list.find((x) => x.id === v.id)).toBeDefined();
  });
});

describe("FigmaFake.deleteVariableAsync", () => {
  it("removes a variable; subsequent reads don't include it", async () => {
    const fake = new FigmaFake();
    const c = await fake.createVariableCollection({ name: "Brand" });
    const v = await fake.createVariable({
      name: "x",
      collectionId: c.id,
      resolvedType: "FLOAT",
    });
    await fake.deleteVariableAsync(v.id);
    const list = await fake.getLocalVariablesAsync();
    expect(list.find((x) => x.id === v.id)).toBeUndefined();
  });
  it("rejects on a missing id", async () => {
    const fake = new FigmaFake();
    await expect(fake.deleteVariableAsync("missing")).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.getLocalVariableCollectionsAsync", () => {
  it("returns seeded collections", async () => {
    const fake = new FigmaFake();
    fake.__seedCollections([{ id: "vc1", name: "X", modes: [{ id: "m", name: "Default" }] }]);
    expect((await fake.getLocalVariableCollectionsAsync()).length).toBe(1);
  });
});

describe("FigmaFake.createFrame", () => {
  it("creates a frame node with the given dimensions and a unique id", async () => {
    const fake = new FigmaFake();
    const a = await fake.createFrame({ width: 200, height: 120, name: "Hero" });
    const b = await fake.createFrame({ width: 50, height: 50 });
    expect(a.type).toBe("FRAME");
    expect(a.width).toBe(200);
    expect(a.height).toBe(120);
    expect(a.name).toBe("Hero");
    expect(a.id).not.toBe(b.id);
  });

  it("supports x/y placement", async () => {
    const fake = new FigmaFake();
    const node = await fake.createFrame({ width: 10, height: 10, x: 50, y: 60 });
    expect(node.x).toBe(50);
    expect(node.y).toBe(60);
  });
});

describe("FigmaFake.createText", () => {
  it("creates a TEXT node with characters and default fontSize", async () => {
    const fake = new FigmaFake();
    const t = await fake.createText({ content: "hello" });
    expect(t.type).toBe("TEXT");
    expect(t.characters).toBe("hello");
    expect(t.fontSize).toBe(16);
  });

  it("uses the provided fontSize", async () => {
    const fake = new FigmaFake();
    const t = await fake.createText({ content: "x", fontSize: 24 });
    expect(t.fontSize).toBe(24);
  });
});

describe("FigmaFake.createEllipse", () => {
  it("creates an ELLIPSE node with width/height", async () => {
    const fake = new FigmaFake();
    const node = await fake.createEllipse({ width: 80, height: 80 });
    expect(node.type).toBe("ELLIPSE");
    expect(node.width).toBe(80);
  });
});

describe("FigmaFake.createLine", () => {
  it("creates a LINE node with endpoint coordinates", async () => {
    const fake = new FigmaFake();
    const ln = await fake.createLine({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(ln.type).toBe("LINE");
    expect(ln.x1).toBe(0);
    expect(ln.x2).toBe(100);
  });
});

describe("FigmaFake.setNodeFill", () => {
  it("sets a SOLID paint on an existing node", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    await fake.setNodeFill({
      nodeId: r.id,
      paint: { type: "SOLID", color: { r: 1, g: 0, b: 0 } },
    });
    const node = await fake.getNodeById({ nodeId: r.id });
    expect(node?.fills?.[0]).toEqual({ type: "SOLID", color: { r: 1, g: 0, b: 0 } });
  });

  it("rejects when nodeId is unknown", async () => {
    const fake = new FigmaFake();
    await expect(
      fake.setNodeFill({
        nodeId: "missing",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.setNodeStroke", () => {
  it("sets stroke paint and weight", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    await fake.setNodeStroke({
      nodeId: r.id,
      paint: { type: "SOLID", color: { r: 0, g: 0, b: 1 } },
      weight: 4,
    });
    const node = await fake.getNodeById({ nodeId: r.id });
    expect(node?.strokes?.[0]?.color).toEqual({ r: 0, g: 0, b: 1 });
    expect(node?.strokeWeight).toBe(4);
  });
});

describe("FigmaFake.setTextContent", () => {
  it("rewrites the characters of an existing TEXT node", async () => {
    const fake = new FigmaFake();
    const t = await fake.createText({ content: "old" });
    await fake.setTextContent({ nodeId: t.id, characters: "new" });
    const after = (await fake.getNodeById({ nodeId: t.id })) as { characters: string };
    expect(after.characters).toBe("new");
  });

  it("rejects on a non-text node", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    await expect(fake.setTextContent({ nodeId: r.id, characters: "x" })).rejects.toThrow(/text/i);
  });
});

describe("FigmaFake.resizeNode", () => {
  it("updates width/height on an existing node", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    await fake.resizeNode({ nodeId: r.id, width: 300, height: 250 });
    const node = await fake.getNodeById({ nodeId: r.id });
    expect(node?.width).toBe(300);
    expect(node?.height).toBe(250);
  });
});

describe("FigmaFake.cloneNode", () => {
  it("returns a new id and the cloned node is reachable by getNodeById", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    const clone = await fake.cloneNode({ nodeId: r.id });
    expect(clone.id).not.toBe(r.id);
    const fetched = await fake.getNodeById({ nodeId: clone.id });
    expect(fetched?.type).toBe("RECTANGLE");
  });
});

describe("FigmaFake.deleteNode", () => {
  it("removes the node so getNodeById returns null", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    await fake.deleteNode({ nodeId: r.id });
    expect(await fake.getNodeById({ nodeId: r.id })).toBeNull();
  });
});

describe("FigmaFake.createComponent", () => {
  it("returns a component referencing the source node", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    const comp = await fake.createComponent({ nodeId: r.id });
    expect(comp.id).toMatch(/^cmp/);
    const components = await fake.getLocalComponentsAsync();
    expect(components.find((c) => c.id === comp.id)).toBeTruthy();
  });

  it("rejects when the source node is missing", async () => {
    const fake = new FigmaFake();
    await expect(fake.createComponent({ nodeId: "missing" })).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake edge cases", () => {
  it("setNodeFill rejects on a LINE node (non-paintable)", async () => {
    const fake = new FigmaFake();
    const ln = await fake.createLine({ x1: 0, y1: 0, x2: 1, y2: 1 });
    await expect(
      fake.setNodeFill({
        nodeId: ln.id,
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      })
    ).rejects.toThrow(/not paintable/i);
  });

  it("setNodeStroke rejects when nodeId is unknown", async () => {
    const fake = new FigmaFake();
    await expect(
      fake.setNodeStroke({
        nodeId: "missing",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      })
    ).rejects.toThrow(/not found/i);
  });

  it("setNodeStroke defaults weight to 1 when omitted", async () => {
    const fake = new FigmaFake();
    const r = fake.createRectangle();
    await fake.setNodeStroke({
      nodeId: r.id,
      paint: { type: "SOLID", color: { r: 1, g: 1, b: 1 } },
    });
    const node = await fake.getNodeById({ nodeId: r.id });
    expect(node?.strokeWeight).toBe(1);
  });

  it("setTextContent rejects when nodeId is unknown", async () => {
    const fake = new FigmaFake();
    await expect(fake.setTextContent({ nodeId: "missing", characters: "x" })).rejects.toThrow(
      /not found/i
    );
  });

  it("resizeNode rejects when nodeId is unknown", async () => {
    const fake = new FigmaFake();
    await expect(fake.resizeNode({ nodeId: "missing", width: 1, height: 1 })).rejects.toThrow(
      /not found/i
    );
  });

  it("resizeNode rejects on a LINE node", async () => {
    const fake = new FigmaFake();
    const ln = await fake.createLine({ x1: 0, y1: 0, x2: 1, y2: 1 });
    await expect(fake.resizeNode({ nodeId: ln.id, width: 1, height: 1 })).rejects.toThrow(
      /not resizable/i
    );
  });

  it("resizeNode rejects on a TEXT node", async () => {
    const fake = new FigmaFake();
    const t = await fake.createText({ content: "x" });
    await expect(fake.resizeNode({ nodeId: t.id, width: 1, height: 1 })).rejects.toThrow(
      /not resizable/i
    );
  });

  it("cloneNode rejects on an unknown id", async () => {
    const fake = new FigmaFake();
    await expect(fake.cloneNode({ nodeId: "missing" })).rejects.toThrow(/not found/i);
  });

  it("cloneNode supports every node type", async () => {
    const fake = new FigmaFake();
    const f = await fake.createFrame({ width: 10, height: 10 });
    const t = await fake.createText({ content: "hi" });
    const e = await fake.createEllipse({ width: 5, height: 5 });
    const ln = await fake.createLine({ x1: 0, y1: 0, x2: 1, y2: 1 });

    const cf = await fake.cloneNode({ nodeId: f.id });
    const ct = await fake.cloneNode({ nodeId: t.id });
    const ce = await fake.cloneNode({ nodeId: e.id });
    const cl = await fake.cloneNode({ nodeId: ln.id });

    expect((await fake.getNodeById({ nodeId: cf.id }))?.type).toBe("FRAME");
    expect((await fake.getNodeById({ nodeId: ct.id }))?.type).toBe("TEXT");
    expect((await fake.getNodeById({ nodeId: ce.id }))?.type).toBe("ELLIPSE");
    expect((await fake.getNodeById({ nodeId: cl.id }))?.type).toBe("LINE");
  });

  it("deleteNode rejects when nodeId is unknown", async () => {
    const fake = new FigmaFake();
    await expect(fake.deleteNode({ nodeId: "missing" })).rejects.toThrow(/not found/i);
  });

  it("getNodeById returns null on an unknown id", async () => {
    const fake = new FigmaFake();
    expect(await fake.getNodeById({ nodeId: "missing" })).toBeNull();
  });

  it("getNodeById returns a LINE-shaped snapshot for line nodes", async () => {
    const fake = new FigmaFake();
    const ln = await fake.createLine({ x1: 0, y1: 0, x2: 5, y2: 5 });
    const snap = await fake.getNodeById({ nodeId: ln.id });
    expect(snap?.type).toBe("LINE");
    expect(snap?.width).toBeUndefined();
    expect(snap?.height).toBeUndefined();
  });

  it("__seedFrame and __seedText make nodes reachable by getNodeById", async () => {
    const fake = new FigmaFake();
    fake.__seedFrame({
      id: "fseed",
      type: "FRAME",
      width: 1,
      height: 2,
      x: 3,
      y: 4,
      name: "seeded",
    });
    fake.__seedText({
      id: "tseed",
      type: "TEXT",
      characters: "hi",
      fontSize: 12,
      x: 0,
      y: 0,
    });
    expect((await fake.getNodeById({ nodeId: "fseed" }))?.type).toBe("FRAME");
    expect((await fake.getNodeById({ nodeId: "tseed" }))?.characters).toBe("hi");
  });

  it("createFrame defaults x/y/name to 0/0/empty when omitted", async () => {
    const fake = new FigmaFake();
    const f = await fake.createFrame({ width: 1, height: 1 });
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
    expect(f.name).toBe("");
  });
});

// ---- Phase 10: FigJam adapter extensions ----

describe("FigmaFake.createSticky", () => {
  it("creates a STICKY node with the given content and a stk-prefixed id", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const a = await fake.createSticky({ content: "first", x: 0, y: 0 });
    const b = await fake.createSticky({ content: "second" });
    expect(a.type).toBe("STICKY");
    expect(a.content).toBe("first");
    expect(a.id).toMatch(/^stk/);
    expect(a.id).not.toBe(b.id);
  });

  it("respects optional authorName", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const a = await fake.createSticky({ content: "x", authorName: "Jonas" });
    expect(a.authorName).toBe("Jonas");
  });

  it("defaults x/y/width/height when unspecified", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const a = await fake.createSticky({ content: "x" });
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(a.width).toBeGreaterThan(0);
    expect(a.height).toBeGreaterThan(0);
  });
});

describe("FigmaFake.createSection", () => {
  it("creates a SECTION node with a name and sec-prefixed id", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "Goals",
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    });
    expect(sec.type).toBe("SECTION");
    expect(sec.name).toBe("Goals");
    expect(sec.id).toMatch(/^sec/);
  });
});

describe("FigmaFake.createConnector", () => {
  it("creates a CONNECTOR linking two known nodes", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const a = await fake.createSticky({ content: "a" });
    const b = await fake.createSticky({ content: "b" });
    const cn = await fake.createConnector({ startNodeId: a.id, endNodeId: b.id });
    expect(cn.type).toBe("CONNECTOR");
    expect(cn.startNodeId).toBe(a.id);
    expect(cn.endNodeId).toBe(b.id);
    expect(cn.id).toMatch(/^cn/);
  });

  it("throws when startNodeId is unknown", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const b = await fake.createSticky({ content: "b" });
    await expect(fake.createConnector({ startNodeId: "missing", endNodeId: b.id })).rejects.toThrow(
      /not found/i
    );
  });

  it("throws when endNodeId is unknown", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const a = await fake.createSticky({ content: "a" });
    await expect(fake.createConnector({ startNodeId: a.id, endNodeId: "missing" })).rejects.toThrow(
      /not found/i
    );
  });
});

describe("FigmaFake.createCodeBlock", () => {
  it("creates a CODE_BLOCK with code, language, x, y", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const cb = await fake.createCodeBlock({
      code: "const x = 1;",
      language: "typescript",
      x: 10,
      y: 20,
    });
    expect(cb.type).toBe("CODE_BLOCK");
    expect(cb.code).toBe("const x = 1;");
    expect(cb.language).toBe("typescript");
    expect(cb.id).toMatch(/^cb/);
  });

  it("defaults language to 'plaintext'", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const cb = await fake.createCodeBlock({ code: "raw" });
    expect(cb.language).toBe("plaintext");
  });
});

describe("FigmaFake.createShapeWithText", () => {
  it("creates a SHAPE_WITH_TEXT with a known shape variant", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const swt = await fake.createShapeWithText({
      shape: "diamond",
      content: "Decide",
      width: 120,
      height: 100,
    });
    expect(swt.type).toBe("SHAPE_WITH_TEXT");
    expect(swt.shape).toBe("diamond");
    expect(swt.content).toBe("Decide");
    expect(swt.id).toMatch(/^swt/);
  });
});

describe("FigmaFake.createTable", () => {
  it("creates a TABLE with rows and columns", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const tbl = await fake.createTable({
      rows: 3,
      columns: 4,
      width: 400,
      height: 300,
    });
    expect(tbl.type).toBe("TABLE");
    expect(tbl.rows).toBe(3);
    expect(tbl.columns).toBe(4);
    expect(tbl.id).toMatch(/^tbl/);
  });
});

describe("FigmaFake.setStickyContent", () => {
  it("rewrites the content of an existing sticky", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const stk = await fake.createSticky({ content: "old" });
    await fake.setStickyContent({ nodeId: stk.id, content: "new" });
    const node = await fake.getNodeById({ nodeId: stk.id });
    expect((node as { content?: string }).content).toBe("new");
  });

  it("rejects non-sticky nodes", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "X",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    await expect(fake.setStickyContent({ nodeId: sec.id, content: "x" })).rejects.toThrow(
      /sticky/i
    );
  });

  it("rejects when nodeId is unknown", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    await expect(fake.setStickyContent({ nodeId: "missing", content: "x" })).rejects.toThrow(
      /not found/i
    );
  });
});

describe("FigmaFake.setSectionName", () => {
  it("rewrites the name of an existing section", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "Old",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    await fake.setSectionName({ nodeId: sec.id, name: "New" });
    const node = await fake.getNodeById({ nodeId: sec.id });
    expect((node as { name?: string }).name).toBe("New");
  });

  it("rejects non-section nodes", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const stk = await fake.createSticky({ content: "x" });
    await expect(fake.setSectionName({ nodeId: stk.id, name: "X" })).rejects.toThrow(/section/i);
  });
});

describe("FigmaFake.moveIntoSection", () => {
  it("adds nodes to a section's children list", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "Group",
      x: 0,
      y: 0,
      width: 1000,
      height: 1000,
    });
    const a = await fake.createSticky({ content: "a" });
    const b = await fake.createSticky({ content: "b" });
    await fake.moveIntoSection({ sectionId: sec.id, nodeIds: [a.id, b.id] });
    const ids = await fake.listSectionChildren({ sectionId: sec.id });
    expect([...ids]).toEqual([a.id, b.id]);
  });

  it("dedupes already-present nodes (idempotent)", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "G",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const a = await fake.createSticky({ content: "a" });
    await fake.moveIntoSection({ sectionId: sec.id, nodeIds: [a.id] });
    await fake.moveIntoSection({ sectionId: sec.id, nodeIds: [a.id] });
    const ids = await fake.listSectionChildren({ sectionId: sec.id });
    expect([...ids]).toEqual([a.id]);
  });

  it("throws when sectionId is unknown", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const a = await fake.createSticky({ content: "a" });
    await expect(fake.moveIntoSection({ sectionId: "missing", nodeIds: [a.id] })).rejects.toThrow(
      /section.*not found/i
    );
  });

  it("throws when sectionId points to a non-section node", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const stk = await fake.createSticky({ content: "x" });
    await expect(fake.moveIntoSection({ sectionId: stk.id, nodeIds: [] })).rejects.toThrow(
      /section/i
    );
  });

  it("throws when any nodeId is unknown", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "G",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    await expect(fake.moveIntoSection({ sectionId: sec.id, nodeIds: ["nope"] })).rejects.toThrow(
      /not found/i
    );
  });
});

describe("FigmaFake.listSectionChildren", () => {
  it("returns an empty list for a fresh section", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    const sec = await fake.createSection({
      name: "Empty",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(await fake.listSectionChildren({ sectionId: sec.id })).toEqual([]);
  });

  it("throws when the section does not exist", async () => {
    const fake = new FigmaFake({ editorType: "figjam" });
    await expect(fake.listSectionChildren({ sectionId: "missing" })).rejects.toThrow(
      /section.*not found/i
    );
  });
});

// ---- Phase 12: Slides ----

describe("FigmaFake.createSlide", () => {
  it("creates a SLIDE node with a sld-prefixed id and appends to the last row", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    const b = await fake.createSlide({});
    expect(a.type).toBe("SLIDE");
    expect(a.id).toMatch(/^sld/);
    expect(a.id).not.toBe(b.id);
    const grid = await fake.getSlideGrid();
    expect(grid.length).toBeGreaterThan(0);
    expect(grid[grid.length - 1]).toContain(a.id);
  });

  it("respects optional name", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({ name: "Intro" });
    expect(slide.name).toBe("Intro");
  });

  it("places at (rowIndex, columnIndex) when supplied", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await fake.createSlideRow({}); // ensure row 0 + row 1 exist
    await fake.createSlideRow({});
    const slide = await fake.createSlide({ rowIndex: 1, columnIndex: 0 });
    const grid = await fake.getSlideGrid();
    expect(grid[1][0]).toBe(slide.id);
  });

  it("auto-extends the grid when rowIndex exceeds existing rows", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({ rowIndex: 5 });
    const grid = await fake.getSlideGrid();
    expect(grid.length).toBeGreaterThanOrEqual(6);
    expect(grid[5]).toContain(slide.id);
  });

  it("rejects an out-of-range columnIndex", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(fake.createSlide({ columnIndex: 99 })).rejects.toThrow(
      /columnIndex out of range/i
    );
  });
});

describe("FigmaFake.createSlideRow", () => {
  it("creates a SLIDE_ROW node with a slr-prefixed id, appended at the end", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const r = await fake.createSlideRow({});
    expect(r.type).toBe("SLIDE_ROW");
    expect(r.id).toMatch(/^slr/);
    const rows = await fake.listSlideRows();
    expect(rows[rows.length - 1]).toBe(r.id);
  });

  it("inserts at a given rowIndex when supplied", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await fake.createSlideRow({});
    await fake.createSlideRow({});
    const r = await fake.createSlideRow({ rowIndex: 0 });
    const rows = await fake.listSlideRows();
    expect(rows[0]).toBe(r.id);
  });

  it("rejects a rowIndex out of range", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(fake.createSlideRow({ rowIndex: 99 })).rejects.toThrow(/rowIndex out of range/i);
  });
});

describe("FigmaFake.setSlideName", () => {
  it("rewrites the name of an existing slide", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({ name: "Old" });
    await fake.setSlideName({ slideId: slide.id, name: "New" });
    const node = await fake.getNodeById({ nodeId: slide.id });
    expect((node as { name?: string }).name).toBe("New");
  });

  it("rejects non-slide nodes", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const row = await fake.createSlideRow({});
    await expect(fake.setSlideName({ slideId: row.id, name: "X" })).rejects.toThrow(/SLIDE/i);
  });

  it("rejects unknown slideId", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(fake.setSlideName({ slideId: "missing", name: "X" })).rejects.toThrow(
      /not found/i
    );
  });
});

describe("FigmaFake.setSlideSkipped", () => {
  it("toggles isSkippedSlide", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({});
    await fake.setSlideSkipped({ slideId: slide.id, skipped: true });
    const node = await fake.getNodeById({ nodeId: slide.id });
    expect((node as { isSkipped?: boolean }).isSkipped).toBe(true);
    await fake.setSlideSkipped({ slideId: slide.id, skipped: false });
    const node2 = await fake.getNodeById({ nodeId: slide.id });
    expect((node2 as { isSkipped?: boolean }).isSkipped).toBe(false);
  });

  it("rejects non-slide nodes", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const row = await fake.createSlideRow({});
    await expect(fake.setSlideSkipped({ slideId: row.id, skipped: true })).rejects.toThrow(
      /SLIDE/i
    );
  });

  it("rejects unknown slideId", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(fake.setSlideSkipped({ slideId: "missing", skipped: true })).rejects.toThrow(
      /not found/i
    );
  });
});

describe("FigmaFake.setSlideTransition", () => {
  it("stores the transition object on the slide", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({});
    await fake.setSlideTransition({
      slideId: slide.id,
      style: "DISSOLVE",
      durationSec: 0.4,
      curve: "EASE_IN_AND_OUT",
      timingType: "ON_CLICK",
    });
    const t = await fake.getSlideTransition({ slideId: slide.id });
    expect(t.style).toBe("DISSOLVE");
    expect(t.duration).toBe(0.4);
    expect(t.curve).toBe("EASE_IN_AND_OUT");
    expect(t.timing.type).toBe("ON_CLICK");
  });

  it("falls back to defaults when optional args are omitted", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({});
    await fake.setSlideTransition({ slideId: slide.id, style: "NONE" });
    const t = await fake.getSlideTransition({ slideId: slide.id });
    expect(t.style).toBe("NONE");
    expect(t.duration).toBeGreaterThan(0);
    expect(t.curve).toBeDefined();
    expect(t.timing.type).toBe("ON_CLICK");
  });

  it("rejects non-slide nodes", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const row = await fake.createSlideRow({});
    await expect(fake.setSlideTransition({ slideId: row.id, style: "NONE" })).rejects.toThrow(
      /SLIDE/i
    );
  });

  it("rejects unknown slideId", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(fake.setSlideTransition({ slideId: "missing", style: "NONE" })).rejects.toThrow(
      /not found/i
    );
  });
});

describe("FigmaFake.getSlideTransition", () => {
  it("returns the default transition for a fresh slide", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({});
    const t = await fake.getSlideTransition({ slideId: slide.id });
    expect(t.style).toBe("NONE");
  });

  it("rejects non-slide nodes", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const row = await fake.createSlideRow({});
    await expect(fake.getSlideTransition({ slideId: row.id })).rejects.toThrow(/SLIDE/i);
  });

  it("rejects unknown slideId", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(fake.getSlideTransition({ slideId: "missing" })).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.setSlideBackground", () => {
  it("writes a SOLID paint to the slide's fills", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const slide = await fake.createSlide({});
    await fake.setSlideBackground({
      slideId: slide.id,
      paint: { type: "SOLID", color: { r: 0, g: 0.5, b: 1 } },
    });
    const node = await fake.getNodeById({ nodeId: slide.id });
    const fills = (node as { fills?: ReadonlyArray<SolidPaint> }).fills;
    expect(fills?.[0]).toMatchObject({
      type: "SOLID",
      color: { r: 0, g: 0.5, b: 1 },
    });
  });

  it("rejects non-slide nodes", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const row = await fake.createSlideRow({});
    await expect(
      fake.setSlideBackground({
        slideId: row.id,
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      })
    ).rejects.toThrow(/SLIDE/i);
  });

  it("rejects unknown slideId", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(
      fake.setSlideBackground({
        slideId: "missing",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe("FigmaFake.moveSlide", () => {
  it("repositions a slide within the grid", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await fake.createSlideRow({}); // row 0
    await fake.createSlideRow({}); // row 1
    const a = await fake.createSlide({ rowIndex: 0, columnIndex: 0 });
    await fake.createSlide({ rowIndex: 1, columnIndex: 0 });
    await fake.moveSlide({ slideId: a.id, rowIndex: 1, columnIndex: 1 });
    const grid = await fake.getSlideGrid();
    expect(grid[0]).not.toContain(a.id);
    expect(grid[1][1]).toBe(a.id);
  });

  it("rejects unknown slide ids", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(
      fake.moveSlide({ slideId: "missing", rowIndex: 0, columnIndex: 0 })
    ).rejects.toThrow(/not found/i);
  });

  it("rejects non-slide nodes", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const row = await fake.createSlideRow({});
    await expect(fake.moveSlide({ slideId: row.id, rowIndex: 0, columnIndex: 0 })).rejects.toThrow(
      /SLIDE/i
    );
  });

  it("rejects an out-of-range rowIndex", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    await expect(fake.moveSlide({ slideId: a.id, rowIndex: 99, columnIndex: 0 })).rejects.toThrow(
      /rowIndex out of range/i
    );
  });

  it("rejects an out-of-range columnIndex", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    await expect(fake.moveSlide({ slideId: a.id, rowIndex: 0, columnIndex: 99 })).rejects.toThrow(
      /columnIndex out of range/i
    );
  });
});

describe("FigmaFake.duplicateSlide", () => {
  it("creates a new SLIDE with a fresh id, appended after the source", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({ name: "Intro" });
    const dup = await fake.duplicateSlide({ slideId: a.id });
    expect(dup.id).not.toBe(a.id);
    expect(dup.id).toMatch(/^sld/);
    expect(dup.type).toBe("SLIDE");
    expect(dup.name).toBe("Intro");
  });

  it("places the duplicate immediately after the source in the same row", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    const b = await fake.createSlide({});
    const dup = await fake.duplicateSlide({ slideId: a.id });
    const grid = await fake.getSlideGrid();
    const row = grid[0];
    expect(row.indexOf(dup.id)).toBe(row.indexOf(a.id) + 1);
    expect(row).toContain(b.id);
  });

  it("rejects unknown slide ids", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(fake.duplicateSlide({ slideId: "missing" })).rejects.toThrow(/not found/i);
  });

  it("rejects non-slide nodes", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const row = await fake.createSlideRow({});
    await expect(fake.duplicateSlide({ slideId: row.id })).rejects.toThrow(/SLIDE/i);
  });
});

describe("FigmaFake.deleteSlide", () => {
  it("removes the slide from the grid + node map", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    await fake.deleteSlide({ slideId: a.id });
    expect(await fake.getNodeById({ nodeId: a.id })).toBeNull();
    const grid = await fake.getSlideGrid();
    for (const row of grid) expect(row).not.toContain(a.id);
  });

  it("clears the focused slide if it was the deleted one", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    await fake.setActiveSlide({ slideId: a.id });
    await fake.deleteSlide({ slideId: a.id });
    expect(await fake.getActiveSlideId()).toBeNull();
  });

  it("rejects unknown slide ids", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(fake.deleteSlide({ slideId: "missing" })).rejects.toThrow(/not found/i);
  });

  it("rejects non-slide nodes", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const row = await fake.createSlideRow({});
    await expect(fake.deleteSlide({ slideId: row.id })).rejects.toThrow(/SLIDE/i);
  });
});

describe("FigmaFake.listSlides", () => {
  it("returns every slide id when rowIndex is omitted", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    const b = await fake.createSlide({});
    expect(await fake.listSlides({})).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it("returns the slides in a single row when rowIndex is supplied", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await fake.createSlideRow({});
    const a = await fake.createSlide({ rowIndex: 0, columnIndex: 0 });
    const b = await fake.createSlide({ rowIndex: 0, columnIndex: 1 });
    const c = await fake.createSlide({ rowIndex: 1, columnIndex: 0 });
    expect(await fake.listSlides({ rowIndex: 0 })).toEqual([a.id, b.id]);
    expect(await fake.listSlides({ rowIndex: 1 })).toEqual([c.id]);
  });

  it("rejects an out-of-range rowIndex", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(fake.listSlides({ rowIndex: 99 })).rejects.toThrow(/row.*not found/i);
  });
});

describe("FigmaFake.listSlideRows", () => {
  it("returns row ids in grid order", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const r0 = await fake.createSlideRow({});
    const r1 = await fake.createSlideRow({});
    const rows = await fake.listSlideRows();
    expect(rows).toEqual(expect.arrayContaining([r0.id, r1.id]));
    expect(rows.indexOf(r0.id)).toBeLessThan(rows.indexOf(r1.id));
  });

  it("returns an empty list on a fresh instance", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    expect(await fake.listSlideRows()).toEqual([]);
  });
});

describe("FigmaFake.setActiveSlide", () => {
  it("records the focused slide id", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    await fake.setActiveSlide({ slideId: a.id });
    expect(await fake.getActiveSlideId()).toBe(a.id);
  });

  it("rejects unknown ids", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await expect(fake.setActiveSlide({ slideId: "missing" })).rejects.toThrow(/not found/i);
  });

  it("rejects non-slide nodes", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const row = await fake.createSlideRow({});
    await expect(fake.setActiveSlide({ slideId: row.id })).rejects.toThrow(/SLIDE/i);
  });
});

describe("FigmaFake.getActiveSlideId", () => {
  it("returns null on a fresh instance", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    expect(await fake.getActiveSlideId()).toBeNull();
  });
});

describe("FigmaFake.setSlidesView", () => {
  it("toggles between grid and single-slide", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    await fake.setSlidesView({ view: "single-slide" });
    expect(await fake.getSlidesView()).toBe("single-slide");
    await fake.setSlidesView({ view: "grid" });
    expect(await fake.getSlidesView()).toBe("grid");
  });
});

describe("FigmaFake.getSlidesView", () => {
  it("defaults to grid", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    expect(await fake.getSlidesView()).toBe("grid");
  });
});

describe("FigmaFake.getSlideGrid", () => {
  it("returns a 2D array of slide ids", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    const grid = await fake.getSlideGrid();
    expect(Array.isArray(grid)).toBe(true);
    expect(Array.isArray(grid[0])).toBe(true);
    expect(grid.flat()).toContain(a.id);
  });

  it("returns a defensive copy (mutating the result does not change adapter state)", async () => {
    const fake = new FigmaFake({ editorType: "slides" });
    const a = await fake.createSlide({});
    const grid = await fake.getSlideGrid();
    (grid as string[][])[0].length = 0;
    const fresh = await fake.getSlideGrid();
    expect(fresh.flat()).toContain(a.id);
  });
});
