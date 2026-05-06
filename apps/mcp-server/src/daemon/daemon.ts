import type { FigmaAdapter } from "@repo/figma-adapter";
import {
  ErrorCode,
  type ErrorEnvelope,
  errorCategoryFor,
  type HandshakeRequestEnvelope,
  type HandshakeResponseEnvelope,
  type Logger,
  type Pack,
  PROTOCOL_VERSION,
  type RequestEnvelope,
  type ResponseEnvelope,
} from "@repo/protocol";
import { Correlator, UnixSocketServerTransport, WebSocketServerTransport } from "@repo/transport";
import { PluginRegistryImpl } from "../registries/plugin-registry";
import { RegistryError, ServerRegistryImpl } from "../registries/server-registry";

export interface DaemonStartOptions {
  readonly socketPath: string;
  /** TCP port for the plugin WebSocket. Defaults to 9223. Pass 0 for ephemeral (tests). */
  readonly wsPort?: number;
  /** Daemon version. Sent in the handshake-request (Task 4.4). */
  readonly version: string;
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
  private readonly ws: WebSocketServerTransport;
  private readonly serverRegistry = new ServerRegistryImpl();
  private readonly pluginRegistry = new PluginRegistryImpl();
  private readonly figma: FigmaAdapter;
  private readonly version: string;
  private readonly logger: Logger;
  private readonly startedAt = Date.now();
  private closed = false;
  private pluginConnected = false;
  private _pluginVersion: string | null = null;
  private pluginCorrelator: Correlator | null = null;

  static async start(options: DaemonStartOptions): Promise<Daemon> {
    const ipc = await UnixSocketServerTransport.listen({ path: options.socketPath });
    const wsPort = options.wsPort ?? 9223;
    const ws = await WebSocketServerTransport.listen({ port: wsPort });
    const daemon = new Daemon(
      ipc,
      ws,
      options.figma,
      options.version,
      options.logger ?? noopLogger
    );
    for (const pack of options.packs) {
      pack.registerServer?.(daemon.serverRegistry);
      pack.registerPlugin?.(daemon.pluginRegistry);
    }
    ipc.onMessage((env) => {
      if (env.kind === "request") {
        void daemon.handleRequest(env);
      }
    });
    ws.onConnect(() => {
      void daemon.runHandshake();
    });
    return daemon;
  }

  private constructor(
    ipc: UnixSocketServerTransport,
    ws: WebSocketServerTransport,
    figma: FigmaAdapter,
    version: string,
    logger: Logger
  ) {
    this.ipc = ipc;
    this.ws = ws;
    this.figma = figma;
    this.version = version;
    this.logger = logger;
  }

  get pid(): number {
    return process.pid;
  }

  get uptimeMs(): number {
    return Date.now() - this.startedAt;
  }

  get wsPort(): number {
    return this.ws.port;
  }

  get isPluginConnected(): boolean {
    return this.pluginConnected;
  }

  get pluginVersion(): string | null {
    return this._pluginVersion;
  }

  async stop(): Promise<void> {
    this.closed = true;
    await Promise.all([this.ipc.close(), this.ws.close()]);
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
    // Plugin-tool resolution: prefer the connected WS plugin; fall back to in-process.
    const knownByPack = this.pluginRegistry.has(req.tool);
    if (this.pluginConnected && this.pluginCorrelator) {
      return this.pluginCorrelator.request({
        kind: "request",
        id: req.id, // reuse the originating id; correlator keys on this
        sourceClientId: req.sourceClientId,
        tool: req.tool,
        args: req.args,
      });
    }
    if (knownByPack) {
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

  private async runHandshake(): Promise<void> {
    const request: HandshakeRequestEnvelope = {
      kind: "handshake-request",
      serverVersion: this.version,
      protocolVersion: PROTOCOL_VERSION,
    };
    // Subscribe to ONE handshake-response, then unsubscribe so reconnects
    // (Phase 5) don't stack listeners.
    const unsub = this.ws.onMessage((env) => {
      if ((env as unknown as { kind: string }).kind === "handshake-response") {
        unsub();
        void this.completeHandshake(env as unknown as HandshakeResponseEnvelope);
      }
    });
    // Yield to the event loop so the client's "open" event fires and any
    // user-side message listeners attach before the request hits the wire.
    // Without this yield, fast loopback delivery races the client setup and
    // the request can be dropped (the WS client transport doesn't queue
    // messages received before any onMessage handler is registered).
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    try {
      await this.ws.send(request as never);
    } catch {
      // The client may have responded and we may have closed the transport
      // before the deferred send runs (e.g. version-mismatch closes the WS
      // synchronously). Swallow rather than emit an unhandled rejection.
      unsub();
    }
  }

  private async completeHandshake(response: HandshakeResponseEnvelope): Promise<void> {
    if (response.protocolVersion !== PROTOCOL_VERSION || !response.accepted) {
      await this.ws.close();
      return;
    }
    this.pluginConnected = true;
    this._pluginVersion = response.clientVersion;
    // Attach a Correlator AFTER the handshake listener has unsubscribed so
    // it never sees the handshake response (no id collision risk).
    this.pluginCorrelator = new Correlator(this.ws);
  }
}
