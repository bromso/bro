import { describe, expect, it } from "vitest";
import { PairingCodeStore } from "../pairing";

describe("PairingCodeStore.generate", () => {
  it("returns a 6-digit code", () => {
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => 0 });
    const { code } = store.generate("ses_a");
    expect(code).toMatch(/^\d{6}$/);
  });

  it("each call returns a distinct code", () => {
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => 0 });
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) codes.add(store.generate(`ses_${i}`).code);
    expect(codes.size).toBeGreaterThan(80); // 6-digit space is 1M, low collisions expected
  });

  it("returns expiresAt = now + ttl", () => {
    const store = new PairingCodeStore({ ttlMs: 30_000, now: () => 1_000 });
    const { expiresAt } = store.generate("ses_a");
    expect(expiresAt).toBe(31_000);
  });
});

describe("PairingCodeStore.validate", () => {
  it("returns the sessionId for a valid code", () => {
    const t = 0;
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => t });
    const { code } = store.generate("ses_a");
    expect(store.validate(code)).toEqual({ sessionId: "ses_a", consumed: false });
  });

  it("returns null for an unknown code", () => {
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => 0 });
    expect(store.validate("000000")).toBeNull();
  });

  it("returns null for an expired code", () => {
    let t = 0;
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => t });
    const { code } = store.generate("ses_a");
    t = 60_001;
    expect(store.validate(code)).toBeNull();
  });
});

describe("PairingCodeStore.consume", () => {
  it("returns the sessionId on first call", () => {
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => 0 });
    const { code } = store.generate("ses_a");
    expect(store.consume(code)).toBe("ses_a");
  });

  it("returns null on the second call (single-use)", () => {
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => 0 });
    const { code } = store.generate("ses_a");
    store.consume(code);
    expect(store.consume(code)).toBeNull();
  });

  it("returns null for an unknown code", () => {
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => 0 });
    expect(store.consume("000000")).toBeNull();
  });

  it("returns null for an expired code", () => {
    let t = 0;
    const store = new PairingCodeStore({ ttlMs: 60_000, now: () => t });
    const { code } = store.generate("ses_a");
    t = 60_001;
    expect(store.consume(code)).toBeNull();
  });
});
