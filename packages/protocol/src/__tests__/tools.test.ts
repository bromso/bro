import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { defineTool, type Pack, type ToolDefinition } from "../tools";

describe("defineTool", () => {
  const ExtractStyles = defineTool({
    name: "extract_styles",
    input: z.object({ fileKey: z.string() }),
    output: z.object({ styles: z.array(z.string()) }),
    streaming: false,
    description: "Extract paint/text/effect styles from a Figma file.",
  });

  it("returns a ToolDefinition with the supplied name", () => {
    expect(ExtractStyles.name).toBe("extract_styles");
  });

  it("infers Input/Output types from the schemas", () => {
    expectTypeOf<ExtractStylesInput>().toEqualTypeOf<{ fileKey: string }>();
    expectTypeOf<ExtractStylesOutput>().toEqualTypeOf<{ styles: string[] }>();
  });
});

type ExtractStylesInput = z.infer<typeof ExtractStyles.input>;
type ExtractStylesOutput = z.infer<typeof ExtractStyles.output>;

declare const ExtractStyles: ToolDefinition<
  z.ZodObject<{ fileKey: z.ZodString }>,
  z.ZodObject<{ styles: z.ZodArray<z.ZodString> }>
>;

describe("Pack interface", () => {
  it("a pack can declare empty server/plugin registers", () => {
    const empty: Pack = {
      name: "test-pack",
      tools: [],
      registerServer: () => {},
      registerPlugin: () => {},
    };
    expect(empty.name).toBe("test-pack");
  });
});
