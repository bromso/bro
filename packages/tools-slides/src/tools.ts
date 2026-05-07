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

const SlideTransitionStyleEnum = z.enum([
  "NONE",
  "DISSOLVE",
  "SLIDE_FROM_LEFT",
  "SLIDE_FROM_RIGHT",
  "SLIDE_FROM_TOP",
  "SLIDE_FROM_BOTTOM",
  "PUSH_FROM_LEFT",
  "PUSH_FROM_RIGHT",
  "PUSH_FROM_TOP",
  "PUSH_FROM_BOTTOM",
  "MOVE_FROM_LEFT",
  "MOVE_FROM_RIGHT",
  "MOVE_FROM_TOP",
  "MOVE_FROM_BOTTOM",
  "SLIDE_OUT_TO_LEFT",
  "SLIDE_OUT_TO_RIGHT",
  "SLIDE_OUT_TO_TOP",
  "SLIDE_OUT_TO_BOTTOM",
  "MOVE_OUT_TO_LEFT",
  "MOVE_OUT_TO_RIGHT",
  "MOVE_OUT_TO_TOP",
  "MOVE_OUT_TO_BOTTOM",
  "SMART_ANIMATE",
]);

const SlideTransitionCurveEnum = z.enum([
  "EASE_IN",
  "EASE_OUT",
  "EASE_IN_AND_OUT",
  "LINEAR",
  "GENTLE",
  "QUICK",
  "BOUNCY",
  "SLOW",
]);

const SlideTransitionTimingTypeEnum = z.enum(["ON_CLICK", "AFTER_DELAY"]);

const NonNegativeNumber = z.number().nonnegative();

const NormalizedChannel = z.number().min(0).max(1);

const SolidPaintSchema = z
  .object({
    type: z.literal("SOLID"),
    color: z.object({
      r: NormalizedChannel,
      g: NormalizedChannel,
      b: NormalizedChannel,
    }),
    opacity: NormalizedChannel.optional(),
  })
  .strict();

export const SetSlideTransition = defineTool({
  name: "set_slide_transition",
  description:
    "Slides-only. Set the slide-to-slide transition (style + optional duration, curve, timing).",
  streaming: false,
  input: z
    .object({
      slideId: z.string().min(1),
      style: SlideTransitionStyleEnum,
      durationSec: NonNegativeNumber.optional(),
      curve: SlideTransitionCurveEnum.optional(),
      timingType: SlideTransitionTimingTypeEnum.optional(),
      timingDelaySec: NonNegativeNumber.optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE") }),
});

export const SetSlideBackground = defineTool({
  name: "set_slide_background",
  description:
    "Slides-only. Set the slide's background to a single SOLID paint (writes through to slide.fills).",
  streaming: false,
  input: z
    .object({
      slideId: z.string().min(1),
      paint: SolidPaintSchema,
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE") }),
});

export const MoveSlide = defineTool({
  name: "move_slide",
  description:
    "Slides-only. Move a slide to (rowIndex, columnIndex). Internally calls figma.setSlideGrid with the mutated grid.",
  streaming: false,
  input: z
    .object({
      slideId: z.string().min(1),
      rowIndex: NonNegativeInt,
      columnIndex: NonNegativeInt,
    })
    .strict(),
  output: z.object({
    nodeId: z.string(),
    rowIndex: NonNegativeInt,
    columnIndex: NonNegativeInt,
  }),
});

export const DuplicateSlide = defineTool({
  name: "duplicate_slide",
  description:
    "Slides-only. Clone a slide. The duplicate is appended after the source in the same row.",
  streaming: false,
  input: z.object({ slideId: z.string().min(1) }).strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SLIDE") }),
});

export const DeleteSlide = defineTool({
  name: "delete_slide",
  description: "Slides-only. Remove a slide from the deck.",
  streaming: false,
  input: z.object({ slideId: z.string().min(1) }).strict(),
  output: z.object({
    slideId: z.string(),
    deleted: z.literal(true),
  }),
});

const SlideTransitionSummary = z.object({
  style: SlideTransitionStyleEnum,
  durationSec: NonNegativeNumber,
  curve: SlideTransitionCurveEnum,
});

export const ListSlides = defineTool({
  name: "list_slides",
  description:
    "Slides-only. Enumerate slide ids. With no rowIndex, returns every slide; with a rowIndex, returns just that row's slides.",
  streaming: false,
  input: z
    .object({
      rowIndex: NonNegativeInt.optional(),
    })
    .strict(),
  output: z.object({
    nodeIds: z.array(z.string()),
    count: NonNegativeInt,
  }),
});

export const ListSlideRows = defineTool({
  name: "list_slide_rows",
  description: "Slides-only. Enumerate slide row ids in grid order.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({
    rowIds: z.array(z.string()),
    count: NonNegativeInt,
  }),
});

export const SetActiveSlide = defineTool({
  name: "set_active_slide",
  description:
    "Slides-only. Focus a slide (writes figma.currentPage.focusedSlide). Note: the plugin API has no scrollAndZoomIntoSlide; assigning focusedSlide is the only way to programmatically focus a slide.",
  streaming: false,
  input: z.object({ slideId: z.string().min(1) }).strict(),
  output: z.object({ slideId: z.string() }),
});

export const GetSlide = defineTool({
  name: "get_slide",
  description:
    "Slides-only. Return a structured summary of a slide: name, isSkipped, transition, isFirst.",
  streaming: false,
  input: z.object({ slideId: z.string().min(1) }).strict(),
  output: z.object({
    nodeId: z.string(),
    type: z.literal("SLIDE"),
    name: z.string(),
    isSkipped: z.boolean(),
    isFirst: z.boolean(),
    transition: SlideTransitionSummary,
  }),
});

export const SetSlidesView = defineTool({
  name: "set_slides_view",
  description:
    "Slides-only. Toggle the editor viewport mode. 'grid' shows the whole grid; 'single-slide' zooms in on the focused slide.",
  streaming: false,
  input: z
    .object({
      view: z.enum(["grid", "single-slide"]),
    })
    .strict(),
  output: z.object({ view: z.enum(["grid", "single-slide"]) }),
});

export const GetSlideGrid = defineTool({
  name: "get_slide_grid",
  description:
    "Slides-only. Return the full slide grid as a 2D array of slide ids (outer index = row).",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({
    grid: z.array(z.array(z.string())),
  }),
});
