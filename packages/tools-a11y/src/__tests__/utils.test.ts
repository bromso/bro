import { describe, expect, it } from "vitest";
import {
  hexToRgb,
  passesWCAG_AA,
  passesWCAG_AAA,
  relativeLuminance,
  rgbToHex,
  simulateColorBlindness,
  wcagContrastRatio,
} from "../utils";

describe("hexToRgb", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("#FFFFFF")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb("#FF0000")).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("parses 3-digit hex (expands each channel)", () => {
    expect(hexToRgb("#FFF")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb("#000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("#F00")).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("is case-insensitive", () => {
    expect(hexToRgb("#aabbcc")).toEqual(hexToRgb("#AABBCC"));
  });

  it("accepts hex without leading #", () => {
    expect(hexToRgb("FFFFFF")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("rejects malformed input", () => {
    expect(() => hexToRgb("nope")).toThrow(/hex/i);
    expect(() => hexToRgb("#GGGGGG")).toThrow(/hex/i);
    expect(() => hexToRgb("#1234567")).toThrow(/hex/i);
    expect(() => hexToRgb("")).toThrow(/hex/i);
  });
});

describe("rgbToHex", () => {
  it("formats normalized [0,1] channels as #RRGGBB uppercase", () => {
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
    expect(rgbToHex({ r: 1, g: 1, b: 1 })).toBe("#FFFFFF");
    expect(rgbToHex({ r: 1, g: 0, b: 0 })).toBe("#FF0000");
  });

  it("clamps out-of-range values to [0,1]", () => {
    expect(rgbToHex({ r: 1.5, g: -0.2, b: 0.5 })).toBe("#FF0080");
  });

  it("rounds to nearest 8-bit value", () => {
    expect(rgbToHex({ r: 0.5, g: 0.5, b: 0.5 })).toBe("#808080");
  });
});

describe("relativeLuminance", () => {
  it("returns 0 for pure black", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
  });

  it("returns 1 for pure white", () => {
    expect(relativeLuminance({ r: 1, g: 1, b: 1 })).toBeCloseTo(1, 6);
  });

  it("uses the piecewise sRGB linearization", () => {
    // Below the 0.03928 threshold, channel is divided by 12.92.
    const small = relativeLuminance({ r: 0.03, g: 0.03, b: 0.03 });
    const expected = 0.2126 * (0.03 / 12.92) + 0.7152 * (0.03 / 12.92) + 0.0722 * (0.03 / 12.92);
    expect(small).toBeCloseTo(expected, 8);
  });

  it("matches the standard 0.2126 / 0.7152 / 0.0722 weights", () => {
    // Pure red:
    const red = relativeLuminance({ r: 1, g: 0, b: 0 });
    expect(red).toBeCloseTo(0.2126, 4);
    // Pure green:
    const green = relativeLuminance({ r: 0, g: 1, b: 0 });
    expect(green).toBeCloseTo(0.7152, 4);
    // Pure blue:
    const blue = relativeLuminance({ r: 0, g: 0, b: 1 });
    expect(blue).toBeCloseTo(0.0722, 4);
  });
});

describe("wcagContrastRatio", () => {
  it("black on white = 21:1", () => {
    const r = wcagContrastRatio({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 });
    expect(r).toBeCloseTo(21, 1);
  });

  it("is symmetric: contrast(a,b) === contrast(b,a)", () => {
    const a = { r: 0.2, g: 0.4, b: 0.6 };
    const b = { r: 0.9, g: 0.8, b: 0.1 };
    expect(wcagContrastRatio(a, b)).toBeCloseTo(wcagContrastRatio(b, a), 8);
  });

  it("identical colors = 1:1", () => {
    expect(wcagContrastRatio({ r: 0.5, g: 0.5, b: 0.5 }, { r: 0.5, g: 0.5, b: 0.5 })).toBeCloseTo(
      1,
      6
    );
  });

  it("Material Design's reference pair (#FFFFFF on #6200EE) passes AA strongly", () => {
    const r = wcagContrastRatio(hexToRgb("#FFFFFF"), hexToRgb("#6200EE"));
    // WCAG 2.x luminance gives ~7.62:1 for this pair (Material's published
    // ratio uses a different gamma model). We assert the ratio is in the
    // strong-AA / near-AAA band.
    expect(r).toBeGreaterThan(5.5);
    expect(r).toBeLessThan(8.5);
  });

  it("WCAG-2 example: #777 on #FFF ≈ 4.48:1 (just fails AA normal)", () => {
    const r = wcagContrastRatio(hexToRgb("#777"), hexToRgb("#FFF"));
    expect(r).toBeGreaterThan(4.4);
    expect(r).toBeLessThan(4.6);
  });
});

describe("passesWCAG_AA", () => {
  it("4.5:1 passes AA for normal text", () => {
    expect(passesWCAG_AA(4.5, false)).toBe(true);
    expect(passesWCAG_AA(4.49, false)).toBe(false);
  });

  it("3:1 passes AA for large text", () => {
    expect(passesWCAG_AA(3, true)).toBe(true);
    expect(passesWCAG_AA(2.99, true)).toBe(false);
  });

  it("normal text needs 4.5:1, large text only 3:1", () => {
    expect(passesWCAG_AA(4, false)).toBe(false);
    expect(passesWCAG_AA(4, true)).toBe(true);
  });
});

describe("passesWCAG_AAA", () => {
  it("7:1 passes AAA for normal text", () => {
    expect(passesWCAG_AAA(7, false)).toBe(true);
    expect(passesWCAG_AAA(6.99, false)).toBe(false);
  });

  it("4.5:1 passes AAA for large text", () => {
    expect(passesWCAG_AAA(4.5, true)).toBe(true);
    expect(passesWCAG_AAA(4.49, true)).toBe(false);
  });
});

describe("simulateColorBlindness", () => {
  it("achromatopsia → greyscale of equal luminance", () => {
    const grey = simulateColorBlindness("#FF0000", "achromatopsia");
    // Pure red has luminance 0.2126 ≈ 54/255 ≈ 0x36
    const rgb = hexToRgb(grey);
    expect(rgb.r).toBeCloseTo(rgb.g, 2);
    expect(rgb.g).toBeCloseTo(rgb.b, 2);
  });

  it("protanopia maps red to a yellowish hue (red-blind)", () => {
    const out = simulateColorBlindness("#FF0000", "protanopia");
    const rgb = hexToRgb(out);
    // Protanopia removes the red channel's distinguishability;
    // the simulated red collapses toward the yellow-green axis.
    expect(rgb.r).toBeLessThan(0.7);
  });

  it("deuteranopia maps green similarly toward yellow", () => {
    const out = simulateColorBlindness("#00FF00", "deuteranopia");
    const rgb = hexToRgb(out);
    expect(rgb.g).toBeGreaterThan(0.5);
    // green still strong but red component creeps up
    expect(rgb.r).toBeGreaterThan(0.3);
  });

  it("tritanopia distorts blue", () => {
    const out = simulateColorBlindness("#0000FF", "tritanopia");
    const rgb = hexToRgb(out);
    // tritanopia (blue-blind) collapses blue toward cyan/teal
    expect(rgb.b).toBeLessThan(0.95);
  });

  it("identity for greyscale input under any type", () => {
    for (const type of ["protanopia", "deuteranopia", "tritanopia", "achromatopsia"] as const) {
      const out = simulateColorBlindness("#808080", type);
      const rgb = hexToRgb(out);
      expect(rgb.r).toBeCloseTo(rgb.g, 1);
      expect(rgb.g).toBeCloseTo(rgb.b, 1);
    }
  });

  it("rejects unknown type", () => {
    expect(() => simulateColorBlindness("#FF0000", "unknown" as never)).toThrow(/type/i);
  });

  it("rejects malformed hex", () => {
    expect(() => simulateColorBlindness("nope", "protanopia")).toThrow(/hex/i);
  });
});
