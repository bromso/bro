import type { FigmaAdapter } from "@repo/figma-adapter";
import {
  type Envelope,
  ErrorCode,
  type ErrorEnvelope,
  type HandshakeRequestEnvelope,
  type HandshakeResponseEnvelope,
  type Logger,
  type Pack,
  type PluginHandler,
  PROTOCOL_VERSION,
  type RequestEnvelope,
  type ResponseEnvelope,
  type ToolDefinition,
} from "@repo/protocol";
import type { Transport } from "@repo/transport";

export interface BridgePluginRuntimeOptions {
  readonly transport: Transport;
  readonly version: string;
  readonly figma: FigmaAdapter;
  readonly logger?: Logger;
}

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

interface Entry {
  tool: ToolDefinition;
  handler: PluginHandler<ToolDefinition>;
}

/**
 * Plugin-side counterpart to the Daemon. Owns the WS message handler,
 * performs the version handshake, and dispatches incoming
 * `RequestEnvelope`s against registered plugin handlers.
 *
 * Why not reuse `PluginRegistryImpl` from `apps/mcp-server`? The class
 * is structurally similar but has a different calling convention
 * (returns values vs. sends responses on the wire). Duplicating ~30
 * lines is cheaper than refactoring the registry to support both
 * modes.
 */
export class BridgePluginRuntime {
  private readonly transport: Transport;
  private readonly version: string;
  private readonly figma: FigmaAdapter;
  private readonly logger: Logger;
  private readonly entries = new Map<string, Entry>();

  constructor(options: BridgePluginRuntimeOptions) {
    this.transport = options.transport;
    this.version = options.version;
    this.figma = options.figma;
    this.logger = options.logger ?? noopLogger;
  }

  register<T extends ToolDefinition>(tool: T, handler: PluginHandler<T>): void {
    this.entries.set(tool.name, {
      tool,
      handler: handler as unknown as PluginHandler<ToolDefinition>,
    });
  }

  registerPack(pack: Pack): void {
    pack.registerPlugin?.({
      register: <T extends ToolDefinition>(t: T, h: PluginHandler<T>) => this.register(t, h),
    });
  }

  start(): void {
    this.transport.onMessage((env) => {
      void this.handle(env);
    });
  }

  private async handle(env: Envelope): Promise<void> {
    if ((env as unknown as { kind: string }).kind === "handshake-request") {
      const req = env as unknown as HandshakeRequestEnvelope;
      const response: HandshakeResponseEnvelope = {
        kind: "handshake-response",
        clientVersion: this.version,
        protocolVersion: PROTOCOL_VERSION,
        accepted: req.protocolVersion === PROTOCOL_VERSION,
      };
      await this.transport.send(response as never);
      return;
    }
    if (env.kind === "request") {
      await this.dispatch(env);
    }
  }

  private async dispatch(req: RequestEnvelope): Promise<void> {
    const entry = this.entries.get(req.tool);
    if (!entry) {
      const err: ErrorEnvelope = {
        kind: "error",
        id: req.id,
        ok: false,
        code: ErrorCode.E_PROTOCOL_UNKNOWN_TOOL,
        category: "protocol",
        message: `unknown tool: ${req.tool}`,
      };
      await this.transport.send(err);
      return;
    }
    try {
      const parsedInput = entry.tool.input.safeParse(req.args);
      if (!parsedInput.success) {
        const err: ErrorEnvelope = {
          kind: "error",
          id: req.id,
          ok: false,
          code: ErrorCode.E_PROTOCOL_INVALID,
          category: "protocol",
          message: `invalid input for ${req.tool}: ${parsedInput.error.message}`,
        };
        await this.transport.send(err);
        return;
      }
      const result = await entry.handler(parsedInput.data, {
        logger: this.logger,
        figma: this.figma,
      });
      const parsedOutput = entry.tool.output.safeParse(result);
      if (!parsedOutput.success) {
        const err: ErrorEnvelope = {
          kind: "error",
          id: req.id,
          ok: false,
          code: ErrorCode.E_PROTOCOL_OUTPUT_INVALID,
          category: "protocol",
          message: `invalid output from ${req.tool}: ${parsedOutput.error.message}`,
        };
        await this.transport.send(err);
        return;
      }
      const response: ResponseEnvelope = {
        kind: "response",
        id: req.id,
        ok: true,
        result: parsedOutput.data,
      };
      await this.transport.send(response);
    } catch (err) {
      const errEnv: ErrorEnvelope = {
        kind: "error",
        id: req.id,
        ok: false,
        code: ErrorCode.E_FIGMA_UNKNOWN,
        category: "figma",
        message: err instanceof Error ? err.message : String(err),
      };
      await this.transport.send(errEnv);
    }
  }
}
