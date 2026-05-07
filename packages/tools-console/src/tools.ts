import { defineTool } from "@repo/protocol";
import { z } from "zod";

const ConsoleLevel = z.enum(["log", "warn", "error", "info"]);

const ConsoleEntry = z.object({
  level: ConsoleLevel,
  message: z.string(),
  timestamp: z.number().int().nonnegative(),
});

export const GetConsoleLogs = defineTool({
  name: "get_console_logs",
  description: "Return recent console entries from the Figma plugin sandbox (all levels).",
  streaming: false,
  input: z.object({ limit: z.number().int().min(1).max(1000).optional() }).strict(),
  output: z.object({ entries: z.array(ConsoleEntry) }),
});

export const ClearConsole = defineTool({
  name: "clear_console",
  description: "Clear the captured console buffer; returns how many entries were dropped.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({ cleared: z.number().int().nonnegative() }),
});

export const GetConsoleErrors = defineTool({
  name: "get_console_errors",
  description: "Return recent console entries at level=error only.",
  streaming: false,
  input: z.object({ limit: z.number().int().min(1).max(1000).optional() }).strict(),
  output: z.object({ entries: z.array(ConsoleEntry) }),
});

export const GetConsoleWarnings = defineTool({
  name: "get_console_warnings",
  description: "Return recent console entries at level=warn only.",
  streaming: false,
  input: z.object({ limit: z.number().int().min(1).max(1000).optional() }).strict(),
  output: z.object({ entries: z.array(ConsoleEntry) }),
});

export const QueryConsole = defineTool({
  name: "query_console",
  description:
    "Filter captured console entries by JS regex on the message text. Pattern compiled with no flags.",
  streaming: false,
  input: z
    .object({
      pattern: z.string().min(1),
      limit: z.number().int().min(1).max(1000).optional(),
    })
    .strict(),
  output: z.object({ entries: z.array(ConsoleEntry) }),
});

export const ConsoleStatusTool = defineTool({
  name: "console_status",
  description: "Report buffer statistics: total, per-level counts, and dropped (overflowed) count.",
  streaming: false,
  input: z.object({}).strict(),
  output: z.object({
    total: z.number().int().nonnegative(),
    byLevel: z.object({
      log: z.number().int().nonnegative(),
      warn: z.number().int().nonnegative(),
      error: z.number().int().nonnegative(),
      info: z.number().int().nonnegative(),
    }),
    droppedCount: z.number().int().nonnegative(),
  }),
});
