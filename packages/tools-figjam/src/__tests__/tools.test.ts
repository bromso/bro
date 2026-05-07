import { describe, expect, it } from "vitest";
import { CreateSection, CreateSticky } from "../tools";

describe("CreateSticky schema", () => {
  it("accepts content with optional authorName + placement", () => {
    expect(CreateSticky.input.safeParse({ content: "hi" }).success).toBe(true);
    expect(
      CreateSticky.input.safeParse({
        content: "hi",
        authorName: "J",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
      }).success
    ).toBe(true);
  });

  it("rejects empty content", () => {
    expect(CreateSticky.input.safeParse({ content: "" }).success).toBe(false);
  });

  it("output is {nodeId, type: 'STICKY'}", () => {
    expect(CreateSticky.output.safeParse({ nodeId: "stk1", type: "STICKY" }).success).toBe(true);
  });
});

describe("CreateSection schema", () => {
  it("requires name + position + dimensions", () => {
    expect(
      CreateSection.input.safeParse({
        name: "Goals",
        x: 0,
        y: 0,
        width: 400,
        height: 300,
      }).success
    ).toBe(true);
    expect(CreateSection.input.safeParse({ name: "Goals" }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(
      CreateSection.input.safeParse({
        name: "",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }).success
    ).toBe(false);
  });

  it("rejects non-positive dimensions", () => {
    expect(
      CreateSection.input.safeParse({
        name: "X",
        x: 0,
        y: 0,
        width: 0,
        height: 100,
      }).success
    ).toBe(false);
  });
});
