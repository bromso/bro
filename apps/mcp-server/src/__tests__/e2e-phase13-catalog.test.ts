import {
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
} from "@repo/tools-a11y";
import { describe, expect, it } from "vitest";

describe("Phase 13 tool catalog", () => {
  it("exposes 13 a11y tools with the expected names", () => {
    const names = [
      AuditContrast.name,
      AuditTargetSize.name,
      SimulateColorBlindness.name,
      SetAltText.name,
      GetAltText.name,
      SetAriaLabel.name,
      GetAriaLabel.name,
      SetLandmarkRole.name,
      GetLandmarkRole.name,
      ListAnnotations.name,
      AddAnnotation.name,
      RemoveAnnotation.name,
      AuditA11ySummary.name,
    ];
    expect(new Set(names).size).toBe(13);
    expect(names).toEqual([
      "audit_contrast",
      "audit_target_size",
      "simulate_color_blindness",
      "set_alt_text",
      "get_alt_text",
      "set_aria_label",
      "get_aria_label",
      "set_landmark_role",
      "get_landmark_role",
      "list_annotations",
      "add_annotation",
      "remove_annotation",
      "audit_a11y_summary",
    ]);
  });

  it("every tool's input schema rejects extraneous keys (strict)", () => {
    const tools = [
      AuditContrast,
      AuditTargetSize,
      SimulateColorBlindness,
      SetAltText,
      GetAltText,
      SetAriaLabel,
      GetAriaLabel,
      SetLandmarkRole,
      GetLandmarkRole,
      ListAnnotations,
      AddAnnotation,
      RemoveAnnotation,
      AuditA11ySummary,
    ];
    for (const tool of tools) {
      const r = tool.input.safeParse({ __unexpected: 1 });
      expect(r.success).toBe(false);
    }
  });
});
