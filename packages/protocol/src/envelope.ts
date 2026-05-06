import { z } from "zod";
import { ERROR_CATEGORIES, ErrorCode } from "./errors";
import { HandshakeRequestEnvelope, HandshakeResponseEnvelope } from "./handshake";
import {
  ChunkAckEnvelope,
  ChunkEnvelope,
  StreamDoneEnvelope,
  StreamOpenEnvelope,
} from "./streaming";

export const RequestEnvelope = z.object({
  kind: z.literal("request"),
  id: z.string().min(1),
  sourceClientId: z.string().min(1),
  tool: z.string().min(1),
  args: z.record(z.unknown()),
  meta: z
    .object({
      progressToken: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
});
export type RequestEnvelope = z.infer<typeof RequestEnvelope>;

export const ResponseEnvelope = z.object({
  kind: z.literal("response"),
  id: z.string().min(1),
  ok: z.literal(true),
  result: z.unknown(),
});
export type ResponseEnvelope = z.infer<typeof ResponseEnvelope>;

export const ErrorEnvelope = z.object({
  kind: z.literal("error"),
  id: z.string().min(1),
  ok: z.literal(false),
  code: z.nativeEnum(ErrorCode),
  category: z.enum(ERROR_CATEGORIES),
  message: z.string().min(1),
  remediation: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export const Envelope = z.discriminatedUnion("kind", [
  RequestEnvelope,
  ResponseEnvelope,
  ErrorEnvelope,
  HandshakeRequestEnvelope,
  HandshakeResponseEnvelope,
  StreamOpenEnvelope,
  ChunkEnvelope,
  ChunkAckEnvelope,
  StreamDoneEnvelope,
]);
export type Envelope = z.infer<typeof Envelope>;

export function parseEnvelope(input: unknown): Envelope {
  return Envelope.parse(input);
}

export function tryParseEnvelope(input: unknown): z.SafeParseReturnType<unknown, Envelope> {
  return Envelope.safeParse(input);
}
