import { describe, expect, it } from "vitest";
import { start } from "../plugin";

describe("plugin-entry import smoke", () => {
  it("exports a start function", () => {
    expect(typeof start).toBe("function");
  });
});
