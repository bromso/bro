import { describe, expect, it } from "vitest";
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
} from "../tools";

describe("CreateSlide schema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(CreateSlide.input.safeParse({}).success).toBe(true);
  });

  it("accepts name + rowIndex + columnIndex", () => {
    expect(
      CreateSlide.input.safeParse({
        name: "Intro",
        rowIndex: 0,
        columnIndex: 1,
      }).success
    ).toBe(true);
  });

  it("rejects negative rowIndex / columnIndex", () => {
    expect(CreateSlide.input.safeParse({ rowIndex: -1 }).success).toBe(false);
    expect(CreateSlide.input.safeParse({ columnIndex: -1 }).success).toBe(false);
  });

  it("rejects non-integer rowIndex / columnIndex", () => {
    expect(CreateSlide.input.safeParse({ rowIndex: 1.5 }).success).toBe(false);
  });

  it("output is {nodeId, type: 'SLIDE'}", () => {
    expect(CreateSlide.output.safeParse({ nodeId: "sld1", type: "SLIDE" }).success).toBe(true);
  });
});

describe("CreateSlideRow schema", () => {
  it("accepts an empty object", () => {
    expect(CreateSlideRow.input.safeParse({}).success).toBe(true);
  });

  it("accepts a rowIndex", () => {
    expect(CreateSlideRow.input.safeParse({ rowIndex: 0 }).success).toBe(true);
  });

  it("rejects negative rowIndex", () => {
    expect(CreateSlideRow.input.safeParse({ rowIndex: -1 }).success).toBe(false);
  });

  it("output is {nodeId, type: 'SLIDE_ROW'}", () => {
    expect(CreateSlideRow.output.safeParse({ nodeId: "slr1", type: "SLIDE_ROW" }).success).toBe(
      true
    );
  });
});

describe("SetSlideName schema", () => {
  it("requires slideId + name", () => {
    expect(SetSlideName.input.safeParse({ slideId: "sld1", name: "Intro" }).success).toBe(true);
    expect(SetSlideName.input.safeParse({ slideId: "sld1" }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(SetSlideName.input.safeParse({ slideId: "sld1", name: "" }).success).toBe(false);
  });

  it("output returns nodeId + type", () => {
    expect(SetSlideName.output.safeParse({ nodeId: "sld1", type: "SLIDE" }).success).toBe(true);
  });
});

describe("SetSlideSkipped schema", () => {
  it("requires slideId + skipped boolean", () => {
    expect(SetSlideSkipped.input.safeParse({ slideId: "sld1", skipped: true }).success).toBe(true);
    expect(SetSlideSkipped.input.safeParse({ slideId: "sld1", skipped: false }).success).toBe(true);
    expect(SetSlideSkipped.input.safeParse({ slideId: "sld1" }).success).toBe(false);
  });

  it("rejects non-boolean skipped", () => {
    expect(SetSlideSkipped.input.safeParse({ slideId: "sld1", skipped: "yes" }).success).toBe(
      false
    );
  });
});

describe("SetSlideTransition schema", () => {
  it("accepts every documented transition style", () => {
    const styles = [
      "NONE",
      "DISSOLVE",
      "SLIDE_FROM_LEFT",
      "SLIDE_FROM_RIGHT",
      "SLIDE_FROM_TOP",
      "SLIDE_FROM_BOTTOM",
      "PUSH_FROM_LEFT",
      "PUSH_FROM_RIGHT",
      "PUSH_FROM_TOP",
      "PUSH_FROM_BOTTOM",
      "MOVE_FROM_LEFT",
      "MOVE_FROM_RIGHT",
      "MOVE_FROM_TOP",
      "MOVE_FROM_BOTTOM",
      "SLIDE_OUT_TO_LEFT",
      "SLIDE_OUT_TO_RIGHT",
      "SLIDE_OUT_TO_TOP",
      "SLIDE_OUT_TO_BOTTOM",
      "MOVE_OUT_TO_LEFT",
      "MOVE_OUT_TO_RIGHT",
      "MOVE_OUT_TO_TOP",
      "MOVE_OUT_TO_BOTTOM",
      "SMART_ANIMATE",
    ];
    for (const style of styles) {
      expect(SetSlideTransition.input.safeParse({ slideId: "sld1", style }).success).toBe(true);
    }
  });

  it("rejects unknown transition style", () => {
    expect(SetSlideTransition.input.safeParse({ slideId: "sld1", style: "MORPH" }).success).toBe(
      false
    );
  });

  it("accepts optional durationSec, curve, timingType, timingDelaySec", () => {
    expect(
      SetSlideTransition.input.safeParse({
        slideId: "sld1",
        style: "DISSOLVE",
        durationSec: 0.4,
        curve: "EASE_OUT",
        timingType: "ON_CLICK",
        timingDelaySec: 0.2,
      }).success
    ).toBe(true);
  });

  it("rejects negative durationSec / timingDelaySec", () => {
    expect(
      SetSlideTransition.input.safeParse({
        slideId: "sld1",
        style: "DISSOLVE",
        durationSec: -0.1,
      }).success
    ).toBe(false);
    expect(
      SetSlideTransition.input.safeParse({
        slideId: "sld1",
        style: "DISSOLVE",
        timingDelaySec: -1,
      }).success
    ).toBe(false);
  });

  it("rejects unknown curve", () => {
    expect(
      SetSlideTransition.input.safeParse({
        slideId: "sld1",
        style: "DISSOLVE",
        curve: "ELASTIC",
      }).success
    ).toBe(false);
  });
});

describe("SetSlideBackground schema", () => {
  it("requires slideId + paint", () => {
    expect(
      SetSlideBackground.input.safeParse({
        slideId: "sld1",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
      }).success
    ).toBe(true);
    expect(SetSlideBackground.input.safeParse({ slideId: "sld1" }).success).toBe(false);
  });

  it("requires SOLID paint type with color rgb in [0, 1]", () => {
    expect(
      SetSlideBackground.input.safeParse({
        slideId: "sld1",
        paint: { type: "GRADIENT", color: { r: 0, g: 0, b: 0 } },
      }).success
    ).toBe(false);
    expect(
      SetSlideBackground.input.safeParse({
        slideId: "sld1",
        paint: { type: "SOLID", color: { r: 1.5, g: 0, b: 0 } },
      }).success
    ).toBe(false);
  });

  it("accepts optional opacity in [0, 1]", () => {
    expect(
      SetSlideBackground.input.safeParse({
        slideId: "sld1",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.5 },
      }).success
    ).toBe(true);
    expect(
      SetSlideBackground.input.safeParse({
        slideId: "sld1",
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1.5 },
      }).success
    ).toBe(false);
  });
});

describe("MoveSlide schema", () => {
  it("requires slideId + rowIndex + columnIndex", () => {
    expect(
      MoveSlide.input.safeParse({
        slideId: "sld1",
        rowIndex: 0,
        columnIndex: 0,
      }).success
    ).toBe(true);
    expect(MoveSlide.input.safeParse({ slideId: "sld1", rowIndex: 0 }).success).toBe(false);
  });

  it("rejects negative indices", () => {
    expect(
      MoveSlide.input.safeParse({
        slideId: "sld1",
        rowIndex: -1,
        columnIndex: 0,
      }).success
    ).toBe(false);
  });

  it("output reports the slideId + new position", () => {
    expect(
      MoveSlide.output.safeParse({
        nodeId: "sld1",
        rowIndex: 0,
        columnIndex: 0,
      }).success
    ).toBe(true);
  });
});

describe("DuplicateSlide schema", () => {
  it("requires slideId", () => {
    expect(DuplicateSlide.input.safeParse({ slideId: "sld1" }).success).toBe(true);
    expect(DuplicateSlide.input.safeParse({}).success).toBe(false);
  });

  it("output returns nodeId + type", () => {
    expect(DuplicateSlide.output.safeParse({ nodeId: "sld2", type: "SLIDE" }).success).toBe(true);
  });
});

describe("DeleteSlide schema", () => {
  it("requires slideId", () => {
    expect(DeleteSlide.input.safeParse({ slideId: "sld1" }).success).toBe(true);
    expect(DeleteSlide.input.safeParse({}).success).toBe(false);
  });

  it("output is {deleted: true}", () => {
    expect(DeleteSlide.output.safeParse({ slideId: "sld1", deleted: true }).success).toBe(true);
  });
});

describe("ListSlides schema", () => {
  it("accepts an empty object (lists everything)", () => {
    expect(ListSlides.input.safeParse({}).success).toBe(true);
  });

  it("accepts a rowIndex (lists a single row)", () => {
    expect(ListSlides.input.safeParse({ rowIndex: 0 }).success).toBe(true);
  });

  it("rejects negative rowIndex", () => {
    expect(ListSlides.input.safeParse({ rowIndex: -1 }).success).toBe(false);
  });

  it("output returns nodeIds + count", () => {
    expect(ListSlides.output.safeParse({ nodeIds: ["sld1"], count: 1 }).success).toBe(true);
  });
});

describe("ListSlideRows schema", () => {
  it("accepts an empty object", () => {
    expect(ListSlideRows.input.safeParse({}).success).toBe(true);
  });

  it("output returns rowIds + count", () => {
    expect(ListSlideRows.output.safeParse({ rowIds: ["slr1"], count: 1 }).success).toBe(true);
  });
});

describe("SetActiveSlide schema", () => {
  it("requires slideId", () => {
    expect(SetActiveSlide.input.safeParse({ slideId: "sld1" }).success).toBe(true);
    expect(SetActiveSlide.input.safeParse({}).success).toBe(false);
  });
});

describe("GetSlide schema", () => {
  it("requires slideId", () => {
    expect(GetSlide.input.safeParse({ slideId: "sld1" }).success).toBe(true);
  });

  it("output captures name, isSkipped, transition, isFirst", () => {
    expect(
      GetSlide.output.safeParse({
        nodeId: "sld1",
        type: "SLIDE",
        name: "Intro",
        isSkipped: false,
        isFirst: true,
        transition: { style: "NONE", durationSec: 0.3, curve: "EASE_IN_AND_OUT" },
      }).success
    ).toBe(true);
  });
});

describe("SetSlidesView schema", () => {
  it("accepts 'grid' and 'single-slide'", () => {
    expect(SetSlidesView.input.safeParse({ view: "grid" }).success).toBe(true);
    expect(SetSlidesView.input.safeParse({ view: "single-slide" }).success).toBe(true);
  });

  it("rejects other values", () => {
    expect(SetSlidesView.input.safeParse({ view: "thumbnail" }).success).toBe(false);
  });
});

describe("GetSlideGrid schema", () => {
  it("accepts an empty object", () => {
    expect(GetSlideGrid.input.safeParse({}).success).toBe(true);
  });

  it("output is grid: string[][]", () => {
    expect(GetSlideGrid.output.safeParse({ grid: [["sld1", "sld2"], ["sld3"]] }).success).toBe(
      true
    );
    expect(GetSlideGrid.output.safeParse({ grid: [] }).success).toBe(true);
  });
});
