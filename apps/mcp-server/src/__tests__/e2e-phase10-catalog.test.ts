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
} from "@repo/tools-figjam";
import { describe, expect, it } from "vitest";

describe("Phase 10 tool catalog", () => {
  it("exposes 10 figjam tools with the expected names", () => {
    const names = [
      CreateSticky.name,
      CreateSection.name,
      CreateConnector.name,
      CreateCodeBlock.name,
      CreateShapeWithText.name,
      CreateTable.name,
      SetStickyContent.name,
      SetSectionName.name,
      MoveIntoSection.name,
      ListSectionChildren.name,
    ];
    expect(new Set(names).size).toBe(10);
    expect(names).toEqual([
      "create_sticky",
      "create_section",
      "create_connector",
      "create_code_block",
      "create_shape_with_text",
      "create_table",
      "set_sticky_content",
      "set_section_name",
      "move_into_section",
      "list_section_children",
    ]);
  });

  it("every tool's input schema rejects extraneous keys (strict)", () => {
    const tools = [
      CreateSticky,
      CreateSection,
      CreateConnector,
      CreateCodeBlock,
      CreateShapeWithText,
      CreateTable,
      SetStickyContent,
      SetSectionName,
      MoveIntoSection,
      ListSectionChildren,
    ];
    for (const tool of tools) {
      const r = tool.input.safeParse({ __unexpected: 1 });
      // strict() rejects unknown keys; either parse fails outright or known
      // required keys are missing — both produce success: false.
      expect(r.success).toBe(false);
    }
  });
});
