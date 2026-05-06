import type { Envelope } from "@repo/protocol";

/**
 * Newline-free, structured-message transport. Implementations are
 * responsible for framing on the wire (WebSocket gives us message
 * boundaries for free; raw TCP would need length-prefixing). The
 * envelope is always a parsed, validated @repo/protocol Envelope —
 * framing/parsing happens inside the implementation.
 */
export interface Transport {
  /**
   * Send an envelope to the remote peer. Resolves when the message has
   * been handed to the underlying transport (not when the peer has
   * received it). Rejects if the transport is closed or in a terminal
   * error state.
   */
  send(envelope: Envelope): Promise<void>;

  /**
   * Subscribe to incoming envelopes. The handler receives already-parsed
   * envelopes — implementations call `parseEnvelope` (or equivalent) on
   * the wire bytes before invoking the handler. Malformed messages are
   * dropped with a warning, never delivered.
   *
   * Returns an unsubscribe function.
   */
  onMessage(handler: (envelope: Envelope) => void): () => void;

  /** Subscribe to connect events. Fires once for every listener if the transport is already connected. */
  onConnect(handler: () => void): () => void;

  /** Subscribe to disconnect events. */
  onDisconnect(handler: (reason?: Error) => void): () => void;

  /** Close the transport. Idempotent. */
  close(): Promise<void>;
}
