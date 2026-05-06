import { describe, expect, it } from "vitest";
import {
  ChunkAckEnvelope,
  ChunkEnvelope,
  isMonotonic,
  parseStreamingEnvelope,
  StreamDoneEnvelope,
  StreamOpenEnvelope,
  type StreamSessionBinding,
  tryParseStreamingEnvelope,
} from "../streaming";

describe("StreamOpenEnvelope", () => {
  it("validates open with sessionId, tool, total", () => {
    const r = StreamOpenEnvelope.safeParse({
      kind: "stream-open",
      id: "req_1",
      sessionId: "ses_abc",
      tool: "import_variables",
      total: 10000,
      atomic: false,
    });
    expect(r.success).toBe(true);
  });
});

describe("ChunkEnvelope", () => {
  it("validates chunk with seq + items + idempotencyKey", () => {
    const r = ChunkEnvelope.safeParse({
      kind: "chunk",
      id: "req_2",
      sessionId: "ses_abc",
      seq: 0,
      total: 100,
      items: [{ name: "color/red", value: "#f00" }],
      idempotencyKey: "ses_abc:0",
    });
    expect(r.success).toBe(true);
  });

  it("rejects negative seq", () => {
    const r = ChunkEnvelope.safeParse({
      kind: "chunk",
      id: "x",
      sessionId: "x",
      seq: -1,
      total: 1,
      items: [],
      idempotencyKey: "x:0",
    });
    expect(r.success).toBe(false);
  });
});

describe("ChunkAckEnvelope", () => {
  it("validates ack with applied + failed counts", () => {
    const r = ChunkAckEnvelope.safeParse({
      kind: "chunk-ack",
      id: "req_3",
      sessionId: "ses_abc",
      seq: 0,
      applied: 99,
      failed: 1,
      failedDetails: [{ index: 47, reason: "duplicate name", name: "color/red" }],
    });
    expect(r.success).toBe(true);
  });
});

describe("StreamDoneEnvelope", () => {
  it("validates done with summary", () => {
    const r = StreamDoneEnvelope.safeParse({
      kind: "stream-done",
      id: "req_4",
      sessionId: "ses_abc",
      summary: { total: 100, applied: 99, failed: 1 },
    });
    expect(r.success).toBe(true);
  });
});

describe("isMonotonic", () => {
  it("returns true for [0,1,2,3]", () => {
    expect(isMonotonic([0, 1, 2, 3])).toBe(true);
  });
  it("returns false for [0,1,1,2] (duplicate)", () => {
    expect(isMonotonic([0, 1, 1, 2])).toBe(false);
  });
  it("returns false for [0,2] (gap)", () => {
    expect(isMonotonic([0, 2])).toBe(false);
  });
  it("returns false for [1,0] (out of order)", () => {
    expect(isMonotonic([1, 0])).toBe(false);
  });
  it("returns true for empty array", () => {
    expect(isMonotonic([])).toBe(true);
  });
});

describe("streaming envelope roundtrip", () => {
  it("encode -> JSON -> decode preserves a stream-open", () => {
    const original = {
      kind: "stream-open",
      id: "req_1",
      sessionId: "ses_abc",
      tool: "import_variables",
      total: 100,
      atomic: true,
    };
    const decoded = parseStreamingEnvelope(JSON.parse(JSON.stringify(original)));
    expect(decoded).toEqual(original);
  });

  it("encode -> JSON -> decode preserves a chunk", () => {
    const original = {
      kind: "chunk",
      id: "req_2",
      sessionId: "ses_abc",
      seq: 0,
      total: 100,
      items: [{ name: "color/red", value: "#f00" }],
      idempotencyKey: "ses_abc:0",
    };
    const decoded = parseStreamingEnvelope(JSON.parse(JSON.stringify(original)));
    expect(decoded).toEqual(original);
  });

  it("encode -> JSON -> decode preserves a chunk-ack with default failedDetails", () => {
    const original = {
      kind: "chunk-ack",
      id: "req_3",
      sessionId: "ses_abc",
      seq: 0,
      applied: 100,
      failed: 0,
    };
    // default([]) means failedDetails is materialized after parse, so we expect [] in decoded.
    const decoded = parseStreamingEnvelope(JSON.parse(JSON.stringify(original)));
    expect(decoded).toEqual({ ...original, failedDetails: [] });
  });

  it("encode -> JSON -> decode preserves a stream-done", () => {
    const original = {
      kind: "stream-done",
      id: "req_4",
      sessionId: "ses_abc",
      summary: { total: 100, applied: 99, failed: 1 },
    };
    const decoded = parseStreamingEnvelope(JSON.parse(JSON.stringify(original)));
    expect(decoded).toEqual(original);
  });

  it("tryParseStreamingEnvelope returns success for valid input", () => {
    const r = tryParseStreamingEnvelope({
      kind: "stream-done",
      id: "req_x",
      sessionId: "ses_x",
      summary: { total: 1, applied: 1, failed: 0 },
    });
    expect(r.success).toBe(true);
  });
});

describe("StreamSessionBinding", () => {
  it("permits sessionId-only bindings (no progressToken)", () => {
    const binding: StreamSessionBinding = { sessionId: "ses_a" };
    expect(binding.sessionId).toBe("ses_a");
  });

  it("permits sessionId + numeric progressToken", () => {
    const binding: StreamSessionBinding = {
      sessionId: "ses_b",
      progressToken: 42,
    };
    expect(binding.progressToken).toBe(42);
  });

  it("permits sessionId + string progressToken", () => {
    const binding: StreamSessionBinding = {
      sessionId: "ses_c",
      progressToken: "tok_abc",
    };
    expect(binding.progressToken).toBe("tok_abc");
  });
});
