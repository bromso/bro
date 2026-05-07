import type { PluginHandler } from "@repo/protocol";
import type { AuditContrast, AuditTargetSize } from "./tools";
import {
  hexToRgb,
  passesWCAG_AA,
  passesWCAG_AAA,
  WCAG_TARGET_SIZE_ENHANCED,
  WCAG_TARGET_SIZE_MIN,
  wcagContrastRatio,
} from "./utils";

export const auditContrastPluginHandler: PluginHandler<typeof AuditContrast> = async (
  args,
  { figma }
) => {
  // Validate the node exists; throws "not found" on bad id.
  const fg = await figma.getResolvedTextFill({ nodeId: args.nodeId });
  // We don't have a way to detect "large text" from the node alone yet
  // (would need fontSize + fontWeight). Default to false; future tools
  // can pass it in from the caller.
  const isLargeText = false;

  if (!fg) {
    return {
      nodeId: args.nodeId,
      ratio: null,
      passesAA: null,
      passesAAA: null,
      isLargeText,
      foreground: null,
      background: null,
      reason: "node has no SOLID text fill",
    };
  }

  const bg = await figma.getResolvedBackground({ nodeId: args.nodeId });
  if (!bg) {
    return {
      nodeId: args.nodeId,
      ratio: null,
      passesAA: null,
      passesAAA: null,
      isLargeText,
      foreground: fg.hex,
      background: null,
      reason: "no resolvable background fill on ancestors",
    };
  }

  const ratio = wcagContrastRatio(hexToRgb(fg.hex), hexToRgb(bg.hex));
  return {
    nodeId: args.nodeId,
    ratio,
    passesAA: passesWCAG_AA(ratio, isLargeText),
    passesAAA: passesWCAG_AAA(ratio, isLargeText),
    isLargeText,
    foreground: fg.hex,
    background: bg.hex,
  };
};

export const auditTargetSizePluginHandler: PluginHandler<typeof AuditTargetSize> = async (
  args,
  { figma }
) => {
  const bbox = await figma.getNodeBoundingBox({ nodeId: args.nodeId });
  if (!bbox) {
    return {
      nodeId: args.nodeId,
      width: null,
      height: null,
      passesMinimum: null,
      passesEnhanced: null,
      reason: "node has no bounding box",
    };
  }
  const min = Math.min(bbox.width, bbox.height);
  return {
    nodeId: args.nodeId,
    width: bbox.width,
    height: bbox.height,
    passesMinimum: min >= WCAG_TARGET_SIZE_MIN,
    passesEnhanced: min >= WCAG_TARGET_SIZE_ENHANCED,
  };
};
