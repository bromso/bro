import { ErrorCode } from "@repo/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeBackoff, withReconnect } from "../reconnect";

describe("computeBackoff", () => {
  it("doubles base delay per attempt", () => {
    const random = () => 0.5; // jitter to midpoint
    expect(computeBackoff(0, { baseMs: 100, maxMs: 10_000, random })).toBe(100);
    expect(computeBackoff(1, { baseMs: 100, maxMs: 10_000, random })).toBe(200);
    expect(computeBackoff(2, { baseMs: 100, maxMs: 10_000, random })).toBe(400);
    expect(computeBackoff(3, { baseMs: 100, maxMs: 10_000, random })).toBe(800);
  });

  it("clamps to maxMs", () => {
    const random = () => 0.5;
    expect(computeBackoff(20, { baseMs: 100, maxMs: 10_000, random })).toBe(10_000);
  });

  it("applies jitter as +/- 50% of delay", () => {
    expect(computeBackoff(0, { baseMs: 100, maxMs: 10_000, random: () => 0 })).toBe(50);
    expect(computeBackoff(0, { baseMs: 100, maxMs: 10_000, random: () => 1 })).toBe(150);
  });
});

describe("withReconnect", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns a connection on first success", async () => {
    const connect = vi.fn().mockResolvedValueOnce("conn");
    const result = await withReconnect(connect, {
      maxAttempts: 3,
      baseMs: 10,
      maxMs: 100,
      random: () => 0.5,
    });
    expect(result).toBe("conn");
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("conn");

    const promise = withReconnect(connect, {
      maxAttempts: 5,
      baseMs: 10,
      maxMs: 100,
      random: () => 0.5,
    });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("conn");
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it("gives up after maxAttempts and throws E_BRIDGE_UNAVAILABLE", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("boom"));
    const promise = withReconnect(connect, {
      maxAttempts: 3,
      baseMs: 10,
      maxMs: 100,
      random: () => 0.5,
    });
    // Attach a rejection handler eagerly so Node does not flag the
    // rejection as unhandled while fake timers are flushing.
    const assertion = expect(promise).rejects.toMatchObject({
      code: ErrorCode.E_BRIDGE_UNAVAILABLE,
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it("aborts via AbortSignal between retries", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("boom"));
    const ac = new AbortController();
    const promise = withReconnect(connect, {
      maxAttempts: 10,
      baseMs: 10,
      maxMs: 100,
      random: () => 0.5,
      signal: ac.signal,
    });
    // Attach a rejection handler eagerly so Node does not flag the
    // rejection as unhandled while fake timers are flushing.
    const assertion = expect(promise).rejects.toThrow(/abort/i);
    ac.abort();
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("aborts mid-sleep via the AbortSignal listener", async () => {
    // Use real timers so we can fire `abort` between `setTimeout` and its
    // expiry — that drives the `onAbort` branch (clearTimeout + reject)
    // that the pre-aborted/early-return branch can't reach.
    vi.useRealTimers();
    const connect = vi.fn().mockRejectedValueOnce(new Error("boom"));
    const ac = new AbortController();
    const promise = withReconnect(connect, {
      maxAttempts: 5,
      baseMs: 50,
      maxMs: 200,
      random: () => 0.5,
      signal: ac.signal,
    });
    const assertion = expect(promise).rejects.toThrow(/abort/i);
    // Wait long enough for the first attempt to fail and `sleep` to register
    // its abort listener, then abort while the timeout is still pending.
    await new Promise<void>((r) => setTimeout(r, 5));
    ac.abort();
    await assertion;
    vi.useFakeTimers();
  });
});
