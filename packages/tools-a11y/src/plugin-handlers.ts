import type { A11yMetaKey } from "@repo/figma-adapter";
import type { PluginHandler } from "@repo/protocol";
import type {
  AddAnnotation,
  AuditA11ySummary,
  AuditContrast,
  AuditTargetSize,
  GetAltText,
  GetAriaLabel,
  GetLandmarkRole,
  ListAnnotations,
  RemoveAnnotation,
  SetAltText,
  SetAriaLabel,
  SetLandmarkRole,
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

export const setLandmarkRolePluginHandler: PluginHandler<typeof SetLandmarkRole> = async (
  args,
  { figma }
) => {
  await figma.setNodeA11yMeta({
    nodeId: args.nodeId,
    key: "landmarkRole" satisfies A11yMetaKey,
    value: args.role,
  });
  return { nodeId: args.nodeId, role: args.role };
};

export const getLandmarkRolePluginHandler: PluginHandler<typeof GetLandmarkRole> = async (
  args,
  { figma }
) => {
  const meta = await figma.getNodeA11yMeta({ nodeId: args.nodeId });
  // Validate the stored value against the enum — pluginData is freeform,
  // so a previous tool version (or a different plugin) might have written
  // a different string. Treat unrecognized values as null.
  const role = meta.landmarkRole;
  const allowed = [
    "banner",
    "navigation",
    "main",
    "complementary",
    "contentinfo",
    "search",
    "form",
    "region",
  ] as const;
  const normalized = (allowed as readonly string[]).includes(role ?? "")
    ? (role as (typeof allowed)[number])
    : null;
  return { nodeId: args.nodeId, role: normalized };
};

export const listAnnotationsPluginHandler: PluginHandler<typeof ListAnnotations> = async (
  args,
  { figma }
) => {
  const list = await figma.getNodeAnnotations({ nodeId: args.nodeId });
  return {
    nodeId: args.nodeId,
    annotations: list.map((a, index) => ({
      index,
      label: a.label,
      categoryId: a.categoryId,
    })),
    count: list.length,
  };
};

export const addAnnotationPluginHandler: PluginHandler<typeof AddAnnotation> = async (
  args,
  { figma }
) => {
  const existing = await figma.getNodeAnnotations({ nodeId: args.nodeId });
  const next = [
    ...existing,
    {
      label: args.label,
      ...(args.categoryId !== undefined ? { categoryId: args.categoryId } : {}),
    },
  ];
  await figma.setNodeAnnotations({
    nodeId: args.nodeId,
    annotations: next,
  });
  return {
    nodeId: args.nodeId,
    index: existing.length,
    count: next.length,
  };
};

export const removeAnnotationPluginHandler: PluginHandler<typeof RemoveAnnotation> = async (
  args,
  { figma }
) => {
  const existing = await figma.getNodeAnnotations({ nodeId: args.nodeId });
  if (args.annotationIndex >= existing.length) {
    throw new Error(
      `annotation index out of range: ${args.annotationIndex} (have ${existing.length})`
    );
  }
  const next = [
    ...existing.slice(0, args.annotationIndex),
    ...existing.slice(args.annotationIndex + 1),
  ];
  await figma.setNodeAnnotations({
    nodeId: args.nodeId,
    annotations: next,
  });
  return { nodeId: args.nodeId, count: next.length };
};

export const auditA11ySummaryPluginHandler: PluginHandler<typeof AuditA11ySummary> = async (
  args,
  { figma }
) => {
  // BFS walk.
  const queue: string[] = [args.nodeId];
  const visited = new Set<string>();
  const contrastResults: Array<{
    nodeId: string;
    ratio: number | null;
    passesAA: boolean | null;
    fg: string | null;
    bg: string | null;
  }> = [];
  const targetResults: Array<{
    nodeId: string;
    width: number | null;
    passesMinimum: boolean | null;
    passesEnhanced: boolean | null;
  }> = [];

  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (visited.has(id)) continue;
    visited.add(id);

    // Contrast (only meaningful when fg + bg both resolve). When the
    // node has a fill but no parent with a SOLID background, we skip
    // the entry rather than counting it as "unresolvable" — root-level
    // frames (which have a fill but no parent) would otherwise always
    // poison the aggregate.
    const fg = await figma.getResolvedTextFill({ nodeId: id });
    if (fg) {
      const bg = await figma.getResolvedBackground({ nodeId: id });
      if (bg) {
        const ratio = wcagContrastRatio(hexToRgb(fg.hex), hexToRgb(bg.hex));
        contrastResults.push({
          nodeId: id,
          ratio,
          passesAA: passesWCAG_AA(ratio, false),
          fg: fg.hex,
          bg: bg.hex,
        });
      }
    }

    // Target size
    const bbox = await figma.getNodeBoundingBox({ nodeId: id });
    if (bbox) {
      const min = Math.min(bbox.width, bbox.height);
      targetResults.push({
        nodeId: id,
        width: min,
        passesMinimum: min >= WCAG_TARGET_SIZE_MIN,
        passesEnhanced: min >= WCAG_TARGET_SIZE_ENHANCED,
      });
    }

    // Recurse
    if (args.recursive) {
      const children = await figma.listNodeChildren({ nodeId: id });
      for (const child of children) {
        queue.push(child);
      }
    }
  }

  // Root-level metadata (alt text / aria label / landmark role)
  const rootMeta = await figma.getNodeA11yMeta({ nodeId: args.nodeId });
  let rootAltText = rootMeta.altText;
  if (!rootAltText) {
    const annotations = await figma.getNodeAnnotations({ nodeId: args.nodeId });
    const fallback = annotations.find(
      (a) => a.categoryId === undefined && typeof a.label === "string"
    );
    if (fallback?.label) rootAltText = fallback.label;
  }

  // Aggregate
  const checks: Array<{
    name: "contrast" | "target_size" | "alt_text" | "aria_label" | "landmark_role";
    status: "ok" | "warn" | "error";
    detail: string;
  }> = [];

  // Contrast
  if (contrastResults.length === 0) {
    checks.push({
      name: "contrast",
      status: "ok",
      detail: "no text fills found in scanned nodes",
    });
  } else {
    const failures = contrastResults.filter((r) => r.passesAA === false);
    const unresolvable = contrastResults.filter((r) => r.passesAA === null);
    if (failures.length > 0) {
      const worst = failures.reduce(
        (acc, r) => (r.ratio !== null && (acc.ratio === null || r.ratio < acc.ratio) ? r : acc),
        failures[0]
      );
      checks.push({
        name: "contrast",
        status: "error",
        detail: `${failures.length}/${contrastResults.length} nodes fail WCAG AA (worst: ${(worst.ratio ?? 0).toFixed(2)}:1, ${worst.fg ?? "?"} on ${worst.bg ?? "?"})`,
      });
    } else if (unresolvable.length > 0) {
      checks.push({
        name: "contrast",
        status: "warn",
        detail: `${unresolvable.length}/${contrastResults.length} nodes have unresolvable backgrounds (gradient/transparent)`,
      });
    } else {
      checks.push({
        name: "contrast",
        status: "ok",
        detail: `${contrastResults.length}/${contrastResults.length} nodes pass WCAG AA`,
      });
    }
  }

  // Target size
  if (targetResults.length === 0) {
    checks.push({
      name: "target_size",
      status: "ok",
      detail: "no measurable nodes",
    });
  } else {
    const subMinimum = targetResults.filter((r) => r.passesMinimum === false);
    const subEnhanced = targetResults.filter((r) => r.passesEnhanced === false);
    if (subMinimum.length > 0) {
      checks.push({
        name: "target_size",
        status: "error",
        detail: `${subMinimum.length}/${targetResults.length} nodes fail WCAG 2.2 minimum (24×24)`,
      });
    } else if (subEnhanced.length > 0) {
      checks.push({
        name: "target_size",
        status: "warn",
        detail: `${subEnhanced.length}/${targetResults.length} nodes fail WCAG 2.2 enhanced (44×44)`,
      });
    } else {
      checks.push({
        name: "target_size",
        status: "ok",
        detail: `${targetResults.length}/${targetResults.length} nodes pass WCAG 2.2 enhanced`,
      });
    }
  }

  // Alt text (root only)
  if (rootAltText) {
    checks.push({
      name: "alt_text",
      status: "ok",
      detail: `alt text set: "${rootAltText.slice(0, 60)}${rootAltText.length > 60 ? "…" : ""}"`,
    });
  } else {
    checks.push({
      name: "alt_text",
      status: "warn",
      detail: "no alt text on root node",
    });
  }

  // ARIA label (root only)
  if (rootMeta.ariaLabel) {
    checks.push({
      name: "aria_label",
      status: "ok",
      detail: `aria label: "${rootMeta.ariaLabel.slice(0, 60)}"`,
    });
  } else {
    checks.push({
      name: "aria_label",
      status: "ok",
      detail: "no aria label (acceptable for non-interactive nodes)",
    });
  }

  // Landmark role (root only)
  if (rootMeta.landmarkRole) {
    checks.push({
      name: "landmark_role",
      status: "ok",
      detail: `landmark role: ${rootMeta.landmarkRole}`,
    });
  } else {
    checks.push({
      name: "landmark_role",
      status: "ok",
      detail: "no landmark role (only required on top-level page regions)",
    });
  }

  return {
    nodeId: args.nodeId,
    checks,
    nodesScanned: visited.size,
  };
};
