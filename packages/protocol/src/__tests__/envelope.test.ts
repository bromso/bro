import { describe, expect, it } from "vitest";
import { ErrorEnvelope, parseEnvelope, RequestEnvelope } from "../envelope";
import { ErrorCode } from "../errors";

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
    expect(() => parseEnvelope({ kind: "nope", id: "1" } as unknown)).toThrow();
  });
});

describe("envelope roundtrip", () => {
  it("encode -> JSON -> decode preserves shape", () => {
    const original = {
      kind: "request" as const,
      id: "req_1",
      sourceClientId: "claude-code",
      tool: "extract_styles",
      args: { fileKey: "abc" },
    };
    const wire = JSON.stringify(original);
    const decoded = parseEnvelope(JSON.parse(wire));
    expect(decoded).toEqual(original);
  });
});
