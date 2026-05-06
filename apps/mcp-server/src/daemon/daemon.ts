import type { FigmaAdapter } from "@repo/figma-adapter";
import {
  ErrorCode,
  type ErrorEnvelope,
  errorCategoryFor,
  type Logger,
  type Pack,
  type RequestEnvelope,
  type ResponseEnvelope,
} from "@repo/protocol";
import { UnixSocketServerTransport } from "@repo/transport";
import { PluginRegistryImpl } from "../registries/plugin-registry";
import { RegistryError, ServerRegistryImpl } from "../registries/server-registry";

export interface DaemonStartOptions {
  readonly socketPath: string;
  readonly figma: FigmaAdapter;
  readonly packs: readonly Pack[];
  readonly logger?: Logger;
}

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Daemon orchestrator. Wires the Unix-socket IPC transport to the server +
 * plugin registries, applies pack registrations, and routes incoming
 * `RequestEnvelope`s through the appropriate registry.
 *
 * Phase 3 simplification: response/error envelopes are broadcast to ALL
 * connected IPC clients. Each shim's `Correlator` filters by `id`, so
 * non-matching responses are no-ops. Per-socket routing is a future
 * concern.
 */
export class Daemon {
  private readonly ipc: UnixSocketServerTransport;
  private readonly serverRegistry = new ServerRegistryImpl();
  private readonly pluginRegistry = new PluginRegistryImpl();
  private readonly figma: FigmaAdapter;
  private readonly logger: Logger;
  private readonly startedAt = Date.now();
  private closed = false;

  static async start(options: DaemonStartOptions): Promise<Daemon> {
    const ipc = await UnixSocketServerTransport.listen({ path: options.socketPath });
    const daemon = new Daemon(ipc, options.figma, options.logger ?? noopLogger);
    for (const pack of options.packs) {
      pack.registerServer?.(daemon.serverRegistry);
      pack.registerPlugin?.(daemon.pluginRegistry);
    }
    ipc.onMessage((env) => {
      if (env.kind === "request") {
        void daemon.handleRequest(env);
      }
    });
    return daemon;
  }

  private constructor(ipc: UnixSocketServerTransport, figma: FigmaAdapter, logger: Logger) {
    this.ipc = ipc;
    this.figma = figma;
    this.logger = logger;
  }

  get pid(): number {
    return process.pid;
  }

  get uptimeMs(): number {
    return Date.now() - this.startedAt;
  }

  async stop(): Promise<void> {
    this.closed = true;
    await this.ipc.close();
  }

  private async handleRequest(req: RequestEnvelope): Promise<void> {
    try {
      const result = await this.dispatch(req);
      if (this.closed) return;
      const response: ResponseEnvelope = {
        kind: "response",
        id: req.id,
        ok: true,
        result,
      };
      await this.ipc.broadcast(response);
    } catch (err) {
      if (this.closed) return;
      const errEnv = this.toErrorEnvelope(req.id, err);
      try {
        await this.ipc.broadcast(errEnv);
      } catch {
        // Daemon was closed mid-flight; the originating shim will see
        // its request time out via Correlator. Swallow the broadcast
        // failure rather than propagate as an unhandled rejection.
      }
    }
  }

  private async dispatch(req: RequestEnvelope): Promise<unknown> {
    if (this.serverRegistry.has(req.tool)) {
      return this.serverRegistry.dispatch(req.tool, req.args, { logger: this.logger });
    }
    if (this.pluginRegistry.has(req.tool)) {
      return this.pluginRegistry.dispatch(req.tool, req.args, {
        logger: this.logger,
        figma: this.figma,
      });
    }
    throw new RegistryError(ErrorCode.E_PROTOCOL_UNKNOWN_TOOL, `unknown tool: ${req.tool}`);
  }

  private toErrorEnvelope(id: string, err: unknown): ErrorEnvelope {
    if (err instanceof RegistryError) {
      return {
        kind: "error",
        id,
        ok: false,
        code: err.code,
        category: errorCategoryFor(err.code),
        message: err.message,
      };
    }
    // TODO(phase-4): richer error wrapping. Every non-RegistryError is
    // bucketed as E_FIGMA_UNKNOWN regardless of origin (server vs plugin
    // handler), which is misleading. Consider a per-handler wrapper that
    // narrows category before reaching here, or a synthetic E_INTERNAL.
    return {
      kind: "error",
      id,
      ok: false,
      code: ErrorCode.E_FIGMA_UNKNOWN,
      category: "figma",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
