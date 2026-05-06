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
   * @deprecated Phase 1 placeholder. Will be replaced in a later phase
   * with a higher-level `FigmaApiClient` that has the key already
   * plumbed and provides typed REST endpoints. Handlers should not
   * depend on this raw string — feature packs that need Figma REST
   * access should bracket their use of it with a TODO comment so the
   * migration site is greppable.
   */
  readonly figmaApiKey?: string;
};

export type ServerHandler<T extends ToolDefinition> = (
  args: z.infer<T["input"]>,
  ctx: ServerHandlerContext
) => Promise<z.infer<T["output"]>>;

/**
 * Placeholder for the FigmaAdapter interface that lands in Phase 2's
 * `@repo/figma-adapter` package. `Record<string, unknown>` is intentional:
 * it lets plugin handlers compile (`ctx.figma.someMethod(...)` returns
 * `unknown`) without requiring `as any` casts. When Phase 2 lands, every
 * import-site of this type is replaced with the real `FigmaAdapter` and
 * the compiler will tighten every handler in one pass.
 */
export type FigmaAdapterPlaceholder = Record<string, unknown>;

export type PluginHandlerContext = {
  readonly logger: Logger;
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
