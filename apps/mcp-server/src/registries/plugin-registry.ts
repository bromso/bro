import type {
  PluginHandler,
  PluginHandlerContext,
  PluginRegistry,
  ToolDefinition,
} from "@repo/protocol";
import { ErrorCode } from "@repo/protocol";
import { RegistryError } from "./server-registry";

interface Entry {
  tool: ToolDefinition;
  handler: PluginHandler<ToolDefinition>;
}

export class PluginRegistryImpl implements PluginRegistry {
  private readonly entries = new Map<string, Entry>();

  register<T extends ToolDefinition>(tool: T, handler: PluginHandler<T>): void {
    this.entries.set(tool.name, {
      tool,
      handler: handler as unknown as PluginHandler<ToolDefinition>,
    });
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  async dispatch(name: string, args: unknown, ctx: PluginHandlerContext): Promise<unknown> {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new RegistryError(ErrorCode.E_PROTOCOL_UNKNOWN_TOOL, `unknown tool: ${name}`);
    }
    const parsedInput = entry.tool.input.safeParse(args);
    if (!parsedInput.success) {
      throw new RegistryError(
        ErrorCode.E_PROTOCOL_INVALID,
        `invalid input for ${name}: ${parsedInput.error.message}`
      );
    }
    const result = await entry.handler(parsedInput.data, ctx);
    const parsedOutput = entry.tool.output.safeParse(result);
    if (!parsedOutput.success) {
      throw new RegistryError(
        ErrorCode.E_PROTOCOL_OUTPUT_INVALID,
        `invalid output from ${name}: ${parsedOutput.error.message}`
      );
    }
    return parsedOutput.data;
  }
}
