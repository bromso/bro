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

import { GetAltText, GetAriaLabel, SetAltText, SetAriaLabel } from "../tools";

describe("SetAltText schema", () => {
  it("requires nodeId + text", () => {
    expect(SetAltText.input.safeParse({ nodeId: "n1", text: "Hero" }).success).toBe(true);
    expect(SetAltText.input.safeParse({ nodeId: "n1" }).success).toBe(false);
  });

  it("rejects empty text (use clear_alt_text in a follow-up if you need that)", () => {
    expect(SetAltText.input.safeParse({ nodeId: "n1", text: "" }).success).toBe(false);
  });

  it("output reports nodeId + the stored text", () => {
    expect(SetAltText.output.safeParse({ nodeId: "n1", text: "Hero" }).success).toBe(true);
  });
});

describe("GetAltText schema", () => {
  it("requires nodeId", () => {
    expect(GetAltText.input.safeParse({ nodeId: "n1" }).success).toBe(true);
  });

  it("output allows null text", () => {
    expect(GetAltText.output.safeParse({ nodeId: "n1", text: null }).success).toBe(true);
    expect(GetAltText.output.safeParse({ nodeId: "n1", text: "Hero" }).success).toBe(true);
  });
});

describe("SetAriaLabel schema", () => {
  it("requires nodeId + label", () => {
    expect(SetAriaLabel.input.safeParse({ nodeId: "n1", label: "Submit" }).success).toBe(true);
    expect(SetAriaLabel.input.safeParse({ nodeId: "n1" }).success).toBe(false);
  });
});

describe("GetAriaLabel schema", () => {
  it("requires nodeId", () => {
    expect(GetAriaLabel.input.safeParse({ nodeId: "n1" }).success).toBe(true);
  });

  it("output allows null label", () => {
    expect(GetAriaLabel.output.safeParse({ nodeId: "n1", label: null }).success).toBe(true);
  });
});

import { GetLandmarkRole, SetLandmarkRole } from "../tools";

describe("SetLandmarkRole schema", () => {
  it("accepts every WAI-ARIA landmark role", () => {
    for (const role of [
      "banner",
      "navigation",
      "main",
      "complementary",
      "contentinfo",
      "search",
      "form",
      "region",
    ]) {
      expect(SetLandmarkRole.input.safeParse({ nodeId: "n1", role }).success).toBe(true);
    }
  });

  it("rejects unknown role", () => {
    expect(SetLandmarkRole.input.safeParse({ nodeId: "n1", role: "header" }).success).toBe(false);
  });

  it("requires nodeId + role", () => {
    expect(SetLandmarkRole.input.safeParse({ nodeId: "n1" }).success).toBe(false);
    expect(SetLandmarkRole.input.safeParse({ role: "main" }).success).toBe(false);
  });
});

describe("GetLandmarkRole schema", () => {
  it("output allows null role", () => {
    expect(GetLandmarkRole.output.safeParse({ nodeId: "n1", role: null }).success).toBe(true);
    expect(GetLandmarkRole.output.safeParse({ nodeId: "n1", role: "main" }).success).toBe(true);
  });
});
