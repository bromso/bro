import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import { E_FIGMA_EDITOR_TYPE_MISMATCH, requireSlides } from "../guard";

describe("requireSlides", () => {
  it("returns the adapter when editorType is slides", () => {
    const figma = new FigmaFake({ editorType: "slides" });
    expect(requireSlides(figma, "tool_x")).toBe(figma);
  });

  it("throws E_FIGMA_EDITOR_TYPE_MISMATCH on figma editor", () => {
    const figma = new FigmaFake({ editorType: "figma" });
    expect(() => requireSlides(figma, "tool_x")).toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });

  it("throws on figjam editor", () => {
    const figma = new FigmaFake({ editorType: "figjam" });
    expect(() => requireSlides(figma, "tool_x")).toThrow(/E_FIGMA_EDITOR_TYPE_MISMATCH/);
  });

  it("includes the tool name and the offending editor type in the error message", () => {
    const figma = new FigmaFake({ editorType: "figma" });
    try {
      requireSlides(figma, "create_slide");
      expect.fail("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("create_slide");
      expect(message).toContain("slides");
      expect(message).toContain("figma");
    }
  });

  it("exposes the error code as a module constant", () => {
    expect(E_FIGMA_EDITOR_TYPE_MISMATCH).toBe("E_FIGMA_EDITOR_TYPE_MISMATCH");
  });
});
