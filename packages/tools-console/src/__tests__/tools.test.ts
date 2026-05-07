import { describe, expect, it } from "vitest";
import {
  ClearConsole,
  ConsoleStatusTool,
  GetConsoleErrors,
  GetConsoleLogs,
  QueryConsole,
} from "../tools";

describe("GetConsoleLogs schema", () => {
  it("accepts an empty input or a limit", () => {
    expect(GetConsoleLogs.input.safeParse({}).success).toBe(true);
    expect(GetConsoleLogs.input.safeParse({ limit: 50 }).success).toBe(true);
  });

  it("rejects negative limits", () => {
    expect(GetConsoleLogs.input.safeParse({ limit: -1 }).success).toBe(false);
  });

  it("output shape contains entries[]", () => {
    const r = GetConsoleLogs.output.safeParse({ entries: [] });
    expect(r.success).toBe(true);
  });
});

describe("ClearConsole schema", () => {
  it("input is empty object", () => {
    expect(ClearConsole.input.safeParse({}).success).toBe(true);
    expect(ClearConsole.input.safeParse({ extra: 1 }).success).toBe(false);
  });

  it("output reports cleared count", () => {
    expect(ClearConsole.output.safeParse({ cleared: 0 }).success).toBe(true);
  });
});

describe("GetConsoleErrors schema", () => {
  it("output entries are level=error", () => {
    const ok = GetConsoleErrors.output.safeParse({
      entries: [{ level: "error", message: "boom", timestamp: 1 }],
    });
    expect(ok.success).toBe(true);
  });
});

describe("QueryConsole schema", () => {
  it("requires pattern (string)", () => {
    expect(QueryConsole.input.safeParse({}).success).toBe(false);
    expect(QueryConsole.input.safeParse({ pattern: "foo" }).success).toBe(true);
  });

  it("rejects empty pattern", () => {
    expect(QueryConsole.input.safeParse({ pattern: "" }).success).toBe(false);
  });
});

describe("ConsoleStatus schema", () => {
  it("output shape includes total/byLevel/droppedCount", () => {
    expect(
      ConsoleStatusTool.output.safeParse({
        total: 0,
        byLevel: { log: 0, warn: 0, error: 0, info: 0 },
        droppedCount: 0,
      }).success
    ).toBe(true);
  });

  it("rejects missing byLevel keys", () => {
    expect(
      ConsoleStatusTool.output.safeParse({
        total: 0,
        byLevel: { log: 0 },
        droppedCount: 0,
      }).success
    ).toBe(false);
  });
});
