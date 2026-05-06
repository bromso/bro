import { describe, expect, it } from "vitest";
import { ErrorCode, errorCategoryFor } from "../errors";

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

  it.each(Object.values(ErrorCode))("maps %s to a category without throwing", (code) => {
    expect(() => errorCategoryFor(code)).not.toThrow();
  });

  it("throws on an unknown error code prefix", () => {
    // Cast through unknown to bypass the literal type — exercises the
    // defensive throw branch in errorCategoryFor.
    expect(() => errorCategoryFor("E_UNKNOWN_PREFIX_XYZ" as unknown as ErrorCode)).toThrow(
      /Unknown error code prefix/
    );
  });
});
