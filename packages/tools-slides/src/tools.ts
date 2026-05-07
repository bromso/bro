import { defineTool } from "@repo/protocol";
import { z } from "zod";

const NonNegativeInt = z.number().int().nonnegative();

export const CreateSlide = defineTool({
  name: "create_slide",
  description:
    "Slides-only. Create a slide. By default, appended to the end of the last row. Pass rowIndex/columnIndex to place explicitly.",
  streaming: false,
  input: z
    .object({
      name: z.string().min(1).optional(),
      rowIndex: NonNegativeInt.optional(),
      columnIndex: NonNegativeInt.optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE") }),
});

export const CreateSlideRow = defineTool({
  name: "create_slide_row",
  description:
    "Slides-only. Create a slide row. By default, appended to the end of the slide grid.",
  streaming: false,
  input: z
    .object({
      rowIndex: NonNegativeInt.optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE_ROW") }),
});
