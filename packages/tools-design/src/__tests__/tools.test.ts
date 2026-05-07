import { describe, expect, it } from "vitest";
import { CreateEllipse, CreateFrame, CreateLine, CreateRectangle } from "../tools";

describe("CreateRectangle schema", () => {
  it("accepts width/height with optional x/y", () => {
    expect(CreateRectangle.input.safeParse({ width: 100, height: 100 }).success).toBe(true);
    expect(CreateRectangle.input.safeParse({ width: 100, height: 100, x: 1, y: 2 }).success).toBe(
      true
    );
  });

  it("rejects non-positive dimensions", () => {
    expect(CreateRectangle.input.safeParse({ width: 0, height: 0 }).success).toBe(false);
    expect(CreateRectangle.input.safeParse({ width: -1, height: 10 }).success).toBe(false);
  });

  it("output is {nodeId, type: 'RECTANGLE'}", () => {
    expect(CreateRectangle.output.safeParse({ nodeId: "r1", type: "RECTANGLE" }).success).toBe(
      true
    );
  });
});

describe("CreateFrame schema", () => {
  it("accepts an optional name", () => {
    expect(CreateFrame.input.safeParse({ width: 100, height: 100, name: "Hero" }).success).toBe(
      true
    );
  });
});

describe("CreateEllipse schema", () => {
  it("requires width/height", () => {
    expect(CreateEllipse.input.safeParse({}).success).toBe(false);
  });
});

describe("CreateLine schema", () => {
  it("requires four endpoint coordinates", () => {
    expect(CreateLine.input.safeParse({ x1: 0, y1: 0, x2: 100, y2: 0 }).success).toBe(true);
    expect(CreateLine.input.safeParse({ x1: 0, y1: 0, x2: 100 }).success).toBe(false);
  });
});
