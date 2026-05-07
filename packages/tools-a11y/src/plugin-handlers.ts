import type { PluginHandler } from "@repo/protocol";
import type {
  AuditContrast,
  AuditTargetSize,
  GetAltText,
  GetAriaLabel,
  SetAltText,
  SetAriaLabel,
  SimulateColorBlindness,
} from "./tools";
import {
  hexToRgb,
  passesWCAG_AA,
  passesWCAG_AAA,
  simulateColorBlindness,
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

export const simulateColorBlindnessPluginHandler: PluginHandler<
  typeof SimulateColorBlindness
> = async (args, _ctx) => {
  const sourceHex = args.hex.startsWith("#")
    ? args.hex.toUpperCase()
    : `#${args.hex.toUpperCase()}`;
  const simulatedHex = simulateColorBlindness(args.hex, args.type);
  return {
    sourceHex,
    simulatedHex,
    type: args.type,
  };
};

export const setAltTextPluginHandler: PluginHandler<typeof SetAltText> = async (
  args,
  { figma }
) => {
  await figma.setNodeA11yMeta({
    nodeId: args.nodeId,
    key: "altText",
    value: args.text,
  });
  // Drop any existing categoryless annotations whose label matches a previous
  // alt text (best-effort idempotence — annotations are array-indexed, no
  // stable ids), then append the new one.
  const existing = await figma.getNodeAnnotations({ nodeId: args.nodeId });
  const filtered = existing.filter((a) => a.categoryId !== undefined);
  await figma.setNodeAnnotations({
    nodeId: args.nodeId,
    annotations: [...filtered, { label: args.text }],
  });
  return { nodeId: args.nodeId, text: args.text };
};

export const getAltTextPluginHandler: PluginHandler<typeof GetAltText> = async (
  args,
  { figma }
) => {
  const meta = await figma.getNodeA11yMeta({ nodeId: args.nodeId });
  if (meta.altText !== undefined) {
    return { nodeId: args.nodeId, text: meta.altText };
  }
  // Fallback: scan annotations for a categoryless entry.
  const annotations = await figma.getNodeAnnotations({ nodeId: args.nodeId });
  const categoryless = annotations.find(
    (a) => a.categoryId === undefined && typeof a.label === "string"
  );
  if (categoryless?.label) {
    return { nodeId: args.nodeId, text: categoryless.label };
  }
  return { nodeId: args.nodeId, text: null };
};

export const setAriaLabelPluginHandler: PluginHandler<typeof SetAriaLabel> = async (
  args,
  { figma }
) => {
  await figma.setNodeA11yMeta({
    nodeId: args.nodeId,
    key: "ariaLabel",
    value: args.label,
  });
  return { nodeId: args.nodeId, label: args.label };
};

export const getAriaLabelPluginHandler: PluginHandler<typeof GetAriaLabel> = async (
  args,
  { figma }
) => {
  const meta = await figma.getNodeA11yMeta({ nodeId: args.nodeId });
  return {
    nodeId: args.nodeId,
    label: meta.ariaLabel ?? null,
  };
};
