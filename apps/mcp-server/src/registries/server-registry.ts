import type {
  ServerHandler,
  ServerHandlerContext,
  ServerRegistry,
  ToolDefinition,
} from "@repo/protocol";
import { ErrorCode } from "@repo/protocol";

/** Internal error type — surfaces a known protocol code without a wire envelope. */
export class RegistryError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

interface Entry {
  tool: ToolDefinition;
  handler: ServerHandler<ToolDefinition>;
}

export class ServerRegistryImpl implements ServerRegistry {
  private readonly entries = new Map<string, Entry>();

  register<T extends ToolDefinition>(tool: T, handler: ServerHandler<T>): void {
    this.entries.set(tool.name, {
      tool,
      handler: handler as unknown as ServerHandler<ToolDefinition>,
    });
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  async dispatch(name: string, args: unknown, ctx: ServerHandlerContext): Promise<unknown> {
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
