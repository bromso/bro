import type { FigmaAdapter } from "@repo/figma-adapter";
import type { FigmaApi } from "@repo/figma-api-client";
import type { z } from "zod";

export interface Logger {
  debug(msg: string, meta?: object): void;
  info(msg: string, meta?: object): void;
  warn(msg: string, meta?: object): void;
  error(msg: string, meta?: object): void;
}

export interface ToolDefinition<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly name: string;
  readonly input: TInput;
  readonly output: TOutput;
  readonly streaming: boolean;
  readonly description: string;
}

export function defineTool<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
  definition: ToolDefinition<TInput, TOutput>
): ToolDefinition<TInput, TOutput> {
  return definition;
}

export type ServerHandlerContext = {
  readonly logger: Logger;
  /**
   * Phase 11+: typed Figma REST client. `null` when the daemon was
   * started without `FIGMA_API_KEY`. REST tools call `requireApiKey()`
   * to surface `E_FIGMA_API_KEY_MISSING` cleanly.
   */
  readonly figmaApi?: FigmaApi | null;
  /**
   * @deprecated Phase 1 placeholder; superseded by `figmaApi` in Phase 11.
   * One phase of overlap so any third-party server-handler still using
   * the raw key has a migration window. To be removed in Phase 12+.
   */
  readonly figmaApiKey?: string;
};

export type ServerHandler<T extends ToolDefinition> = (
  args: z.infer<T["input"]>,
  ctx: ServerHandlerContext
) => Promise<z.infer<T["output"]>>;

export type PluginHandlerContext = {
  readonly logger: Logger;
  readonly figma: FigmaAdapter;
};

export type PluginHandler<T extends ToolDefinition> = (
  args: z.infer<T["input"]>,
  ctx: PluginHandlerContext
) => Promise<z.infer<T["output"]>>;

export interface ServerRegistry {
  register<T extends ToolDefinition>(tool: T, handler: ServerHandler<T>): void;
}

export interface PluginRegistry {
  register<T extends ToolDefinition>(tool: T, handler: PluginHandler<T>): void;
}

export interface Pack {
  readonly name: string;
  /**
   * Heterogeneous array of tool definitions. Generic parameters are
   * erased here (`ToolDefinition` defaults to `z.ZodTypeAny`) because
   * each tool has different input/output schemas. The intended
   * consumers are `registerServer` / `registerPlugin`, which call
   * `registry.register(tool, handler)` and recover the per-tool
   * generics there. Direct iteration of `pack.tools` should not assume
   * typed input/output access.
   */
  readonly tools: readonly ToolDefinition[];
  readonly registerServer?: (registry: ServerRegistry) => void;
  readonly registerPlugin?: (registry: PluginRegistry) => void;
}
