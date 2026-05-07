// apps/mcp-server/src/__tests__/real-figma-figjam.golden.test.ts
import { describe, it } from "vitest";

// TODO(phase 11+): Promote this to an active golden test once we settle
// on a FigJam read strategy. Options:
//
//   A) /v1/files/<key>/nodes?ids=<sticky-id> — works for individual nodes
//      but requires us to know the ids in advance, defeating the
//      "structural roundtrip" purpose Phase 9 used for design files.
//
//   B) Plugin-driven recorder — the bridge plugin captures the FigJam
//      page's structure via figma.currentPage.children and serializes
//      to a fixture. Requires a paired daemon+plugin during recording.
//
//   C) Accept that FigJam coverage is FigmaFake-only. The 10.3-10.7 unit
//      tests + the 10.11 mismatch e2e test cover correctness; the
//      manual smoke is "open the bridge plugin in a real FigJam file
//      and verify nothing throws."
//
// FIGMA_API_KEY is not relevant here yet — kept skipped unconditionally.
describe.skip("real-figma figjam golden", () => {
  it("recorded sticky/section/connector structure round-trips", () => {
    // Placeholder. See TODO above.
  });
});
