import { defineTool } from "@repo/protocol";
import { z } from "zod";

const PositiveDimension = z.number().positive();

export const CreateSticky = defineTool({
  name: "create_sticky",
  description:
    "FigJam-only. Create a sticky note with the given content (and optional author name).",
  streaming: false,
  input: z
    .object({
      content: z.string().min(1),
      authorName: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: PositiveDimension.optional(),
      height: PositiveDimension.optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("STICKY") }),
});

export const CreateSection = defineTool({
  name: "create_section",
  description: "FigJam-only. Create a labeled section that can group nodes.",
  streaming: false,
  input: z
    .object({
      name: z.string().min(1),
      x: z.number(),
      y: z.number(),
      width: PositiveDimension,
      height: PositiveDimension,
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("SECTION") }),
});
