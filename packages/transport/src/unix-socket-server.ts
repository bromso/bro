import { createServer, type Server, type Socket } from "node:net";
import { type Envelope, parseEnvelope } from "@repo/protocol";
import type { Transport } from "./transport";

export interface UnixSocketListenOptions {
  readonly path: string;
}

type Handler<T> = (arg: T) => void;
const NEWLINE = "\n";

class FramingBuffer {
  private buf = "";
  push(chunk: string, onFrame: (frame: string) => void): void {
    this.buf += chunk;
    let idx = this.buf.indexOf(NEWLINE);
    while (idx !== -1) {
      const frame = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 1);
      if (frame.length > 0) onFrame(frame);
      idx = this.buf.indexOf(NEWLINE);
    }
  }
}

/**
 * Daemon-side Unix domain socket transport. Multi-client: every accepted
 * connection is tracked and `broadcast()` fans messages out to all of them.
 *
 * Wire format is newline-delimited JSON. `JSON.stringify` escapes embedded
 * newlines, so `\n` is a safe frame delimiter.
 *
 * Unlike `WebSocketServerTransport` (single-client), `send()` is ambiguous
 * here ("which client?") and intentionally throws — callers must use
 * `broadcast()` for server-initiated messages.
 */
export class UnixSocketServerTransport implements Transport {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private readonly messageHandlers = new Set<Handler<Envelope>>();
  private readonly connectHandlers = new Set<Handler<void>>();
  private readonly disconnectHandlers = new Set<Handler<Error | undefined>>();
  private closed = false;

  private constructor(server: Server) {
    this.server = server;
    server.on("connection", (socket) => this.onConnection(socket));
  }

  static listen(options: UnixSocketListenOptions): Promise<UnixSocketServerTransport> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      const onError = (err: Error) => {
        server.close();
        reject(err);
      };
      server.once("error", onError);
      server.listen(options.path, () => {
        server.removeListener("error", onError);
        resolve(new UnixSocketServerTransport(server));
      });
    });
  }

  get connectedClientCount(): number {
    return this.sockets.size;
  }

  /**
   * `send` on a multi-client transport doesn't have a single addressee.
   * Use `broadcast` for server-initiated messages; `send` is reserved
   * for parity with `Transport` and rejects to surface misuse.
   */
  async send(_envelope: Envelope): Promise<void> {
    throw new Error("UnixSocketServerTransport.send: use broadcast() instead");
  }

  async broadcast(envelope: Envelope): Promise<void> {
    if (this.closed) throw new Error("transport closed");
    const line = `${JSON.stringify(envelope)}${NEWLINE}`;
    for (const s of this.sockets) s.write(line);
  }

  onMessage(handler: Handler<Envelope>): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnect(handler: Handler<void>): () => void {
    this.connectHandlers.add(handler);
    if (this.connectedClientCount > 0) handler();
    return () => this.connectHandlers.delete(handler);
  }

  onDisconnect(handler: Handler<Error | undefined>): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private onConnection(socket: Socket): void {
    this.sockets.add(socket);
    for (const h of this.connectHandlers) h();

    const buf = new FramingBuffer();
    socket.setEncoding("utf-8");
    socket.on("data", (chunk: string) => {
      buf.push(chunk, (frame) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(frame);
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
    });

    socket.on("close", () => {
      this.sockets.delete(socket);
      if (!this.closed) {
        for (const h of this.disconnectHandlers) h(undefined);
      }
    });
    // `net.Socket` always emits `close` after `error`, like `ws`.
    socket.on("error", (err) => {
      if (!this.closed) {
        for (const h of this.disconnectHandlers) h(err);
      }
    });
  }
}
