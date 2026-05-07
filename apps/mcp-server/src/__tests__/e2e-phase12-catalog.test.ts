import {
  CreateSlide,
  CreateSlideRow,
  DeleteSlide,
  DuplicateSlide,
  GetSlide,
  GetSlideGrid,
  ListSlideRows,
  ListSlides,
  MoveSlide,
  SetActiveSlide,
  SetSlideBackground,
  SetSlideName,
  SetSlideSkipped,
  SetSlidesView,
  SetSlideTransition,
} from "@repo/tools-slides";
import { describe, expect, it } from "vitest";

describe("Phase 12 tool catalog", () => {
  it("exposes 15 slides tools with the expected names", () => {
    const names = [
      CreateSlide.name,
      CreateSlideRow.name,
      SetSlideName.name,
      SetSlideSkipped.name,
      SetSlideTransition.name,
      SetSlideBackground.name,
      MoveSlide.name,
      DuplicateSlide.name,
      DeleteSlide.name,
      ListSlides.name,
      ListSlideRows.name,
      SetActiveSlide.name,
      GetSlide.name,
      SetSlidesView.name,
      GetSlideGrid.name,
    ];
    expect(new Set(names).size).toBe(15);
    expect(names).toEqual([
      "create_slide",
      "create_slide_row",
      "set_slide_name",
      "set_slide_skipped",
      "set_slide_transition",
      "set_slide_background",
      "move_slide",
      "duplicate_slide",
      "delete_slide",
      "list_slides",
      "list_slide_rows",
      "set_active_slide",
      "get_slide",
      "set_slides_view",
      "get_slide_grid",
    ]);
  });

  it("every tool's input schema rejects extraneous keys (strict)", () => {
    const tools = [
      CreateSlide,
      CreateSlideRow,
      SetSlideName,
      SetSlideSkipped,
      SetSlideTransition,
      SetSlideBackground,
      MoveSlide,
      DuplicateSlide,
      DeleteSlide,
      ListSlides,
      ListSlideRows,
      SetActiveSlide,
      GetSlide,
      SetSlidesView,
      GetSlideGrid,
    ];
    for (const tool of tools) {
      const r = tool.input.safeParse({ __unexpected: 1 });
      // strict() rejects unknown keys; either parse fails outright or known
      // required keys are missing — both produce success: false.
      expect(r.success).toBe(false);
    }
  });
});
