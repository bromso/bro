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

export const SetSlideName = defineTool({
  name: "set_slide_name",
  description:
    "Slides-only. Set the slide's title (the slide's name). Slides have no separate title placeholder; the BaseFrameMixin name IS the title surface.",
  streaming: false,
  input: z
    .object({
      slideId: z.string().min(1),
      name: z.string().min(1),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE") }),
});

export const SetSlideSkipped = defineTool({
  name: "set_slide_skipped",
  description:
    "Slides-only. Toggle whether a slide is skipped during presentation playback (slide.isSkippedSlide). This is the only slide-level metadata flag the plugin API exposes.",
  streaming: false,
  input: z
    .object({
      slideId: z.string().min(1),
      skipped: z.boolean(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE") }),
});
