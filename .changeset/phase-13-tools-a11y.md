---
"@bromso/figma-mcp": minor
"@repo/tools-a11y": minor
"@repo/figma-adapter": minor
---

Phase 13: tools-a11y pack.

A new tool pack ships, bringing the registry from ~68 to ~81 tools.
This is the last pack from the original roadmap.

`@repo/tools-a11y` (new): 13 tools for accessibility audits and annotations.

- Audits: `audit_contrast`, `audit_target_size`, `audit_a11y_summary`.
- Pure utility: `simulate_color_blindness`.
- Metadata: `set_alt_text`, `get_alt_text`, `set_aria_label`, `get_aria_label`,
  `set_landmark_role`, `get_landmark_role`.
- Annotation CRUD: `list_annotations`, `add_annotation`, `remove_annotation`.

Unlike `@repo/tools-figjam` (Phase 10) and `@repo/tools-slides` (Phase 12),
the a11y pack is NOT editor-type-gated. WCAG audits, alt text, ARIA
labels, landmark roles, and annotations are universal across Figma
Design and FigJam files. A wire-level cross-editor test asserts both
editors succeed.

WCAG version: 2.2 thresholds. Contrast: 4.5:1 normal / 3:1 large for
AA; 7:1 normal / 4.5:1 large for AAA. Target size: 24×24 minimum,
44×44 enhanced (Success Criterion 2.5.5).

Color-blindness simulation: Brettel-Machado matrices for sRGB, with
greyscale (Rec. 709 luma) for achromatopsia. Approximation; matches
output of `colorblindness.js`, Chrome DevTools, and other industry
tools.

`@repo/figma-adapter` (extended): adds the `Annotation`, `A11yMetaKey`,
`NodeA11yMeta`, `ResolvedFill`, `NodeBoundingBox` types plus 8 new
methods (`getNodeA11yMeta`, `setNodeA11yMeta`, `getNodeAnnotations`,
`setNodeAnnotations`, `getResolvedTextFill`, `getResolvedBackground`,
`getNodeBoundingBox`, `listNodeChildren`). `FigmaFake` mirrors all
methods with deterministic in-memory storage; `RealFigmaAdapter`
wraps `figma.getNodeByIdAsync` plus `node.setPluginData`,
`node.getPluginData`, `node.annotations`, `node.absoluteBoundingBox`,
`node.parent`, and `node.children`.

The adapter methods do NOT enforce any editor-type discriminator —
the a11y pack is universal.

Out of scope: native Figma a11y audit (no plugin API); screen-reader
simulation; ARIA role/state inference; APCA contrast formula
(WCAG 3.0); auto-fix tools (Phase 14+). Real-figma golden coverage
is also out of scope (annotations + pluginData are not exposed via
the REST `/v1/files` endpoint).

Deferred: Phase 7 Windows IPC fix; Phase 8 query_console regex DoS
hardening; Phase 11 doctor figma-api-key check.
