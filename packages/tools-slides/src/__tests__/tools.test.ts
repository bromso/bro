import { describe, expect, it } from "vitest";
import { CreateSlide, CreateSlideRow } from "../tools";

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
