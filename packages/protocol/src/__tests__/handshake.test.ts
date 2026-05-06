import { describe, expect, it } from "vitest";
import { HandshakeRequestEnvelope, HandshakeResponseEnvelope, parseHandshake } from "../handshake";

describe("HandshakeRequestEnvelope", () => {
  it("validates a request with serverVersion", () => {
    const r = HandshakeRequestEnvelope.safeParse({
      kind: "handshake-request",
      serverVersion: "0.0.0",
      protocolVersion: 1,
    });
    expect(r.success).toBe(true);
  });
  it("rejects when protocolVersion is missing", () => {
    const r = HandshakeRequestEnvelope.safeParse({
      kind: "handshake-request",
      serverVersion: "0.0.0",
    });
    expect(r.success).toBe(false);
  });
});

describe("HandshakeResponseEnvelope", () => {
  it("validates a response with clientVersion + accepted", () => {
    const r = HandshakeResponseEnvelope.safeParse({
      kind: "handshake-response",
      clientVersion: "0.0.0",
      protocolVersion: 1,
      accepted: true,
    });
    expect(r.success).toBe(true);
  });
  it("validates a rejection with reason", () => {
    const r = HandshakeResponseEnvelope.safeParse({
      kind: "handshake-response",
      clientVersion: "0.0.0",
      protocolVersion: 1,
      accepted: false,
      reason: "version mismatch",
    });
    expect(r.success).toBe(true);
  });
});

describe("parseHandshake (discriminated union)", () => {
  it("dispatches on kind", () => {
    const req = parseHandshake({
      kind: "handshake-request",
      serverVersion: "0.0.0",
      protocolVersion: 1,
    });
    expect(req.kind).toBe("handshake-request");
  });
  it("throws on unknown kind", () => {
    expect(() => parseHandshake({ kind: "nope" } as unknown)).toThrow();
  });
});
