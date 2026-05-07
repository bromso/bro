import {
  ClearConsole,
  ConsoleStatusTool,
  GetConsoleErrors,
  GetConsoleLogs,
  GetConsoleWarnings,
  QueryConsole,
} from "@repo/tools-console";
import {
  CloneNode,
  CreateComponent,
  CreateEllipse,
  CreateFrame,
  CreateLine,
  CreateRectangle,
  CreateText,
  DeleteNode,
  ResizeNode,
  SetFill,
  SetStroke,
  SetTextContent,
} from "@repo/tools-design";
import { describe, expect, it } from "vitest";

describe("Phase 8 tool catalog", () => {
  it("exposes 6 console tools with the expected names", () => {
    const names = [
      GetConsoleLogs.name,
      ClearConsole.name,
      GetConsoleErrors.name,
      GetConsoleWarnings.name,
      QueryConsole.name,
      ConsoleStatusTool.name,
    ];
    expect(new Set(names).size).toBe(6);
    expect(names).toEqual([
      "get_console_logs",
      "clear_console",
      "get_console_errors",
      "get_console_warnings",
      "query_console",
      "console_status",
    ]);
  });

  it("exposes 12 design tools with the expected names", () => {
    const names = [
      CreateRectangle.name,
      CreateFrame.name,
      CreateEllipse.name,
      CreateLine.name,
      CreateText.name,
      SetTextContent.name,
      SetFill.name,
      SetStroke.name,
      ResizeNode.name,
      CloneNode.name,
      DeleteNode.name,
      CreateComponent.name,
    ];
    expect(new Set(names).size).toBe(12);
    expect(names).toEqual([
      "create_rectangle",
      "create_frame",
      "create_ellipse",
      "create_line",
      "create_text",
      "set_text_content",
      "set_fill",
      "set_stroke",
      "resize_node",
      "clone_node",
      "delete_node",
      "create_component",
    ]);
  });
});
