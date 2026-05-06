import { type Envelope, parseEnvelope } from "@repo/protocol";
import type { Transport } from "./transport";

interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(event: "open", handler: () => void): void;
  addEventListener(event: "message", handler: (e: { data: unknown }) => void): void;
  addEventListener(event: "close", handler: () => void): void;
  addEventListener(event: "error", handler: (e: unknown) => void): void;
}

type WebSocketCtor = new (url: string) => WebSocketLike;

export interface ConnectOptions {
  readonly url: string;
  /**
   * Constructor for the WebSocket implementation. Pass `globalThis.WebSocket`
   * in the browser/Figma iframe, `ws.WebSocket` in Node tests. Explicit
   * injection avoids a `globalThis` shim and a runtime check.
   */
  readonly WebSocketCtor: WebSocketCtor;
  /** ms to wait for the open event. Defaults to 5000. */
  readonly connectTimeoutMs?: number;
}

type Handler<T> = (arg: T) => void;

/**
 * Plugin/CLI-side WebSocket transport. Wraps a WebSocket constructor so the
 * same code can run under the browser global `WebSocket` (Figma iframe) and
 * the Node `ws.WebSocket` (tests).
 */
export class WebSocketClientTransport implements Transport {
  private readonly socket: WebSocketLike;
  private readonly messageHandlers = new Set<Handler<Envelope>>();
  private readonly connectHandlers = new Set<Handler<void>>();
  private readonly disconnectHandlers = new Set<Handler<Error | undefined>>();
  private closed = false;

  private constructor(socket: WebSocketLike) {
    this.socket = socket;
    socket.addEventListener("message", (e) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String((e as { data: unknown }).data));
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
    socket.addEventListener("close", () => {
      if (!this.closed) {
        this.closed = true;
        for (const h of this.disconnectHandlers) h(undefined);
      }
    });
    // Once connected, post-close errors are tied to the close flag — the same
    // lifecycle gate WebSocketServerTransport uses (see Task 2.4 review fix).
    socket.addEventListener("error", (err) => {
      if (!this.closed) {
        for (const h of this.disconnectHandlers) h(err as Error);
      }
    });
  }

  static connect(options: ConnectOptions): Promise<WebSocketClientTransport> {
    const timeoutMs = options.connectTimeoutMs ?? 5_000;
    return new Promise((resolve, reject) => {
      const socket = new options.WebSocketCtor(options.url);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error(`connect timeout: ${options.url}`));
      }, timeoutMs);

      socket.addEventListener("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const transport = new WebSocketClientTransport(socket);
        for (const h of transport.connectHandlers) h();
        resolve(transport);
      });

      socket.addEventListener("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error("websocket error"));
      });
    });
  }

  async send(envelope: Envelope): Promise<void> {
    if (this.closed) throw new Error("transport closed");
    this.socket.send(JSON.stringify(envelope));
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
    this.socket.close();
  }
}
