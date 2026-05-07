import { describe, expect, it } from "vitest";
import {
  CreateEllipse,
  CreateFrame,
  CreateLine,
  CreateRectangle,
  CreateText,
  SetTextContent,
} from "../tools";

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

describe("CreateText schema", () => {
  it("requires content (non-empty)", () => {
    expect(CreateText.input.safeParse({}).success).toBe(false);
    expect(CreateText.input.safeParse({ content: "" }).success).toBe(false);
    expect(CreateText.input.safeParse({ content: "hi" }).success).toBe(true);
  });

  it("fontSize defaults to 16 in the parsed output", () => {
    const r = CreateText.input.parse({ content: "hi" });
    expect(r.fontSize).toBe(16);
  });

  it("output is {nodeId, type: 'TEXT'}", () => {
    expect(CreateText.output.safeParse({ nodeId: "t1", type: "TEXT" }).success).toBe(true);
  });
});

describe("SetTextContent schema", () => {
  it("requires nodeId + characters", () => {
    expect(SetTextContent.input.safeParse({ nodeId: "t1", characters: "x" }).success).toBe(true);
    expect(SetTextContent.input.safeParse({ nodeId: "t1" }).success).toBe(false);
  });
});
