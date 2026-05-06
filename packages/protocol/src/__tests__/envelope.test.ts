import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  ErrorEnvelope,
  parseEnvelope,
  RequestEnvelope,
  ResponseEnvelope,
  tryParseEnvelope,
} from "../envelope";
import { ErrorCode } from "../errors";
import type { HandshakeRequestEnvelope, HandshakeResponseEnvelope } from "../handshake";
import type {
  ChunkAckEnvelope,
  ChunkEnvelope,
  StreamDoneEnvelope,
  StreamOpenEnvelope,
} from "../streaming";

describe("RequestEnvelope", () => {
  it("validates a well-formed request", () => {
    const result = RequestEnvelope.safeParse({
      kind: "request",
      id: "req_01HXYZ",
      sourceClientId: "claude-code",
      tool: "extract_styles",
      args: { fileKey: "abc123" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a request missing 'tool'", () => {
    const result = RequestEnvelope.safeParse({
      kind: "request",
      id: "req_01HXYZ",
      sourceClientId: "claude-code",
      args: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown 'kind'", () => {
    const result = RequestEnvelope.safeParse({
      kind: "blah",
      id: "x",
      sourceClientId: "x",
      tool: "x",
      args: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("ResponseEnvelope", () => {
  it("validates a well-formed response", () => {
    const result = ResponseEnvelope.safeParse({
      kind: "response",
      id: "req_01HXYZ",
      ok: true,
      result: { styles: ["color/red", "color/blue"] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a response with ok: false", () => {
    const result = ResponseEnvelope.safeParse({
      kind: "response",
      id: "x",
      ok: false,
      result: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("ErrorEnvelope", () => {
  it("validates a well-formed error", () => {
    const result = ErrorEnvelope.safeParse({
      kind: "error",
      id: "req_01HXYZ",
      ok: false,
      code: ErrorCode.E_FIGMA_NODE_NOT_FOUND,
      category: "figma",
      message: "Node 1:23 was deleted",
      remediation: "Re-fetch selection",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an error envelope with ok: true", () => {
    const result = ErrorEnvelope.safeParse({
      kind: "error",
      id: "x",
      ok: true,
      code: ErrorCode.E_FIGMA_UNKNOWN,
      category: "figma",
      message: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("parseEnvelope (discriminated union)", () => {
  it("dispatches on 'kind'", () => {
    const r = parseEnvelope({
      kind: "request",
      id: "1",
      sourceClientId: "x",
      tool: "y",
      args: {},
    });
    expect(r.kind).toBe("request");
  });

  it("throws on unknown kind", () => {
    expect(() => parseEnvelope({ kind: "nope", id: "1" })).toThrow();
  });

  it("accepts a handshake-request via parseEnvelope", () => {
    const env = parseEnvelope({
      kind: "handshake-request",
      serverVersion: "0.0.0",
      protocolVersion: 1,
    });
    expect(env.kind).toBe("handshake-request");
  });

  it("accepts a handshake-response via parseEnvelope", () => {
    const env = parseEnvelope({
      kind: "handshake-response",
      clientVersion: "0.0.0",
      protocolVersion: 1,
      accepted: true,
    });
    expect(env.kind).toBe("handshake-response");
  });

  it("accepts a stream-open via parseEnvelope", () => {
    const env = parseEnvelope({
      kind: "stream-open",
      id: "req_1",
      sessionId: "ses_a",
      tool: "import_variables",
      total: 100,
      atomic: false,
    });
    expect(env.kind).toBe("stream-open");
  });

  it("accepts a chunk via parseEnvelope", () => {
    const env = parseEnvelope({
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 100,
      items: [],
      idempotencyKey: "ses_a:0",
    });
    expect(env.kind).toBe("chunk");
  });

  it("accepts a chunk-ack via parseEnvelope", () => {
    const env = parseEnvelope({
      kind: "chunk-ack",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      applied: 100,
      failed: 0,
    });
    expect(env.kind).toBe("chunk-ack");
  });

  it("accepts a stream-done via parseEnvelope", () => {
    const env = parseEnvelope({
      kind: "stream-done",
      id: "req_1",
      sessionId: "ses_a",
      summary: { total: 100, applied: 100, failed: 0 },
    });
    expect(env.kind).toBe("stream-done");
  });
});

describe("tryParseEnvelope (safe variant)", () => {
  it("returns success for a valid envelope", () => {
    const result = tryParseEnvelope({
      kind: "request",
      id: "1",
      sourceClientId: "x",
      tool: "y",
      args: {},
    });
    expect(result.success).toBe(true);
  });

  it("returns failure for an invalid envelope without throwing", () => {
    const result = tryParseEnvelope({ kind: "nope", id: "1" });
    expect(result.success).toBe(false);
  });
});

describe("envelope roundtrip", () => {
  it("encode -> JSON -> decode preserves a request", () => {
    const original = {
      kind: "request",
      id: "req_1",
      sourceClientId: "claude-code",
      tool: "extract_styles",
      args: { fileKey: "abc" },
    };
    const decoded = parseEnvelope(JSON.parse(JSON.stringify(original)));
    expect(decoded).toEqual(original);
  });

  it("encode -> JSON -> decode preserves a response", () => {
    const original = {
      kind: "response",
      id: "req_1",
      ok: true,
      result: { styles: [] },
    };
    const decoded = parseEnvelope(JSON.parse(JSON.stringify(original)));
    expect(decoded).toEqual(original);
  });

  it("encode -> JSON -> decode preserves an error", () => {
    const original = {
      kind: "error",
      id: "req_1",
      ok: false,
      code: ErrorCode.E_FIGMA_NODE_NOT_FOUND,
      category: "figma",
      message: "Node 1:23 was deleted",
    };
    const decoded = parseEnvelope(JSON.parse(JSON.stringify(original)));
    expect(decoded).toEqual(original);
  });
});

// Compile-time check: the discriminated union narrows correctly on `kind`.
// This is a type-level test; if it stops type-checking, Zod has lost narrowing.
function _typeLevelNarrowingCheck(env: ReturnType<typeof parseEnvelope>): void {
  if (env.kind === "request") {
    const _r: z.infer<typeof RequestEnvelope> = env;
    void _r;
  } else if (env.kind === "response") {
    const _s: z.infer<typeof ResponseEnvelope> = env;
    void _s;
  } else if (env.kind === "error") {
    const _e: z.infer<typeof ErrorEnvelope> = env;
    void _e;
  } else if (env.kind === "handshake-request") {
    const _hreq: HandshakeRequestEnvelope = env;
    void _hreq;
  } else if (env.kind === "handshake-response") {
    const _hres: HandshakeResponseEnvelope = env;
    void _hres;
  } else if (env.kind === "stream-open") {
    const _so: StreamOpenEnvelope = env;
    void _so;
  } else if (env.kind === "chunk") {
    const _c: ChunkEnvelope = env;
    void _c;
  } else if (env.kind === "chunk-ack") {
    const _ca: ChunkAckEnvelope = env;
    void _ca;
  } else {
    const _sd: StreamDoneEnvelope = env;
    void _sd;
  }
}
void _typeLevelNarrowingCheck;
