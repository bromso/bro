import { describe, expectTypeOf, it } from "vitest";
import type { EditorType, FigmaAdapter, PageSelection, RectangleNode, Variable } from "../adapter";

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
