import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  extractComponentsPluginHandler,
  extractLocalVariablesPluginHandler,
  extractStylesPluginHandler,
} from "../plugin-handlers";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe("extractStylesPluginHandler", () => {
  it("returns paint, text, and effect styles from the adapter", async () => {
    const figma = new FigmaFake();
    figma.__seedPaintStyles([
      { id: "p1", name: "primary", type: "PAINT", paints: [{ type: "SOLID" }] },
    ]);
    figma.__seedTextStyles([
      {
        id: "t1",
        name: "body",
        type: "TEXT",
        fontName: { family: "Inter", style: "Regular" },
        fontSize: 16,
      },
    ]);
    figma.__seedEffectStyles([
      { id: "e1", name: "shadow", type: "EFFECT", effects: [{ type: "DROP_SHADOW" }] },
    ]);

    const result = await extractStylesPluginHandler({}, { logger: noopLogger, figma });
    expect(result.paintStyles).toHaveLength(1);
    expect(result.textStyles).toHaveLength(1);
    expect(result.effectStyles).toHaveLength(1);
    expect(result.paintStyles[0].id).toBe("p1");
  });
});

describe("extractComponentsPluginHandler", () => {
  it("returns components from the adapter", async () => {
    const figma = new FigmaFake();
    figma.__seedComponents([{ id: "c1", name: "Button", key: "btn-key" }]);
    const result = await extractComponentsPluginHandler({}, { logger: noopLogger, figma });
    expect(result.components).toEqual([{ id: "c1", name: "Button", key: "btn-key" }]);
  });
});

describe("extractLocalVariablesPluginHandler", () => {
  it("returns variables from the adapter", async () => {
    const figma = new FigmaFake();
    figma.__seedVariables([
      {
        id: "v1",
        name: "color/red",
        resolvedType: "COLOR",
        valuesByMode: { mode1: "#f00" },
      },
    ]);
    const result = await extractLocalVariablesPluginHandler({}, { logger: noopLogger, figma });
    expect(result.variables[0].id).toBe("v1");
  });
});
