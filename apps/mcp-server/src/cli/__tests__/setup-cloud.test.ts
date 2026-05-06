import { describe, expect, it, vi } from "vitest";
import { cloudEntry, formatPairBanner, pairWithRelay } from "../setup-cloud";

describe("pairWithRelay", () => {
  it("POSTs to {relayUrl}/pair and returns the JSON body", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: "123456",
        sessionId: "ses_abc",
        expiresAt: 1_700_000_300_000,
      }),
    });
    const result = await pairWithRelay({
      relayUrl: "https://r.example",
      fetchFn: fetchFn as never,
    });
    expect(fetchFn).toHaveBeenCalledWith("https://r.example/pair", {
      method: "POST",
    });
    expect(result).toEqual({
      code: "123456",
      sessionId: "ses_abc",
      expiresAt: 1_700_000_300_000,
    });
  });

  it("throws when relay returns non-2xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "down" });
    await expect(
      pairWithRelay({ relayUrl: "https://r.example", fetchFn: fetchFn as never })
    ).rejects.toThrow(/E_RELAY/);
  });
});

describe("formatPairBanner", () => {
  it("includes the 6-digit code and TTL", () => {
    const banner = formatPairBanner({
      code: "123456",
      expiresAt: 1_700_000_300_000,
      now: 1_700_000_000_000,
    });
    expect(banner).toContain("123456");
    expect(banner).toMatch(/expires in 5m/);
  });
});

describe("cloudEntry", () => {
  it("returns a Streamable HTTP MCP entry", () => {
    const entry = cloudEntry({
      relayUrl: "https://r.example",
      sessionId: "ses_abc",
    });
    expect(entry.type).toBe("http");
    expect(entry.url).toBe("https://r.example/mcp/ses_abc");
  });
});
