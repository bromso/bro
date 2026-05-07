import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealFigmaAdapter } from "../real-figma-adapter";

const stubFigma = (overrides: Partial<typeof figma> = {}) => {
  const base = {
    editorType: "figma" as const,
    getLocalPaintStylesAsync: vi.fn().mockResolvedValue([]),
    getLocalTextStylesAsync: vi.fn().mockResolvedValue([]),
    getLocalEffectStylesAsync: vi.fn().mockResolvedValue([]),
    createRectangle: vi.fn(),
    createFrame: vi.fn(),
    createText: vi.fn(),
    createEllipse: vi.fn(),
    createLine: vi.fn(),
    createComponentFromNode: vi.fn(),
    getNodeByIdAsync: vi.fn().mockResolvedValue(null),
    loadFontAsync: vi.fn().mockResolvedValue(undefined),
    currentPage: { selection: [] as readonly { id: string }[] },
    root: {
      findAllWithCriteria: vi.fn().mockReturnValue([]),
    },
    variables: {
      getLocalVariablesAsync: vi.fn().mockResolvedValue([]),
      getVariableByIdAsync: vi.fn().mockResolvedValue(null),
    },
  };
  return { ...base, ...overrides };
};

beforeEach(() => {
  vi.stubGlobal("figma", stubFigma());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RealFigmaAdapter.editorType", () => {
  it("reads from figma.editorType", () => {
    vi.stubGlobal("figma", stubFigma({ editorType: "figjam" as const }));
    expect(new RealFigmaAdapter().editorType).toBe("figjam");
  });
});

describe("RealFigmaAdapter.getLocalVariablesAsync", () => {
  it("delegates to figma.variables.getLocalVariablesAsync, summarizing each variable", async () => {
    const calls = vi.fn().mockResolvedValue([
      {
        id: "v1",
        name: "color/red",
        resolvedType: "COLOR",
        valuesByMode: { m1: { r: 1, g: 0, b: 0 } },
      },
    ]);
    vi.stubGlobal(
      "figma",
      stubFigma({
        variables: {
          getLocalVariablesAsync: calls,
          getVariableByIdAsync: vi.fn(),
        } as never,
      } as never)
    );

    const result = await new RealFigmaAdapter().getLocalVariablesAsync();
    expect(calls).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "v1", resolvedType: "COLOR" });
  });
});

describe("RealFigmaAdapter.setValueForMode", () => {
  it("looks up the variable by id and calls setValueForMode on it", async () => {
    const setValueForMode = vi.fn();
    const variable = { id: "v1", setValueForMode };
    vi.stubGlobal(
      "figma",
      stubFigma({
        variables: {
          getLocalVariablesAsync: vi.fn().mockResolvedValue([variable]),
          getVariableByIdAsync: vi.fn().mockResolvedValue(variable),
        } as never,
      } as never)
    );

    await new RealFigmaAdapter().setValueForMode({
      variableId: "v1",
      modeId: "m1",
      value: "#aa0000",
    });
    expect(setValueForMode).toHaveBeenCalledWith("m1", "#aa0000");
  });

  it("throws when the variable does not exist", async () => {
    await expect(
      new RealFigmaAdapter().setValueForMode({
        variableId: "missing",
        modeId: "m1",
        value: 0,
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe("RealFigmaAdapter.createRectangle", () => {
  it("delegates to figma.createRectangle and surfaces id/type/width/height", () => {
    const node = { id: "r1", type: "RECTANGLE" as const, width: 100, height: 100 };
    vi.stubGlobal("figma", stubFigma({ createRectangle: vi.fn().mockReturnValue(node) }));
    const result = new RealFigmaAdapter().createRectangle();
    expect(result).toEqual(node);
  });
});

describe("RealFigmaAdapter.currentPageSelection", () => {
  it("maps figma.currentPage.selection to ids", () => {
    vi.stubGlobal(
      "figma",
      stubFigma({ currentPage: { selection: [{ id: "n1" }, { id: "n2" }] } } as never)
    );
    expect(new RealFigmaAdapter().currentPageSelection.nodeIds).toEqual(["n1", "n2"]);
  });
});

describe("RealFigmaAdapter.getLocalComponentsAsync", () => {
  it("delegates to figma.root.findAllWithCriteria for COMPONENT nodes", async () => {
    const find = vi
      .fn()
      .mockReturnValue([{ id: "c1", name: "Button", key: "btn", description: "primary" }]);
    vi.stubGlobal("figma", stubFigma({ root: { findAllWithCriteria: find } } as never));

    const result = await new RealFigmaAdapter().getLocalComponentsAsync();
    expect(find).toHaveBeenCalledWith({ types: ["COMPONENT"] });
    expect(result[0]).toEqual({
      id: "c1",
      name: "Button",
      key: "btn",
      description: "primary",
    });
  });
});

describe("RealFigmaAdapter.getLocalPaintStylesAsync", () => {
  it("delegates to figma.getLocalPaintStylesAsync, summarizing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({
        getLocalPaintStylesAsync: vi
          .fn()
          .mockResolvedValue([
            { id: "p1", name: "primary", description: "hex", paints: [{ type: "SOLID" }] },
          ]),
      })
    );
    const result = await new RealFigmaAdapter().getLocalPaintStylesAsync();
    expect(result[0]).toMatchObject({ id: "p1", name: "primary", type: "PAINT" });
    expect(result[0]?.paints).toEqual([{ type: "SOLID", visible: undefined }]);
  });
});

describe("RealFigmaAdapter.getLocalTextStylesAsync", () => {
  it("delegates to figma.getLocalTextStylesAsync, summarizing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({
        getLocalTextStylesAsync: vi.fn().mockResolvedValue([
          {
            id: "t1",
            name: "body",
            description: "",
            fontName: { family: "Inter", style: "Regular" },
            fontSize: 14,
            lineHeight: { value: 20, unit: "PIXELS" },
            letterSpacing: { value: 0, unit: "PIXELS" },
          },
        ]),
      })
    );
    const result = await new RealFigmaAdapter().getLocalTextStylesAsync();
    expect(result[0]).toMatchObject({
      id: "t1",
      name: "body",
      type: "TEXT",
      fontName: { family: "Inter", style: "Regular" },
      fontSize: 14,
    });
  });
});

describe("RealFigmaAdapter.getLocalEffectStylesAsync", () => {
  it("delegates to figma.getLocalEffectStylesAsync, summarizing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({
        getLocalEffectStylesAsync: vi.fn().mockResolvedValue([
          {
            id: "e1",
            name: "shadow",
            description: "drop",
            effects: [{ type: "DROP_SHADOW", visible: true }],
          },
        ]),
      })
    );
    const result = await new RealFigmaAdapter().getLocalEffectStylesAsync();
    expect(result[0]).toMatchObject({ id: "e1", name: "shadow", type: "EFFECT" });
    expect(result[0]?.effects).toEqual([{ type: "DROP_SHADOW", visible: true }]);
  });
});

describe("RealFigmaAdapter.getLocalVariableCollectionsAsync", () => {
  it("delegates to figma.variables.getLocalVariableCollectionsAsync, mapping mode shape", async () => {
    const list = vi
      .fn()
      .mockResolvedValue([{ id: "c1", name: "Brand", modes: [{ modeId: "m1", name: "Default" }] }]);
    vi.stubGlobal(
      "figma",
      stubFigma({
        variables: {
          getLocalVariableCollectionsAsync: list,
          getLocalVariablesAsync: vi.fn().mockResolvedValue([]),
          getVariableByIdAsync: vi.fn().mockResolvedValue(null),
        } as never,
      } as never)
    );
    const r = await new RealFigmaAdapter().getLocalVariableCollectionsAsync();
    expect(r[0]).toEqual({
      id: "c1",
      name: "Brand",
      modes: [{ id: "m1", name: "Default" }],
    });
  });
});

describe("RealFigmaAdapter.createVariableCollection", () => {
  it("delegates and maps mode ids", async () => {
    const create = vi.fn().mockReturnValue({
      id: "c1",
      name: "Brand",
      modes: [{ modeId: "m1", name: "Default" }],
    });
    vi.stubGlobal(
      "figma",
      stubFigma({
        variables: {
          createVariableCollection: create,
          getLocalVariablesAsync: vi.fn().mockResolvedValue([]),
          getVariableByIdAsync: vi.fn().mockResolvedValue(null),
        } as never,
      } as never)
    );
    const r = await new RealFigmaAdapter().createVariableCollection({ name: "Brand" });
    expect(create).toHaveBeenCalledWith("Brand");
    expect(r.modes[0].id).toBe("m1");
  });
});

describe("RealFigmaAdapter.createVariable", () => {
  it("delegates and summarizes the new variable", async () => {
    const v = { id: "v1", name: "x", resolvedType: "FLOAT", valuesByMode: {} };
    const create = vi.fn().mockReturnValue(v);
    vi.stubGlobal(
      "figma",
      stubFigma({
        variables: {
          createVariable: create,
          getLocalVariablesAsync: vi.fn().mockResolvedValue([]),
          getVariableByIdAsync: vi.fn().mockResolvedValue(null),
        } as never,
      } as never)
    );
    const r = await new RealFigmaAdapter().createVariable({
      name: "x",
      collectionId: "c1",
      resolvedType: "FLOAT",
    });
    expect(create).toHaveBeenCalledWith("x", "c1", "FLOAT");
    expect(r.id).toBe("v1");
  });
});

describe("RealFigmaAdapter.deleteVariableAsync", () => {
  it("calls v.remove() when the variable exists", async () => {
    const remove = vi.fn();
    const v = { id: "v1", remove };
    vi.stubGlobal(
      "figma",
      stubFigma({
        variables: {
          getVariableByIdAsync: vi.fn().mockResolvedValue(v),
          getLocalVariablesAsync: vi.fn().mockResolvedValue([]),
        } as never,
      } as never)
    );
    await new RealFigmaAdapter().deleteVariableAsync("v1");
    expect(remove).toHaveBeenCalled();
  });
  it("rejects when the variable is missing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({
        variables: {
          getVariableByIdAsync: vi.fn().mockResolvedValue(null),
          getLocalVariablesAsync: vi.fn().mockResolvedValue([]),
        } as never,
      } as never)
    );
    await expect(new RealFigmaAdapter().deleteVariableAsync("missing")).rejects.toThrow(
      /not found/i
    );
  });
});

// ---- Phase 8 design adapter methods ----

describe("RealFigmaAdapter.createFrame", () => {
  it("calls figma.createFrame and resizes/places", async () => {
    const node = {
      id: "f1",
      x: 0,
      y: 0,
      name: "",
      width: 0,
      height: 0,
      resize(w: number, h: number) {
        this.width = w;
        this.height = h;
      },
    };
    vi.stubGlobal("figma", stubFigma({ createFrame: vi.fn().mockReturnValue(node) } as never));
    const r = await new RealFigmaAdapter().createFrame({
      width: 200,
      height: 100,
      x: 5,
      y: 6,
      name: "Hero",
    });
    expect(r).toMatchObject({
      id: "f1",
      type: "FRAME",
      width: 200,
      height: 100,
      x: 5,
      y: 6,
      name: "Hero",
    });
  });
});

describe("RealFigmaAdapter.createText", () => {
  it("calls figma.createText, loads font, sets characters and fontSize", async () => {
    const node = {
      id: "t1",
      x: 0,
      y: 0,
      characters: "",
      fontSize: 16,
      fontName: { family: "Inter", style: "Regular" },
    };
    const loadFontAsync = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "figma",
      stubFigma({
        createText: vi.fn().mockReturnValue(node),
        loadFontAsync,
      } as never)
    );
    const r = await new RealFigmaAdapter().createText({
      content: "hello",
      fontSize: 24,
      x: 10,
      y: 20,
    });
    expect(loadFontAsync).toHaveBeenCalledWith({ family: "Inter", style: "Regular" });
    expect(node.characters).toBe("hello");
    expect(node.fontSize).toBe(24);
    expect(r).toMatchObject({ id: "t1", type: "TEXT", characters: "hello", fontSize: 24 });
  });

  it("falls back to fontSize 16 when the underlying property is non-numeric", async () => {
    const node = {
      id: "t2",
      x: 0,
      y: 0,
      characters: "",
      fontSize: "mixed",
      fontName: { family: "Inter", style: "Regular" },
    };
    vi.stubGlobal(
      "figma",
      stubFigma({
        createText: vi.fn().mockReturnValue(node),
        loadFontAsync: vi.fn().mockResolvedValue(undefined),
      } as never)
    );
    const r = await new RealFigmaAdapter().createText({ content: "x" });
    expect(r.fontSize).toBe(16);
  });
});

describe("RealFigmaAdapter.createEllipse", () => {
  it("calls figma.createEllipse and resizes", async () => {
    const node = {
      id: "e1",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      resize(w: number, h: number) {
        this.width = w;
        this.height = h;
      },
    };
    vi.stubGlobal("figma", stubFigma({ createEllipse: vi.fn().mockReturnValue(node) } as never));
    const r = await new RealFigmaAdapter().createEllipse({ width: 80, height: 80 });
    expect(r).toMatchObject({ id: "e1", type: "ELLIPSE", width: 80, height: 80 });
  });
});

describe("RealFigmaAdapter.createLine", () => {
  it("calls figma.createLine with rotation and resize", async () => {
    const node = {
      id: "ln1",
      x: 0,
      y: 0,
      rotation: 0,
      resize: vi.fn(),
    };
    vi.stubGlobal("figma", stubFigma({ createLine: vi.fn().mockReturnValue(node) } as never));
    const r = await new RealFigmaAdapter().createLine({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(node.x).toBe(0);
    expect(node.y).toBe(0);
    expect(node.resize).toHaveBeenCalledWith(100, 0);
    expect(r).toMatchObject({ id: "ln1", type: "LINE", x1: 0, x2: 100 });
  });
});

describe("RealFigmaAdapter.setNodeFill", () => {
  it("looks up the node and assigns fills", async () => {
    const target = { id: "n1", fills: [] as readonly unknown[] };
    vi.stubGlobal(
      "figma",
      stubFigma({ getNodeByIdAsync: vi.fn().mockResolvedValue(target) } as never)
    );
    await new RealFigmaAdapter().setNodeFill({
      nodeId: "n1",
      paint: { type: "SOLID", color: { r: 1, g: 0, b: 0 } },
    });
    expect(target.fills).toEqual([{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }]);
  });

  it("rejects when the node is missing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({ getNodeByIdAsync: vi.fn().mockResolvedValue(null) } as never)
    );
    await expect(
      new RealFigmaAdapter().setNodeFill({
        nodeId: "missing",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe("RealFigmaAdapter.setNodeStroke", () => {
  it("assigns strokes and strokeWeight", async () => {
    const target = {
      id: "n1",
      strokes: [] as readonly unknown[],
      strokeWeight: 0,
    };
    vi.stubGlobal(
      "figma",
      stubFigma({ getNodeByIdAsync: vi.fn().mockResolvedValue(target) } as never)
    );
    await new RealFigmaAdapter().setNodeStroke({
      nodeId: "n1",
      paint: { type: "SOLID", color: { r: 0, g: 0, b: 1 } },
      weight: 4,
    });
    expect(target.strokes).toEqual([{ type: "SOLID", color: { r: 0, g: 0, b: 1 } }]);
    expect(target.strokeWeight).toBe(4);
  });

  it("omits strokeWeight when not provided", async () => {
    const target = {
      id: "n1",
      strokes: [] as readonly unknown[],
      strokeWeight: 7,
    };
    vi.stubGlobal(
      "figma",
      stubFigma({ getNodeByIdAsync: vi.fn().mockResolvedValue(target) } as never)
    );
    await new RealFigmaAdapter().setNodeStroke({
      nodeId: "n1",
      paint: { type: "SOLID", color: { r: 0, g: 0, b: 1 } },
    });
    expect(target.strokeWeight).toBe(7);
  });

  it("rejects when the node is missing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({ getNodeByIdAsync: vi.fn().mockResolvedValue(null) } as never)
    );
    await expect(
      new RealFigmaAdapter().setNodeStroke({
        nodeId: "missing",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe("RealFigmaAdapter.setTextContent", () => {
  it("loads the font and writes characters on a TEXT node", async () => {
    const target = {
      id: "t1",
      type: "TEXT" as const,
      fontName: { family: "Inter", style: "Regular" },
      characters: "old",
    };
    const loadFontAsync = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "figma",
      stubFigma({
        getNodeByIdAsync: vi.fn().mockResolvedValue(target),
        loadFontAsync,
      } as never)
    );
    await new RealFigmaAdapter().setTextContent({ nodeId: "t1", characters: "new" });
    expect(loadFontAsync).toHaveBeenCalledWith({ family: "Inter", style: "Regular" });
    expect(target.characters).toBe("new");
  });

  it("rejects on a non-TEXT node", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({
        getNodeByIdAsync: vi.fn().mockResolvedValue({ id: "r1", type: "RECTANGLE" }),
        loadFontAsync: vi.fn().mockResolvedValue(undefined),
      } as never)
    );
    await expect(
      new RealFigmaAdapter().setTextContent({ nodeId: "r1", characters: "x" })
    ).rejects.toThrow(/text/i);
  });

  it("rejects when the node is missing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({ getNodeByIdAsync: vi.fn().mockResolvedValue(null) } as never)
    );
    await expect(
      new RealFigmaAdapter().setTextContent({ nodeId: "missing", characters: "x" })
    ).rejects.toThrow(/not found/i);
  });
});

describe("RealFigmaAdapter.resizeNode", () => {
  it("calls node.resize with the requested width/height", async () => {
    const resize = vi.fn();
    vi.stubGlobal(
      "figma",
      stubFigma({
        getNodeByIdAsync: vi.fn().mockResolvedValue({ id: "r1", resize }),
      } as never)
    );
    await new RealFigmaAdapter().resizeNode({ nodeId: "r1", width: 300, height: 250 });
    expect(resize).toHaveBeenCalledWith(300, 250);
  });

  it("rejects when the node is missing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({ getNodeByIdAsync: vi.fn().mockResolvedValue(null) } as never)
    );
    await expect(
      new RealFigmaAdapter().resizeNode({ nodeId: "missing", width: 1, height: 1 })
    ).rejects.toThrow(/not found/i);
  });
});

describe("RealFigmaAdapter.cloneNode", () => {
  it("calls node.clone() and returns the new id", async () => {
    const clone = vi.fn().mockReturnValue({ id: "r2" });
    vi.stubGlobal(
      "figma",
      stubFigma({
        getNodeByIdAsync: vi.fn().mockResolvedValue({ id: "r1", clone }),
      } as never)
    );
    const r = await new RealFigmaAdapter().cloneNode({ nodeId: "r1" });
    expect(clone).toHaveBeenCalled();
    expect(r).toEqual({ id: "r2" });
  });

  it("rejects when the node is missing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({ getNodeByIdAsync: vi.fn().mockResolvedValue(null) } as never)
    );
    await expect(new RealFigmaAdapter().cloneNode({ nodeId: "missing" })).rejects.toThrow(
      /not found/i
    );
  });
});

describe("RealFigmaAdapter.deleteNode", () => {
  it("calls node.remove()", async () => {
    const remove = vi.fn();
    vi.stubGlobal(
      "figma",
      stubFigma({
        getNodeByIdAsync: vi.fn().mockResolvedValue({ id: "r1", remove }),
      } as never)
    );
    await new RealFigmaAdapter().deleteNode({ nodeId: "r1" });
    expect(remove).toHaveBeenCalled();
  });

  it("rejects when the node is missing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({ getNodeByIdAsync: vi.fn().mockResolvedValue(null) } as never)
    );
    await expect(new RealFigmaAdapter().deleteNode({ nodeId: "missing" })).rejects.toThrow(
      /not found/i
    );
  });
});

describe("RealFigmaAdapter.createComponent", () => {
  it("calls figma.createComponentFromNode and summarizes", async () => {
    const sourceNode = { id: "r1" };
    const componentNode = {
      id: "cmp1",
      name: "Button",
      key: "btn-key",
      description: "primary",
    };
    const createComponentFromNode = vi.fn().mockReturnValue(componentNode);
    vi.stubGlobal(
      "figma",
      stubFigma({
        getNodeByIdAsync: vi.fn().mockResolvedValue(sourceNode),
        createComponentFromNode,
      } as never)
    );
    const r = await new RealFigmaAdapter().createComponent({ nodeId: "r1" });
    expect(createComponentFromNode).toHaveBeenCalledWith(sourceNode);
    expect(r).toEqual({
      id: "cmp1",
      name: "Button",
      key: "btn-key",
      description: "primary",
    });
  });

  it("rejects when the node is missing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({ getNodeByIdAsync: vi.fn().mockResolvedValue(null) } as never)
    );
    await expect(new RealFigmaAdapter().createComponent({ nodeId: "missing" })).rejects.toThrow(
      /not found/i
    );
  });
});

describe("RealFigmaAdapter.getNodeById", () => {
  it("returns null when the node is missing", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({ getNodeByIdAsync: vi.fn().mockResolvedValue(null) } as never)
    );
    expect(await new RealFigmaAdapter().getNodeById({ nodeId: "missing" })).toBeNull();
  });

  it("emits a NodeSnapshot with the present scalar fields", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({
        getNodeByIdAsync: vi.fn().mockResolvedValue({
          id: "r1",
          type: "RECTANGLE",
          width: 100,
          height: 50,
          x: 10,
          y: 20,
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
          strokes: [],
          strokeWeight: 1,
        }),
      } as never)
    );
    const r = await new RealFigmaAdapter().getNodeById({ nodeId: "r1" });
    expect(r).toMatchObject({
      id: "r1",
      type: "RECTANGLE",
      width: 100,
      height: 50,
      x: 10,
      y: 20,
      strokeWeight: 1,
    });
    expect(r?.fills?.[0]).toEqual({ type: "SOLID", color: { r: 1, g: 0, b: 0 } });
  });

  it("includes characters for TEXT nodes", async () => {
    vi.stubGlobal(
      "figma",
      stubFigma({
        getNodeByIdAsync: vi.fn().mockResolvedValue({
          id: "t1",
          type: "TEXT",
          characters: "hello",
          x: 0,
          y: 0,
        }),
      } as never)
    );
    const r = await new RealFigmaAdapter().getNodeById({ nodeId: "t1" });
    expect(r).toMatchObject({ id: "t1", type: "TEXT", characters: "hello" });
  });
});
