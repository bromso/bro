import { describe, expect, it } from "vitest";
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
