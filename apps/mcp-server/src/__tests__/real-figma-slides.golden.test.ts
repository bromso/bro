// apps/mcp-server/src/__tests__/real-figma-slides.golden.test.ts
import { describe, it } from "vitest";

// TODO(phase 12+): Promote this to an active golden test once we settle
// on a Slides read strategy. The Figma REST API exposes Slides files
// (the file's `children` are SECTION nodes representing slide rows, with
// SLIDE nodes nested inside as their own children), but the
// "structural roundtrip" pattern Phase 9 used for design files doesn't
// fit cleanly:
//
//   - Slides are deeply nested (file → row section → slide → slide
//     content) and use their own discriminator (`type: "SLIDE"`,
//     `type: "SLIDE_ROW"`) which the v1/files response handles via
//     ad-hoc nesting rather than a uniform shape.
//
//   - Slide-specific state (transitions, isSkipped, isFirst, the active
//     slide pointer) is not exposed by the public REST API at all —
//     it's plugin-runtime state, so a roundtrip would lose it.
//
// Options for future work:
//
//   A) /v1/files/<key>/nodes?ids=<slide-id> — works for individual
//      slides but requires us to know the ids in advance, defeating
//      the "structural roundtrip" purpose Phase 9 used for design
//      files. Also drops transition/skipped/active state.
//
//   B) Plugin-driven recorder — the bridge plugin captures the Slides
//      file's grid via figma.getSlideGrid() plus per-slide reads, and
//      serializes to a fixture. Captures the full Slides surface
//      (including transitions) but requires a paired daemon+plugin
//      during recording.
//
//   C) Accept that Slides coverage is FigmaFake-only. The 12.3–12.7
//      unit tests + the 12.10 mismatch e2e test cover correctness; the
//      manual smoke is "open the bridge plugin in a real Slides file
//      and verify nothing throws."
//
// FIGMA_API_KEY is not relevant here yet — kept skipped unconditionally.
describe.skip("real-figma slides golden", () => {
  it("recorded slide/slide-row structure round-trips", () => {
    // Placeholder. See TODO above.
  });
});
