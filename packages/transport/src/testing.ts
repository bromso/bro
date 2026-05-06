import type { Envelope } from "@repo/protocol";
import type { Transport } from "./transport";

type Handler<T> = (arg: T) => void;

class InMemoryTransport implements Transport {
  private peer: InMemoryTransport | null = null;
  private messageHandlers = new Set<Handler<Envelope>>();
  private connectHandlers = new Set<Handler<void>>();
  private disconnectHandlers = new Set<Handler<Error | undefined>>();
  private closed = false;

  setPeer(peer: InMemoryTransport): void {
    this.peer = peer;
  }

  async send(envelope: Envelope): Promise<void> {
    if (this.closed) throw new Error("transport closed");
    if (!this.peer) throw new Error("transport unpaired");
    // Deliver synchronously on the next microtask so callers can subscribe first.
    const peer = this.peer;
    queueMicrotask(() => peer.deliver(envelope));
  }

  deliver(envelope: Envelope): void {
    for (const h of this.messageHandlers) h(envelope);
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
    for (const h of this.disconnectHandlers) h(undefined);
    if (this.peer && !this.peer.closed) await this.peer.close();
  }
}

/**
 * Returns a paired pair of transports that deliver to each other in
 * memory. Useful for end-to-end tests of higher-level layers
 * (Correlator, MCP wiring, etc.) without spinning up a WebSocket.
 */
export function createInMemoryTransportPair(): [Transport, Transport] {
  const a = new InMemoryTransport();
  const b = new InMemoryTransport();
  a.setPeer(b);
  b.setPeer(a);
  return [a, b];
}
