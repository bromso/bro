import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import { E_FIGMA_EDITOR_TYPE_MISMATCH, requireFigJam } from "../guard";

describe("requireFigJam", () => {
  it("returns the adapter when editorType is figjam", () => {
    const figma = new FigmaFake({ editorType: "figjam" });
    expect(requireFigJam(figma, "tool_x")).toBe(figma);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on figma editor", () => {
    const figma = new FigmaFake({ editorType: "figma" });
    expect(() => requireFigJam(figma, "tool_x")).toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });

  it("throws on slides editor", () => {
    const figma = new FigmaFake({ editorType: "slides" });
    expect(() => requireFigJam(figma, "tool_x")).toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });

  it("includes the tool name and the offending editor type in the error message", () => {
    const figma = new FigmaFake({ editorType: "figma" });
    try {
      requireFigJam(figma, "create_sticky");
      expect.fail("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("create_sticky");
      expect(message).toContain("figjam");
      expect(message).toContain("figma");
    }
  });

  it("exposes the error code as a module constant", () => {
    expect(E_FIGMA_EDITOR_TYPE_MISMATCH).toBe("E_FIGMA_EDITOR_TYPE_MISMATCH");
  });
});
