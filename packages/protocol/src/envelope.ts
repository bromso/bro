import { z } from "zod";
import { type ErrorCategory, ErrorCode } from "./errors";

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
  category: z.enum(["protocol", "figma", "transport", "stream", "daemon", "relay"] as const),
  message: z.string().min(1),
  remediation: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

// Compile-time guard: schema's `category` literal set must equal ErrorCategory exactly.
// Adding a new category to ErrorCategory without updating the schema fails this check.
type _CategoryEqualsErrorCategory = [ErrorCategory] extends [
  z.infer<typeof ErrorEnvelope>["category"],
]
  ? [z.infer<typeof ErrorEnvelope>["category"]] extends [ErrorCategory]
    ? true
    : never
  : never;
const _categoryCheck: _CategoryEqualsErrorCategory = true;
void _categoryCheck;

export const Envelope = z.discriminatedUnion("kind", [
  RequestEnvelope,
  ResponseEnvelope,
  ErrorEnvelope,
]);
export type Envelope = z.infer<typeof Envelope>;

export function parseEnvelope(input: unknown): Envelope {
  return Envelope.parse(input);
}

export function tryParseEnvelope(input: unknown): z.SafeParseReturnType<unknown, Envelope> {
  return Envelope.safeParse(input);
}
