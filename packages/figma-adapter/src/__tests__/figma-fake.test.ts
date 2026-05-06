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
