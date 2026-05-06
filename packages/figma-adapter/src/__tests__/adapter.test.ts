import { describe, expectTypeOf, it } from "vitest";
import type {
  Component,
  EditorType,
  EffectStyle,
  FigmaAdapter,
  PageSelection,
  PaintStyle,
  RectangleNode,
  TextStyle,
  Variable,
  VariableCollection,
} from "../adapter";

describe("FigmaAdapter (type contract)", () => {
  it("declares the editorType discriminator", () => {
    expectTypeOf<FigmaAdapter["editorType"]>().toEqualTypeOf<EditorType>();
  });

  it("declares getLocalVariablesAsync", () => {
    expectTypeOf<FigmaAdapter["getLocalVariablesAsync"]>().toBeFunction();
    expectTypeOf<FigmaAdapter["getLocalVariablesAsync"]>().returns.resolves.toEqualTypeOf<
      Variable[]
    >();
  });

  it("declares setValueForMode", () => {
    expectTypeOf<FigmaAdapter["setValueForMode"]>()
      .parameter(0)
      .toEqualTypeOf<{ variableId: string; modeId: string; value: unknown }>();
    expectTypeOf<FigmaAdapter["setValueForMode"]>().returns.resolves.toEqualTypeOf<void>();
  });

  it("declares createRectangle", () => {
    expectTypeOf<FigmaAdapter["createRectangle"]>().returns.toEqualTypeOf<RectangleNode>();
  });

  it("declares currentPageSelection", () => {
    expectTypeOf<FigmaAdapter["currentPageSelection"]>().toEqualTypeOf<PageSelection>();
  });
});

describe("FigmaAdapter (extended Phase 3 surface)", () => {
  it("declares getLocalPaintStylesAsync", () => {
    expectTypeOf<FigmaAdapter["getLocalPaintStylesAsync"]>().returns.resolves.toEqualTypeOf<
      PaintStyle[]
    >();
  });
  it("declares getLocalTextStylesAsync", () => {
    expectTypeOf<FigmaAdapter["getLocalTextStylesAsync"]>().returns.resolves.toEqualTypeOf<
      TextStyle[]
    >();
  });
  it("declares getLocalEffectStylesAsync", () => {
    expectTypeOf<FigmaAdapter["getLocalEffectStylesAsync"]>().returns.resolves.toEqualTypeOf<
      EffectStyle[]
    >();
  });
  it("declares getLocalComponentsAsync", () => {
    expectTypeOf<FigmaAdapter["getLocalComponentsAsync"]>().returns.resolves.toEqualTypeOf<
      Component[]
    >();
  });
});

describe("FigmaAdapter (Phase 5 variable mutation surface)", () => {
  it("declares getLocalVariableCollectionsAsync", () => {
    expectTypeOf<FigmaAdapter["getLocalVariableCollectionsAsync"]>().returns.resolves.toEqualTypeOf<
      VariableCollection[]
    >();
  });
  it("declares createVariableCollection", () => {
    expectTypeOf<FigmaAdapter["createVariableCollection"]>()
      .parameter(0)
      .toEqualTypeOf<{ name: string }>();
  });
  it("declares createVariable", () => {
    expectTypeOf<FigmaAdapter["createVariable"]>().parameter(0).toEqualTypeOf<{
      name: string;
      collectionId: string;
      resolvedType: Variable["resolvedType"];
    }>();
  });
  it("declares deleteVariableAsync", () => {
    expectTypeOf<FigmaAdapter["deleteVariableAsync"]>().parameter(0).toEqualTypeOf<string>();
  });
});
