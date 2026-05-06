import { createConnection, type Socket } from "node:net";
import { type Envelope, parseEnvelope } from "@repo/protocol";
import type { Transport } from "./transport";

export interface UnixSocketConnectOptions {
  readonly path: string;
  readonly connectTimeoutMs?: number;
}

type Handler<T> = (arg: T) => void;
const NEWLINE = "\n";

/**
 * Shim-side Unix domain socket transport. Single connection, newline-delimited
 * JSON framing. The plugin-side equivalent of `WebSocketClientTransport` for
 * the daemon ↔ stdio shim leg.
 */
export class UnixSocketClientTransport implements Transport {
  private readonly socket: Socket;
  private readonly messageHandlers = new Set<Handler<Envelope>>();
  private readonly connectHandlers = new Set<Handler<void>>();
  private readonly disconnectHandlers = new Set<Handler<Error | undefined>>();
  private closed = false;

  private constructor(socket: Socket) {
    this.socket = socket;
    socket.setEncoding("utf-8");
    let buf = "";
    socket.on("data", (chunk: string) => {
      buf += chunk;
      let idx = buf.indexOf(NEWLINE);
      while (idx !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (frame.length > 0) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(frame);
          } catch {
            idx = buf.indexOf(NEWLINE);
            continue;
          }
          let envelope: Envelope;
          try {
            envelope = parseEnvelope(parsed);
          } catch {
            idx = buf.indexOf(NEWLINE);
            continue;
          }
          for (const h of this.messageHandlers) h(envelope);
        }
        idx = buf.indexOf(NEWLINE);
      }
    });
    socket.on("close", () => {
      if (!this.closed) {
        this.closed = true;
        for (const h of this.disconnectHandlers) h(undefined);
      }
    });
    socket.on("error", (err) => {
      if (!this.closed) {
        for (const h of this.disconnectHandlers) h(err);
      }
    });
  }

  static connect(options: UnixSocketConnectOptions): Promise<UnixSocketClientTransport> {
    const timeoutMs = options.connectTimeoutMs ?? 5_000;
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = createConnection({ path: options.path });
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new Error(`connect timeout: ${options.path}`));
      }, timeoutMs);
      socket.once("connect", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(new UnixSocketClientTransport(socket));
      });
      socket.once("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async send(envelope: Envelope): Promise<void> {
    if (this.closed) throw new Error("transport closed");
    this.socket.write(`${JSON.stringify(envelope)}${NEWLINE}`);
  }

  /** Test-only: write raw bytes without framing. */
  __rawWrite(data: string): void {
    this.socket.write(data);
  }

  onMessage(handler: Handler<Envelope>): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnect(handler: Handler<void>): () => void {
    this.connectHandlers.add(handler);
    if (!this.closed) handler();
    return () => this.connectHandlers.delete(handler);
  }

  onDisconnect(handler: Handler<Error | undefined>): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.socket.end();
  }
}
