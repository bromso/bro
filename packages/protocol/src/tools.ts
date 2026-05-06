import type { z } from "zod";

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
  readonly logger: { debug(msg: string, meta?: object): void };
  readonly figmaApiKey?: string;
};

export type ServerHandler<T extends ToolDefinition> = (
  args: z.infer<T["input"]>,
  ctx: ServerHandlerContext
) => Promise<z.infer<T["output"]>>;

export type FigmaAdapterPlaceholder = unknown; // replaced in Phase 2

export type PluginHandlerContext = {
  readonly logger: { debug(msg: string, meta?: object): void };
  readonly figma: FigmaAdapterPlaceholder;
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
  readonly tools: readonly ToolDefinition[];
  readonly registerServer?: (registry: ServerRegistry) => void;
  readonly registerPlugin?: (registry: PluginRegistry) => void;
}
