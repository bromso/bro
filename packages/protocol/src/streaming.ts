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

export function isMonotonic(seqs: readonly number[]): boolean {
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] !== seqs[i - 1] + 1) return false;
  }
  return true;
}
