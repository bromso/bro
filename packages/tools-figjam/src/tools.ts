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

export const CreateConnector = defineTool({
  name: "create_connector",
  description:
    "FigJam-only. Create a connector linking two existing nodes by id. Both endpoints must exist.",
  streaming: false,
  input: z
    .object({
      startNodeId: z.string().min(1),
      endNodeId: z.string().min(1),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("CONNECTOR") }),
});

export const CreateCodeBlock = defineTool({
  name: "create_code_block",
  description: "FigJam-only. Create a code block with a language label (defaults to 'plaintext').",
  streaming: false,
  input: z
    .object({
      code: z.string(),
      language: z.string().min(1).default("plaintext"),
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .strict(),
  output: z.object({ nodeId: z.string(), type: z.literal("CODE_BLOCK") }),
});
