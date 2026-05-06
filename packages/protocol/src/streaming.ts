/**
 * Streaming envelope schemas for chunked import/export operations.
 *
 * MCP integration note: streaming envelopes do not carry an MCP
 * `progressToken` directly. The original `RequestEnvelope.meta.progressToken`
 * (envelope.ts) is what MCP uses to correlate `notifications/progress` to
 * the originating tool call. The server keeps an internal map of
 * `sessionId -> progressToken` and emits progress notifications using the
 * stored token whenever it receives a `ChunkAckEnvelope`. This avoids
 * duplicating the token in every chunk on the wire.
 */
import { z } from "zod";

export const StreamOpenEnvelope = z.object({
  kind: z.literal("stream-open"),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  tool: z.string().min(1),
  total: z.number().int().nonnegative(),
  atomic: z.boolean(),
});
export type StreamOpenEnvelope = z.infer<typeof StreamOpenEnvelope>;

export const ChunkEnvelope = z.object({
  kind: z.literal("chunk"),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  items: z.array(z.unknown()),
  idempotencyKey: z.string().min(1),
});
export type ChunkEnvelope = z.infer<typeof ChunkEnvelope>;

export const ChunkAckEnvelope = z.object({
  kind: z.literal("chunk-ack"),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  failedDetails: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        reason: z.string(),
        name: z.string().optional(),
      })
    )
    .default([]),
});
export type ChunkAckEnvelope = z.infer<typeof ChunkAckEnvelope>;

export const StreamDoneEnvelope = z.object({
  kind: z.literal("stream-done"),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  summary: z.object({
    total: z.number().int().nonnegative(),
    applied: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
});
export type StreamDoneEnvelope = z.infer<typeof StreamDoneEnvelope>;

/**
 * Server-side binding between an MCP progress token (carried on
 * `RequestEnvelope.meta.progressToken`) and a streaming session id.
 *
 * The daemon stores one of these per active session. When a
 * `ChunkAckEnvelope` arrives, the daemon looks up the binding by
 * `sessionId` and emits an MCP `notifications/progress` using the
 * stored `progressToken` (if any).
 */
export interface StreamSessionBinding {
  readonly sessionId: string;
  readonly progressToken?: string | number;
}

export const StreamingEnvelope = z.discriminatedUnion("kind", [
  StreamOpenEnvelope,
  ChunkEnvelope,
  ChunkAckEnvelope,
  StreamDoneEnvelope,
]);
export type StreamingEnvelope = z.infer<typeof StreamingEnvelope>;

export function parseStreamingEnvelope(input: unknown): StreamingEnvelope {
  return StreamingEnvelope.parse(input);
}

export function tryParseStreamingEnvelope(
  input: unknown
): z.SafeParseReturnType<unknown, StreamingEnvelope> {
  return StreamingEnvelope.safeParse(input);
}

/**
 * Returns `true` iff every element is exactly `prev + 1`.
 *
 * Note: this is *contiguity*, not classical monotonicity. `[0, 1, 3]`
 * returns `false` (gap), and `[5, 6, 7]` returns `true` because the
 * helper does NOT check that the sequence starts at 0 — that's the
 * caller's responsibility (e.g., the stream session manager that
 * tracks `seqs[0] === 0` separately).
 *
 * Empty arrays return `true` (vacuously contiguous).
 */
export function isMonotonic(seqs: readonly number[]): boolean {
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] !== seqs[i - 1] + 1) return false;
  }
  return true;
}
