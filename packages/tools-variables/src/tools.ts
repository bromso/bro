import { defineTool } from "@repo/protocol";
import { z } from "zod";

const ResolvedType = z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]);

const VariableInput = z.object({
  name: z.string().min(1),
  collection: z.string().min(1),
  resolvedType: ResolvedType,
  valuesByMode: z.record(z.unknown()),
});
export type VariableInput = z.infer<typeof VariableInput>;

const InlineSource = z.object({
  kind: z.literal("inline"),
  items: z.array(VariableInput),
});

// Phase 8 will append W3C tokens JSON / CSV variants here.
const ImportSource = z.discriminatedUnion("kind", [InlineSource]);

const FailedDetail = z.object({
  index: z.number().int().nonnegative(),
  reason: z.string(),
  name: z.string().optional(),
});

const ImportSummary = z.object({
  sessionId: z.string(),
  total: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  failedDetails: z.array(FailedDetail).default([]),
});

export const ImportVariables = defineTool({
  name: "import_variables",
  description:
    "Stream variables into the current Figma file. Resumable + idempotent. Set atomic:true to roll back on first failure.",
  streaming: true,
  input: z.object({
    source: ImportSource,
    atomic: z.boolean().default(false),
    chunkSize: z.number().int().min(1).max(1000).default(100),
  }),
  output: ImportSummary,
});

const VariableSummary = z.object({
  id: z.string(),
  name: z.string(),
  resolvedType: ResolvedType,
  valuesByMode: z.record(z.unknown()),
});

export const ExportVariables = defineTool({
  name: "export_variables",
  description: "Return local variables, paginated. Pass nextCursor to resume.",
  streaming: false,
  input: z.object({
    pageSize: z.number().int().min(1).max(1000).default(100),
    cursor: z.union([z.string(), z.null()]).default(null),
  }),
  output: z.object({
    items: z.array(VariableSummary),
    nextCursor: z.union([z.string(), z.null()]),
  }),
});

export const UpdateVariablesBatch = defineTool({
  name: "update_variables_batch",
  description:
    "Apply many setValueForMode calls in one request. Non-atomic: per-item failures don't stop the rest.",
  streaming: false,
  input: z.object({
    updates: z.array(
      z.object({
        variableId: z.string(),
        modeId: z.string(),
        value: z.unknown(),
      })
    ),
  }),
  output: z.object({
    applied: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    failedDetails: z.array(FailedDetail).default([]),
  }),
});

export const StreamStatus = defineTool({
  name: "stream_status",
  description: "Report progress of an in-flight or recently-completed import session.",
  streaming: false,
  input: z.object({ sessionId: z.string() }),
  output: z.object({
    sessionId: z.string(),
    lastAckedSeq: z.number().int().nonnegative(),
    applied: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    atomic: z.boolean(),
    completed: z.boolean(),
  }),
});

export { VariableInput as VariableInputSchema };
