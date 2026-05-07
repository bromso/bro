/**
 * Pure utility functions for accessibility computations.
 *
 * No runtime dependencies — every function operates on plain
 * `{r, g, b}` triplets in [0, 1] (Figma's normalized colorspace) or
 * `#RRGGBB` hex strings. The module is fully tree-shakeable.
 *
 * Sources:
 * - WCAG 2.1: https://www.w3.org/TR/WCAG21/#contrast-minimum
 * - WCAG 2.2: https://www.w3.org/TR/WCAG22/ (target size additions)
 * - Brettel et al. 1997: "Computerized simulation of color appearance
 *   for dichromats" (color-blindness simulation matrices). The
 *   transformations below use the published 3×3 RGB matrices as
 *   approximated for sRGB inputs by Machado et al. 2009. The
 *   coefficients are an industry-standard approximation (a11y
 *   reviewers will recognize them from `colorblind.js`,
 *   `colorblindness.js`, and Chromium DevTools).
 */

export interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX6_RE = /^#?[0-9a-fA-F]{6}$/;
const HEX3_RE = /^#?[0-9a-fA-F]{3}$/;

/**
 * Parse `#RRGGBB`, `#RGB`, `RRGGBB`, or `RGB` into a normalized
 * `{r, g, b}` triplet in [0, 1]. Throws on anything else.
 */
export function hexToRgb(hex: string): RGB {
  if (typeof hex !== "string") {
    throw new Error(`invalid hex: ${String(hex)}`);
  }
  let body: string;
  if (HEX6_RE.test(hex)) {
    body = hex.startsWith("#") ? hex.slice(1) : hex;
  } else if (HEX3_RE.test(hex)) {
    const s = hex.startsWith("#") ? hex.slice(1) : hex;
    body = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  } else {
    throw new Error(`invalid hex: ${hex}`);
  }
  const r = parseInt(body.slice(0, 2), 16) / 255;
  const g = parseInt(body.slice(2, 4), 16) / 255;
  const b = parseInt(body.slice(4, 6), 16) / 255;
  return { r, g, b };
}

/**
 * Format a normalized `{r, g, b}` triplet as `#RRGGBB` (uppercase).
 * Channels outside [0, 1] are clamped before rounding.
 */
export function rgbToHex(rgb: RGB): string {
  const clamp = (c: number) => Math.max(0, Math.min(1, c));
  const b8 = (c: number) =>
    Math.round(clamp(c) * 255)
      .toString(16)
      .toUpperCase()
      .padStart(2, "0");
  return `#${b8(rgb.r)}${b8(rgb.g)}${b8(rgb.b)}`;
}

/**
 * Linearize a single sRGB channel for luminance computation
 * (WCAG 2.x piecewise gamma).
 */
function linearize(c: number): number {
  if (c <= 0.03928) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Relative luminance of an sRGB color (WCAG 2.x).
 * Range: [0, 1]; pure black = 0, pure white = 1.
 */
export function relativeLuminance(rgb: RGB): number {
  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.x contrast ratio between two colors.
 * Range: [1, 21]. 1 = identical luminance, 21 = black on white.
 *
 * Symmetric: `wcagContrastRatio(a, b) === wcagContrastRatio(b, a)`.
 */
export function wcagContrastRatio(fg: RGB, bg: RGB): number {
  const Lfg = relativeLuminance(fg);
  const Lbg = relativeLuminance(bg);
  const L1 = Math.max(Lfg, Lbg);
  const L2 = Math.min(Lfg, Lbg);
  return (L1 + 0.05) / (L2 + 0.05);
}

/**
 * WCAG 2.x AA contrast threshold:
 * - 4.5:1 for normal text
 * - 3:1 for large text (≥18pt regular or ≥14pt bold)
 */
export function passesWCAG_AA(ratio: number, isLargeText: boolean): boolean {
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

/**
 * WCAG 2.x AAA contrast threshold:
 * - 7:1 for normal text
 * - 4.5:1 for large text
 */
export function passesWCAG_AAA(ratio: number, isLargeText: boolean): boolean {
  return isLargeText ? ratio >= 4.5 : ratio >= 7;
}

/**
 * WCAG 2.2 target-size minimum (Success Criterion 2.5.5):
 * 24×24 CSS pixels minimum, 44×44 enhanced.
 */
export const WCAG_TARGET_SIZE_MIN = 24;
export const WCAG_TARGET_SIZE_ENHANCED = 44;

export type ColorBlindnessType = "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia";

/**
 * Brettel-Machado simulation matrices for sRGB inputs.
 *
 * Each 3×3 matrix transforms an sRGB triplet to its simulated
 * dichromat appearance. Coefficients from Machado et al. (2009)
 * "A Physiologically-based Model for Simulation of Color Vision
 * Deficiency", Table 1 (severity 1.0 = full dichromacy).
 *
 * Note: These act on gamma-encoded sRGB directly (not linear-sRGB).
 * The error vs. a fully physically-correct simulation is small at
 * the resolutions we care about (per-pixel hex output) and the
 * approximation is what every public a11y tool uses.
 */
const SIMULATION_MATRICES: Record<ColorBlindnessType, readonly number[]> = {
  protanopia: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039,
  ],
  // Achromatopsia (full color blindness) — Rec. 709 luma weights.
  achromatopsia: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
};

/**
 * Simulate how a hex color appears under a given color-vision
 * deficiency. Returns the simulated color as `#RRGGBB` (uppercase).
 *
 * The result is not exact — the matrices are the standard sRGB
 * approximations used by `colorblindness.js`, Chrome DevTools,
 * and most a11y tools. The use case is "would this color survive
 * the deficiency at all?" — for that, the approximation is fine.
 */
export function simulateColorBlindness(hex: string, type: ColorBlindnessType): string {
  const matrix = SIMULATION_MATRICES[type];
  if (!matrix) {
    throw new Error(`unknown color-blindness type: ${type}`);
  }
  const rgb = hexToRgb(hex);
  const r = matrix[0] * rgb.r + matrix[1] * rgb.g + matrix[2] * rgb.b;
  const g = matrix[3] * rgb.r + matrix[4] * rgb.g + matrix[5] * rgb.b;
  const b = matrix[6] * rgb.r + matrix[7] * rgb.g + matrix[8] * rgb.b;
  return rgbToHex({ r, g, b });
}
