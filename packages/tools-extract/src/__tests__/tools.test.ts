import { describe, expect, it } from "vitest";
import { BridgeStatus, ExtractComponents, ExtractLocalVariables, ExtractStyles } from "../tools";

describe("tools-extract tool definitions", () => {
  it("ExtractStyles has the expected name and shape", () => {
    expect(ExtractStyles.name).toBe("extract_styles");
    expect(ExtractStyles.streaming).toBe(false);
    // Output schema accepts a record of three style arrays
    const result = ExtractStyles.output.safeParse({
      paintStyles: [],
      textStyles: [],
      effectStyles: [],
    });
    expect(result.success).toBe(true);
  });

  it("ExtractComponents accepts no input args", () => {
    expect(ExtractComponents.input.safeParse({}).success).toBe(true);
  });

  it("ExtractLocalVariables output is { variables: Variable[] }", () => {
    const r = ExtractLocalVariables.output.safeParse({ variables: [] });
    expect(r.success).toBe(true);
  });

  it("BridgeStatus output reports daemon + plugin state", () => {
    const r = BridgeStatus.output.safeParse({
      daemon: { pid: 1234, version: "0.0.0", uptimeMs: 100 },
      plugin: { connected: false },
    });
    expect(r.success).toBe(true);
  });
});
