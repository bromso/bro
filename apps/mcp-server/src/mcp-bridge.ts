import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDefinition } from "@repo/protocol";
import { ErrorCode, errorCategoryFor } from "@repo/protocol";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Per-call context passed to the resolver. Phase 5 introduces this so
 * resolvers can stream `notifications/progress` to the connected MCP
 * client during long-running streaming tools (e.g. `import_variables`).
 *
 * `progressToken` mirrors the value the AI client supplied via
 * `_meta.progressToken` on the call. When undefined the client did not
 * opt into progress, and `emitProgress` is a no-op.
 */
export interface ResolveContext {
  readonly progressToken?: string | number;
  readonly emitProgress: (info: { progress: number; total?: number; message?: string }) => void;
}

export interface RegisterToolsOptions {
  readonly mcpServer: Server;
  readonly tools: readonly ToolDefinition[];
  /**
   * Resolver: returns the parsed tool result (matching the tool's
   * output schema). Throws to signal a tool-level error; the bridge
   * translates the error into an MCP tool result with `isError: true`.
   */
  readonly resolve: (name: string, args: unknown, ctx: ResolveContext) => Promise<unknown>;
}

const TOOL_LEVEL_CATEGORIES = new Set(["figma", "stream", "protocol"]);

export function registerToolsWithMcp(options: RegisterToolsOptions): void {
  const { mcpServer, tools, resolve } = options;

  const byName = new Map<string, ToolDefinition>();
  for (const t of tools) byName.set(t.name, t);

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.input) as Record<string, unknown>,
    })),
  }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = byName.get(req.params.name);
    if (!def) {
      return {
        isError: true,
        content: [{ type: "text", text: `unknown tool: ${req.params.name}` }],
      };
    }
    const progressToken = req.params._meta?.progressToken as string | number | undefined;
    const emitProgress: ResolveContext["emitProgress"] =
      progressToken !== undefined
        ? (info) => {
            void mcpServer.notification({
              method: "notifications/progress",
              params: { progressToken, ...info },
            });
          }
        : () => {};
    try {
      const result = await resolve(req.params.name, req.params.arguments ?? {}, {
        progressToken,
        emitProgress,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (err) {
      const code = (err as { code?: ErrorCode }).code ?? ErrorCode.E_FIGMA_UNKNOWN;
      const category = (err as { category?: string }).category ?? errorCategoryFor(code);
      const message = err instanceof Error ? err.message : String(err);
      const isToolLevel = TOOL_LEVEL_CATEGORIES.has(category);
      if (isToolLevel) {
        return {
          isError: true,
          content: [{ type: "text", text: `${code}: ${message}` }],
        };
      }
      // Catastrophic — bubble as JSON-RPC error.
      throw err;
    }
  });
}
