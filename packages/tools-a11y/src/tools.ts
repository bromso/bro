import { defineTool } from "@repo/protocol";
import { z } from "zod";

const NodeId = z.string().min(1);
const HexColor = z.string().regex(/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/);

export const AuditContrast = defineTool({
  name: "audit_contrast",
  description:
    "WCAG 2.x contrast audit. Computes the contrast ratio between the node's first SOLID text fill and the first SOLID fill on its ancestors (resolved background). Returns AA / AAA pass/fail flags. Returns null ratio when fill or background is unresolvable (e.g. mixed fills, gradient background, no parent with a solid fill).",
  streaming: false,
  input: z.object({ nodeId: NodeId }).strict(),
  output: z.object({
    nodeId: z.string(),
    ratio: z.number().nullable(),
    passesAA: z.boolean().nullable(),
    passesAAA: z.boolean().nullable(),
    isLargeText: z.boolean(),
    foreground: HexColor.nullable(),
    background: HexColor.nullable(),
    reason: z.string().optional(),
  }),
});

export const AuditTargetSize = defineTool({
  name: "audit_target_size",
  description:
    "WCAG 2.2 target-size audit (Success Criterion 2.5.5). Reads node.absoluteBoundingBox and reports whether min(width, height) is ≥ 24 (passesMinimum) and ≥ 44 (passesEnhanced).",
  streaming: false,
  input: z.object({ nodeId: NodeId }).strict(),
  output: z.object({
    nodeId: z.string(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    passesMinimum: z.boolean().nullable(),
    passesEnhanced: z.boolean().nullable(),
    reason: z.string().optional(),
  }),
});

const ColorBlindnessType = z.enum(["protanopia", "deuteranopia", "tritanopia", "achromatopsia"]);

export const SimulateColorBlindness = defineTool({
  name: "simulate_color_blindness",
  description:
    "Simulate how a hex color appears to a viewer with the named color-vision deficiency. Pure computation — does not touch the design. Useful for the LLM to check whether a brand color survives the deficiency before accepting it.",
  streaming: false,
  input: z
    .object({
      hex: z.string().regex(/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/),
      type: ColorBlindnessType,
    })
    .strict(),
  output: z.object({
    sourceHex: z.string(),
    simulatedHex: z.string(),
    type: ColorBlindnessType,
  }),
});

export const SetAltText = defineTool({
  name: "set_alt_text",
  description:
    "Write alt text for a node. Stored in pluginData under `a11y/altText` AND attached as an annotation (categoryless) so the alt text is visible in Figma's annotation panel. Overwrites any existing alt text. Idempotent — calling again with a new value replaces both the pluginData entry and the existing annotation.",
  streaming: false,
  input: z
    .object({
      nodeId: NodeId,
      text: z.string().min(1),
    })
    .strict(),
  output: z.object({
    nodeId: z.string(),
    text: z.string(),
  }),
});

export const GetAltText = defineTool({
  name: "get_alt_text",
  description:
    "Read alt text for a node. First checks pluginData (`a11y/altText`); if absent, falls back to the first annotation whose category is the alt-text category (or, in this implementation, the first categoryless annotation). Returns null if neither source has a value.",
  streaming: false,
  input: z.object({ nodeId: NodeId }).strict(),
  output: z.object({
    nodeId: z.string(),
    text: z.string().nullable(),
  }),
});

export const SetAriaLabel = defineTool({
  name: "set_aria_label",
  description:
    "Write an ARIA label for a node. Stored in pluginData under `a11y/ariaLabel`. Does NOT attach an annotation (ARIA labels are usually shorter than alt text and clutter the annotation panel; designers can still surface them via `audit_a11y_summary`).",
  streaming: false,
  input: z
    .object({
      nodeId: NodeId,
      label: z.string().min(1),
    })
    .strict(),
  output: z.object({
    nodeId: z.string(),
    label: z.string(),
  }),
});

export const GetAriaLabel = defineTool({
  name: "get_aria_label",
  description: "Read the ARIA label for a node. Returns null if not set.",
  streaming: false,
  input: z.object({ nodeId: NodeId }).strict(),
  output: z.object({
    nodeId: z.string(),
    label: z.string().nullable(),
  }),
});
