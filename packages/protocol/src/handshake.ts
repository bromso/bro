import { z } from "zod";

/**
 * Handshake envelopes. Exchanged once per connection BEFORE any tool
 * envelopes flow. Mismatched `protocolVersion` is a hard close.
 */
export const PROTOCOL_VERSION = 1 as const;

export const HandshakeRequestEnvelope = z.object({
  kind: z.literal("handshake-request"),
  serverVersion: z.string().min(1),
  protocolVersion: z.number().int().positive(),
});
export type HandshakeRequestEnvelope = z.infer<typeof HandshakeRequestEnvelope>;

export const HandshakeResponseEnvelope = z.object({
  kind: z.literal("handshake-response"),
  clientVersion: z.string().min(1),
  protocolVersion: z.number().int().positive(),
  accepted: z.boolean(),
  reason: z.string().optional(),
});
export type HandshakeResponseEnvelope = z.infer<typeof HandshakeResponseEnvelope>;

export const Handshake = z.discriminatedUnion("kind", [
  HandshakeRequestEnvelope,
  HandshakeResponseEnvelope,
]);
export type Handshake = z.infer<typeof Handshake>;

export function parseHandshake(input: unknown): Handshake {
  return Handshake.parse(input);
}
