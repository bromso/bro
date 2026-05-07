import { defineTool } from "@repo/protocol";
import { z } from "zod";

const PositiveDimension = z.number().positive();

export const CreateRectangle = defineTool({
  name: "create_rectangle",
  description: "Create a rectangle node on the current page.",
  streaming: false,
  input: z
    .object({
      width: PositiveDimension,
      height: PositiveDimension,
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("RECTANGLE") }),
});

export const CreateFrame = defineTool({
  name: "create_frame",
  description: "Create a frame (auto-layout-capable container) on the current page.",
  streaming: false,
  input: z
    .object({
      width: PositiveDimension,
      height: PositiveDimension,
      x: z.number().optional(),
      y: z.number().optional(),
      name: z.string().optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("FRAME") }),
});

export const CreateEllipse = defineTool({
  name: "create_ellipse",
  description: "Create an ellipse node on the current page.",
  streaming: false,
  input: z
    .object({
      width: PositiveDimension,
      height: PositiveDimension,
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("ELLIPSE") }),
});

export const CreateLine = defineTool({
  name: "create_line",
  description: "Create a line node defined by two endpoint coordinates.",
  streaming: false,
  input: z
    .object({
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("LINE") }),
});

export const CreateText = defineTool({
  name: "create_text",
  description: "Create a text node with the given characters and (optional) font size.",
  streaming: false,
  input: z
    .object({
      content: z.string().min(1),
      fontSize: z.number().positive().default(16),
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("TEXT") }),
});

export const SetTextContent = defineTool({
  name: "set_text_content",
  description: "Replace the characters of an existing TEXT node.",
  streaming: false,
  input: z
    .object({
      nodeId: z.string().min(1),
      characters: z.string(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("TEXT") }),
});
