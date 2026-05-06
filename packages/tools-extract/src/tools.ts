import { defineTool } from "@repo/protocol";
import { z } from "zod";

const StyleSummary = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

const VariableSummary = z.object({
  id: z.string(),
  name: z.string(),
  resolvedType: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]),
  valuesByMode: z.record(z.unknown()),
});

const ComponentSummary = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
  description: z.string().optional(),
});

export const ExtractStyles = defineTool({
  name: "extract_styles",
  description: "Return all local paint, text, and effect styles in the current file.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({
    paintStyles: z.array(StyleSummary),
    textStyles: z.array(StyleSummary),
    effectStyles: z.array(StyleSummary),
  }),
});

export const ExtractComponents = defineTool({
  name: "extract_components",
  description: "Return all local components.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({ components: z.array(ComponentSummary) }),
});

export const ExtractLocalVariables = defineTool({
  name: "extract_local_variables",
  description: "Return all local variables in the current file.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({ variables: z.array(VariableSummary) }),
});

export const BridgeStatus = defineTool({
  name: "bridge_status",
  description: "Report daemon liveness, version, and whether a Figma plugin is paired.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({
    daemon: z.object({
      pid: z.number().int(),
      version: z.string(),
      uptimeMs: z.number().int().nonnegative(),
    }),
    plugin: z.object({
      connected: z.boolean(),
      lastConnectedAt: z.number().int().optional(),
    }),
  }),
});
