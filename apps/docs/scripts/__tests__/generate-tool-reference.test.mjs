import { describe, expect, it } from "vitest";
import { renderToolMdx, renderPackMetaJson } from "../generate-tool-reference.mjs";

describe("renderToolMdx", () => {
  it("emits frontmatter and a <ToolReference> usage", () => {
    const out = renderToolMdx({
      pack: "tools-extract",
      name: "extract_styles",
      description: "Return all local styles.",
      streaming: false,
      inputSchema: { type: "object", properties: {} },
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
    });
    expect(out).toMatch(/^---\n/);
    expect(out).toMatch(/title: extract_styles/);
    expect(out).toMatch(/description: "Return all local styles\."/);
    expect(out).toMatch(/<ToolReference/);
    expect(out).toMatch(/pack="tools-extract"/);
    expect(out).toMatch(/name="extract_styles"/);
    expect(out).toMatch(/streaming={false}/);
  });

  it("escapes quotes in description for JSX prop", () => {
    const out = renderToolMdx({
      pack: "tools-extract",
      name: "x",
      description: 'Has "quotes" inside.',
      streaming: false,
      inputSchema: {},
      outputSchema: {},
    });
    // The description prop should escape with backslash or use HTML entity
    expect(out).toContain('description="Has \\"quotes\\" inside."');
  });

  it("multiline description is collapsed for the prop, kept in the body", () => {
    const out = renderToolMdx({
      pack: "tools-extract",
      name: "x",
      description: "First line.\n\nSecond line.",
      streaming: false,
      inputSchema: {},
      outputSchema: {},
    });
    expect(out).toContain('description="First line.');
    expect(out).toContain("Second line.");
  });
});

describe("renderPackMetaJson", () => {
  it("emits a meta.json with tool ids in the input order", () => {
    const out = renderPackMetaJson({
      pack: "tools-extract",
      title: "extract",
      tools: ["extract_styles", "extract_components", "extract_local_variables"],
    });
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      title: "extract",
      pages: ["extract_styles", "extract_components", "extract_local_variables"],
    });
  });
});
