import {
  type Envelope,
  ErrorCode,
  type ErrorEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
} from "@repo/protocol";
import type { Transport } from "./transport";

export interface CorrelatorOptions {
  /** Default request timeout in ms. Defaults to 30000. */
  readonly timeoutMs?: number;
}

export interface RequestOptions {
  /** Per-request timeout override. */
  readonly timeoutMs?: number;
  /** AbortSignal to cancel the in-flight request. */
  readonly signal?: AbortSignal;
}

/**
 * Strongly-typed error thrown by `Correlator.request` when the server
 * returns an `ErrorEnvelope`. Mirrors the envelope's fields verbatim
 * so callers can switch on `.code` without re-parsing JSON.
 */
export class TransportError extends Error {
  readonly code: ErrorEnvelope["code"];
  readonly category: ErrorEnvelope["category"];
  readonly remediation?: string;
  readonly details?: ErrorEnvelope["details"];

  constructor(envelope: ErrorEnvelope) {
    super(envelope.message);
    this.name = "TransportError";
    this.code = envelope.code;
    this.category = envelope.category;
    this.remediation = envelope.remediation;
    this.details = envelope.details;
  }
}

interface PendingEntry {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  abortHandler: (() => void) | null;
  signal: AbortSignal | null;
}

export class Correlator {
  private readonly transport: Transport;
  private readonly defaultTimeoutMs: number;
  private readonly pending = new Map<string, PendingEntry>();

  constructor(transport: Transport, options: CorrelatorOptions = {}) {
    this.transport = transport;
    this.defaultTimeoutMs = options.timeoutMs ?? 30_000;
    transport.onMessage((env) => this.dispatch(env));
  }

  async request<T = unknown>(envelope: RequestEnvelope, options: RequestOptions = {}): Promise<T> {
    const id = envelope.id;
    if (this.pending.has(id)) {
      throw new Error(`duplicate request id: ${id}`);
    }

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.settle(id, () =>
                reject(
                  new TransportError({
                    kind: "error",
                    id,
                    ok: false,
                    code: ErrorCode.E_TRANSPORT_TIMEOUT,
                    category: "transport",
                    message: `request ${id} timed out after ${timeoutMs}ms`,
                  })
                )
              );
            }, timeoutMs)
          : null;

      const abortHandler = options.signal
        ? () => {
            this.settle(id, () =>
              reject(
                Object.assign(new Error("request aborted"), {
                  name: "AbortError",
                })
              )
            );
          }
        : null;

      if (options.signal && abortHandler) {
        options.signal.addEventListener("abort", abortHandler, { once: true });
      }

      this.pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
        timer,
        abortHandler,
        signal: options.signal ?? null,
      });

      if (options.signal?.aborted) {
        abortHandler?.();
        return;
      }

      this.transport.send(envelope).catch((err) => {
        this.settle(id, () => reject(err));
      });
    });
  }

  private dispatch(envelope: Envelope): void {
    if (envelope.kind === "response") {
      this.handleResponse(envelope);
    } else if (envelope.kind === "error") {
      this.handleError(envelope);
    } else if (envelope.kind === "chunk-ack") {
      // Phase 5 streaming: chunk envelopes are sent via `request` (id-based)
      // and answered with a chunk-ack carrying the same id. Resolve with the
      // ack itself so the caller can read applied/failed/failedDetails.
      this.handleChunkAck(envelope);
    }
  }

  private handleChunkAck(env: Envelope & { kind: "chunk-ack"; id: string }): void {
    const entry = this.pending.get(env.id);
    if (!entry) return;
    this.cleanup(env.id, entry);
    entry.resolve(env);
  }

  private handleResponse(env: ResponseEnvelope): void {
    const entry = this.pending.get(env.id);
    if (!entry) return;
    this.cleanup(env.id, entry);
    entry.resolve(env.result);
  }

  private handleError(env: ErrorEnvelope): void {
    const entry = this.pending.get(env.id);
    if (!entry) return;
    this.cleanup(env.id, entry);
    entry.reject(new TransportError(env));
  }

  private settle(id: string, fn: () => void): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.cleanup(id, entry);
    fn();
  }

  private cleanup(id: string, entry: PendingEntry): void {
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.signal && entry.abortHandler) {
      entry.signal.removeEventListener("abort", entry.abortHandler);
    }
    this.pending.delete(id);
  }
}
