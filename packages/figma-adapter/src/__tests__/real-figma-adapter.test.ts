import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealFigmaAdapter } from "../real-figma-adapter";

const stubFigma = (overrides: Partial<typeof figma> = {}) => {
  const base = {
    editorType: "figma" as const,
    getLocalPaintStylesAsync: vi.fn().mockResolvedValue([]),
    getLocalTextStylesAsync: vi.fn().mockResolvedValue([]),
    getLocalEffectStylesAsync: vi.fn().mockResolvedValue([]),
    createRectangle: vi.fn(),
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
