import type { AddressInfo } from "node:net";
import { type Envelope, parseEnvelope } from "@repo/protocol";
import { WebSocket, WebSocketServer } from "ws";
import type { Transport } from "./transport";

export interface ListenOptions {
  /** TCP port; pass 0 to bind to a random free port. */
  readonly port: number;
  /** Bind address; defaults to 127.0.0.1 (loopback only). */
  readonly host?: string;
}

type Handler<T> = (arg: T) => void;

/**
 * Daemon-side WebSocket transport. Accepts at most one client at a
 * time; subsequent connection attempts are rejected immediately.
 *
 * Loopback-only by default (127.0.0.1). The daemon model assumes the
 * plugin and the daemon live on the same machine; the relay handles
 * remote pairing in Phase 6.
 */
export class WebSocketServerTransport implements Transport {
  private readonly wss: WebSocketServer;
  private socket: WebSocket | null = null;
  private readonly messageHandlers = new Set<Handler<Envelope>>();
  private readonly connectHandlers = new Set<Handler<void>>();
  private readonly disconnectHandlers = new Set<Handler<Error | undefined>>();
  private closed = false;

  readonly port: number;

  private constructor(wss: WebSocketServer, port: number) {
    this.wss = wss;
    this.port = port;
    wss.on("connection", (ws) => this.onConnection(ws));
  }

  static listen(options: ListenOptions): Promise<WebSocketServerTransport> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({
        port: options.port,
        host: options.host ?? "127.0.0.1",
      });
      const onError = (err: Error) => {
        // Best-effort cleanup so a failed bind doesn't leak listeners on
        // the underlying http server.
        wss.close();
        reject(err);
      };
      wss.once("error", onError);
      wss.once("listening", () => {
        wss.removeListener("error", onError);
        const address = wss.address() as AddressInfo;
        resolve(new WebSocketServerTransport(wss, address.port));
      });
    });
  }

  get isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  async send(envelope: Envelope): Promise<void> {
    if (this.closed) throw new Error("transport closed");
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("no client connected");
    }
    this.socket.send(JSON.stringify(envelope));
  }

  onMessage(handler: Handler<Envelope>): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnect(handler: Handler<void>): () => void {
    this.connectHandlers.add(handler);
    if (this.isConnected) handler();
    return () => this.connectHandlers.delete(handler);
  }

  onDisconnect(handler: Handler<Error | undefined>): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  private onConnection(ws: WebSocket): void {
    if (this.socket) {
      ws.close(4000, "single-client server");
      return;
    }
    this.socket = ws;
    for (const h of this.connectHandlers) h();

    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      let envelope: Envelope;
      try {
        envelope = parseEnvelope(parsed);
      } catch {
        return;
      }
      for (const h of this.messageHandlers) h(envelope);
    });

    ws.on("close", () => {
      this.socket = null;
      if (!this.closed) {
        for (const h of this.disconnectHandlers) h(undefined);
      }
    });

    // `ws` always fires `close` after `error`, so the socket reference is
    // cleared by the close handler — no defensive nulling needed here.
    ws.on("error", (err) => {
      if (!this.closed) {
        for (const h of this.disconnectHandlers) h(err);
      }
    });
  }
}
