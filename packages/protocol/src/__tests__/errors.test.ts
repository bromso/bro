import { describe, expect, it } from "vitest";
import { ErrorCategory, ErrorCode, errorCategoryFor } from "../errors";

describe("ErrorCode enum", () => {
  it("contains all six categories' codes", () => {
    // Spot checks — full enumeration is in code
    expect(ErrorCode.E_PROTOCOL_INVALID).toBeDefined();
    expect(ErrorCode.E_FIGMA_NODE_NOT_FOUND).toBeDefined();
    expect(ErrorCode.E_BRIDGE_UNAVAILABLE).toBeDefined();
    expect(ErrorCode.E_STREAM_IDEMPOTENCY_CONFLICT).toBeDefined();
    expect(ErrorCode.E_DAEMON_LOCKFILE_STALE).toBeDefined();
    expect(ErrorCode.E_RELAY_PAIRING_EXPIRED).toBeDefined();
  });

  it("has no duplicate values", () => {
    const values = Object.values(ErrorCode);
    expect(new Set(values).size).toBe(values.length);
  });

  it("maps each code to a category", () => {
    expect(errorCategoryFor(ErrorCode.E_PROTOCOL_INVALID)).toBe("protocol");
    expect(errorCategoryFor(ErrorCode.E_FIGMA_NODE_NOT_FOUND)).toBe("figma");
    expect(errorCategoryFor(ErrorCode.E_BRIDGE_UNAVAILABLE)).toBe("transport");
    expect(errorCategoryFor(ErrorCode.E_STREAM_IDEMPOTENCY_CONFLICT)).toBe("stream");
    expect(errorCategoryFor(ErrorCode.E_DAEMON_LOCKFILE_STALE)).toBe("daemon");
    expect(errorCategoryFor(ErrorCode.E_RELAY_PAIRING_EXPIRED)).toBe("relay");
  });
});
