import { describe, expect, it } from "vitest";
import {
  CreateCodeBlock,
  CreateConnector,
  CreateSection,
  CreateShapeWithText,
  CreateSticky,
  CreateTable,
  ListSectionChildren,
  MoveIntoSection,
  SetSectionName,
  SetStickyContent,
} from "../tools";

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

describe("CreateConnector schema", () => {
  it("requires both endpoints", () => {
    expect(CreateConnector.input.safeParse({ startNodeId: "a", endNodeId: "b" }).success).toBe(
      true
    );
    expect(CreateConnector.input.safeParse({ startNodeId: "a" }).success).toBe(false);
    expect(CreateConnector.input.safeParse({ endNodeId: "b" }).success).toBe(false);
  });

  it("rejects empty endpoints", () => {
    expect(CreateConnector.input.safeParse({ startNodeId: "", endNodeId: "b" }).success).toBe(
      false
    );
  });

  it("output returns nodeId + type CONNECTOR", () => {
    expect(CreateConnector.output.safeParse({ nodeId: "cn1", type: "CONNECTOR" }).success).toBe(
      true
    );
  });
});

describe("CreateCodeBlock schema", () => {
  it("requires code", () => {
    expect(CreateCodeBlock.input.safeParse({}).success).toBe(false);
    expect(CreateCodeBlock.input.safeParse({ code: "x" }).success).toBe(true);
  });

  it("language defaults to 'plaintext'", () => {
    const r = CreateCodeBlock.input.parse({ code: "x" });
    expect(r.language).toBe("plaintext");
  });
});

describe("CreateShapeWithText schema", () => {
  it("accepts each known shape variant", () => {
    const variants = [
      "square",
      "ellipse",
      "rounded_rectangle",
      "diamond",
      "triangle_up",
      "triangle_down",
      "parallelogram_right",
      "parallelogram_left",
    ];
    for (const shape of variants) {
      expect(
        CreateShapeWithText.input.safeParse({
          shape,
          content: "X",
          width: 100,
          height: 100,
        }).success
      ).toBe(true);
    }
  });

  it("rejects unknown shape values", () => {
    expect(
      CreateShapeWithText.input.safeParse({
        shape: "hexagon",
        content: "X",
        width: 100,
        height: 100,
      }).success
    ).toBe(false);
  });

  it("rejects empty content", () => {
    expect(
      CreateShapeWithText.input.safeParse({
        shape: "square",
        content: "",
        width: 100,
        height: 100,
      }).success
    ).toBe(false);
  });
});

describe("CreateTable schema", () => {
  it("requires positive integer rows + columns", () => {
    expect(
      CreateTable.input.safeParse({
        rows: 3,
        columns: 4,
        width: 400,
        height: 300,
      }).success
    ).toBe(true);
  });

  it("rejects zero or negative rows/columns", () => {
    expect(
      CreateTable.input.safeParse({
        rows: 0,
        columns: 4,
        width: 100,
        height: 100,
      }).success
    ).toBe(false);
    expect(
      CreateTable.input.safeParse({
        rows: 3,
        columns: -1,
        width: 100,
        height: 100,
      }).success
    ).toBe(false);
  });

  it("rejects non-integer rows/columns", () => {
    expect(
      CreateTable.input.safeParse({
        rows: 1.5,
        columns: 4,
        width: 100,
        height: 100,
      }).success
    ).toBe(false);
  });
});

describe("SetStickyContent schema", () => {
  it("requires nodeId + content", () => {
    expect(SetStickyContent.input.safeParse({ nodeId: "stk1", content: "x" }).success).toBe(true);
    expect(SetStickyContent.input.safeParse({ nodeId: "stk1" }).success).toBe(false);
    expect(SetStickyContent.input.safeParse({ content: "x" }).success).toBe(false);
  });

  it("rejects empty content", () => {
    expect(SetStickyContent.input.safeParse({ nodeId: "stk1", content: "" }).success).toBe(false);
  });

  it("output returns nodeId + type", () => {
    expect(SetStickyContent.output.safeParse({ nodeId: "stk1", type: "STICKY" }).success).toBe(
      true
    );
  });
});

describe("SetSectionName schema", () => {
  it("requires nodeId + name", () => {
    expect(SetSectionName.input.safeParse({ nodeId: "sec1", name: "X" }).success).toBe(true);
    expect(SetSectionName.input.safeParse({ nodeId: "sec1" }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(SetSectionName.input.safeParse({ nodeId: "sec1", name: "" }).success).toBe(false);
  });
});

describe("MoveIntoSection schema", () => {
  it("requires sectionId + nodeIds", () => {
    expect(MoveIntoSection.input.safeParse({ sectionId: "sec1", nodeIds: ["a"] }).success).toBe(
      true
    );
  });

  it("accepts an empty nodeIds array (no-op)", () => {
    expect(MoveIntoSection.input.safeParse({ sectionId: "sec1", nodeIds: [] }).success).toBe(true);
  });

  it("rejects empty sectionId", () => {
    expect(MoveIntoSection.input.safeParse({ sectionId: "", nodeIds: ["a"] }).success).toBe(false);
  });

  it("output reports moved count", () => {
    expect(MoveIntoSection.output.safeParse({ sectionId: "sec1", moved: 2 }).success).toBe(true);
  });
});

describe("ListSectionChildren schema", () => {
  it("requires sectionId", () => {
    expect(ListSectionChildren.input.safeParse({ sectionId: "sec1" }).success).toBe(true);
    expect(ListSectionChildren.input.safeParse({}).success).toBe(false);
  });

  it("output returns nodeIds + count", () => {
    expect(ListSectionChildren.output.safeParse({ nodeIds: [], count: 0 }).success).toBe(true);
    expect(ListSectionChildren.output.safeParse({ nodeIds: ["a", "b"], count: 2 }).success).toBe(
      true
    );
  });
});
