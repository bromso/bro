import { describe, expect, it } from "vitest";
import { AuditContrast, AuditTargetSize } from "../tools";

describe("AuditContrast schema", () => {
  it("requires nodeId", () => {
    expect(AuditContrast.input.safeParse({ nodeId: "n1" }).success).toBe(true);
    expect(AuditContrast.input.safeParse({}).success).toBe(false);
  });

  it("rejects empty nodeId", () => {
    expect(AuditContrast.input.safeParse({ nodeId: "" }).success).toBe(false);
  });

  it("output captures ratio + AA/AAA flags + foreground/background hex", () => {
    expect(
      AuditContrast.output.safeParse({
        nodeId: "n1",
        ratio: 21,
        passesAA: true,
        passesAAA: true,
        isLargeText: false,
        foreground: "#000000",
        background: "#FFFFFF",
      }).success
    ).toBe(true);
  });

  it("output allows null background (no resolvable solid fill)", () => {
    expect(
      AuditContrast.output.safeParse({
        nodeId: "n1",
        ratio: null,
        passesAA: null,
        passesAAA: null,
        isLargeText: false,
        foreground: "#000000",
        background: null,
        reason: "no resolvable background fill",
      }).success
    ).toBe(true);
  });
});

describe("AuditTargetSize schema", () => {
  it("requires nodeId", () => {
    expect(AuditTargetSize.input.safeParse({ nodeId: "n1" }).success).toBe(true);
    expect(AuditTargetSize.input.safeParse({}).success).toBe(false);
  });

  it("output captures width/height + threshold flags", () => {
    expect(
      AuditTargetSize.output.safeParse({
        nodeId: "n1",
        width: 44,
        height: 44,
        passesMinimum: true,
        passesEnhanced: true,
      }).success
    ).toBe(true);
  });

  it("output allows null bbox (no measurable target)", () => {
    expect(
      AuditTargetSize.output.safeParse({
        nodeId: "n1",
        width: null,
        height: null,
        passesMinimum: null,
        passesEnhanced: null,
        reason: "node has no bounding box",
      }).success
    ).toBe(true);
  });
});

import { SimulateColorBlindness } from "../tools";

describe("SimulateColorBlindness schema", () => {
  it("accepts every documented type", () => {
    for (const type of ["protanopia", "deuteranopia", "tritanopia", "achromatopsia"]) {
      expect(
        SimulateColorBlindness.input.safeParse({
          hex: "#FF0000",
          type,
        }).success
      ).toBe(true);
    }
  });

  it("rejects unknown type", () => {
    expect(
      SimulateColorBlindness.input.safeParse({
        hex: "#FF0000",
        type: "rainbow",
      }).success
    ).toBe(false);
  });

  it("rejects malformed hex", () => {
    expect(
      SimulateColorBlindness.input.safeParse({
        hex: "nope",
        type: "protanopia",
      }).success
    ).toBe(false);
  });

  it("output is {simulatedHex, type}", () => {
    expect(
      SimulateColorBlindness.output.safeParse({
        simulatedHex: "#808080",
        type: "achromatopsia",
        sourceHex: "#FF0000",
      }).success
    ).toBe(true);
  });
});
