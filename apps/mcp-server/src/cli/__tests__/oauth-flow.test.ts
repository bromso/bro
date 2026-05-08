import { describe, expect, it, vi } from "vitest";
import { buildBrowserOpenCommand, runOAuthFlow } from "../oauth-flow";

interface PollScript {
  readonly status: number;
  readonly body?: unknown;
  readonly text?: string;
}

function makeStubFetch(
  startResponse: { status: number; body?: unknown; text?: string },
  pollResponses: ReadonlyArray<PollScript>
) {
  let pollIdx = 0;
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oauth/start")) {
      const body = startResponse.body
        ? JSON.stringify(startResponse.body)
        : (startResponse.text ?? "");
      return new Response(body, {
        status: startResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/oauth/result")) {
      const r = pollResponses[Math.min(pollIdx, pollResponses.length - 1)];
      pollIdx += 1;
      const body = r.body ? JSON.stringify(r.body) : (r.text ?? "");
      return new Response(body, {
        status: r.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

const goodTokens = {
  accessToken: "fa_access_xyz",
  refreshToken: "fa_refresh_abc",
  expiresAt: Date.now() + 3600_000,
  scope: "file_read",
};

describe("runOAuthFlow", () => {
  it("opens the browser at authorizeUrl and writes tokens after a 200", async () => {
    const fetchFn = makeStubFetch(
      { status: 200, body: { authorizeUrl: "https://www.figma.com/oauth?stub=1" } },
      [{ status: 200, body: { tokens: goodTokens } }]
    );
    const browserOpener = { open: vi.fn(async () => {}) };
    const sleeper = vi.fn(async () => {});
    const saveTokens = vi.fn(async () => {});
    const result = await runOAuthFlow({
      relayUrl: "https://r.example",
      tokenPath: "/tmp/oauth.json",
      fetchFn,
      browserOpener,
      sleeper,
      saveTokens,
      newSid: () => "sid_unitabcd1234",
    });
    expect(result.accessToken).toBe("fa_access_xyz");
    expect(browserOpener.open).toHaveBeenCalledWith("https://www.figma.com/oauth?stub=1");
    expect(saveTokens).toHaveBeenCalledWith("/tmp/oauth.json", goodTokens);
    // First call is /oauth/start, second is /oauth/result.
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("polls through 202s before getting a 200", async () => {
    const fetchFn = makeStubFetch(
      { status: 200, body: { authorizeUrl: "https://www.figma.com/oauth" } },
      [
        { status: 202, text: "" },
        { status: 202, text: "" },
        { status: 200, body: { tokens: goodTokens } },
      ]
    );
    const sleeper = vi.fn(async () => {});
    const saveTokens = vi.fn(async () => {});
    await runOAuthFlow({
      relayUrl: "https://r.example",
      tokenPath: "/tmp/oauth.json",
      fetchFn,
      browserOpener: { open: async () => {} },
      sleeper,
      saveTokens,
      newSid: () => "sid_pollthrough12",
    });
    // Two sleeps between three polls.
    expect(sleeper).toHaveBeenCalledTimes(2);
    expect(saveTokens).toHaveBeenCalled();
  });

  it("throws E_OAUTH_START_FAILED when /oauth/start returns non-2xx", async () => {
    const fetchFn = makeStubFetch({ status: 500, text: "boom" }, []);
    await expect(
      runOAuthFlow({
        relayUrl: "https://r.example",
        tokenPath: "/tmp/oauth.json",
        fetchFn,
        browserOpener: { open: async () => {} },
        sleeper: async () => {},
        saveTokens: async () => {},
        newSid: () => "sid_startfail123",
      })
    ).rejects.toThrow(/E_OAUTH_START_FAILED/);
  });

  it("throws E_OAUTH_START_NO_URL when /oauth/start returns no authorizeUrl", async () => {
    const fetchFn = makeStubFetch({ status: 200, body: {} }, []);
    await expect(
      runOAuthFlow({
        relayUrl: "https://r.example",
        tokenPath: "/tmp/oauth.json",
        fetchFn,
        browserOpener: { open: async () => {} },
        sleeper: async () => {},
        saveTokens: async () => {},
        newSid: () => "sid_starturl1234",
      })
    ).rejects.toThrow(/E_OAUTH_START_NO_URL/);
  });

  it("throws E_OAUTH_SESSION_EXPIRED on 410", async () => {
    const fetchFn = makeStubFetch(
      { status: 200, body: { authorizeUrl: "https://www.figma.com/oauth" } },
      [{ status: 410, text: "expired" }]
    );
    await expect(
      runOAuthFlow({
        relayUrl: "https://r.example",
        tokenPath: "/tmp/oauth.json",
        fetchFn,
        browserOpener: { open: async () => {} },
        sleeper: async () => {},
        saveTokens: async () => {},
        newSid: () => "sid_expirepoll12",
      })
    ).rejects.toThrow(/E_OAUTH_SESSION_EXPIRED/);
  });

  it("throws E_OAUTH_SESSION_UNKNOWN on 404", async () => {
    const fetchFn = makeStubFetch(
      { status: 200, body: { authorizeUrl: "https://www.figma.com/oauth" } },
      [{ status: 404, text: "unknown" }]
    );
    await expect(
      runOAuthFlow({
        relayUrl: "https://r.example",
        tokenPath: "/tmp/oauth.json",
        fetchFn,
        browserOpener: { open: async () => {} },
        sleeper: async () => {},
        saveTokens: async () => {},
        newSid: () => "sid_unknown1234567",
      })
    ).rejects.toThrow(/E_OAUTH_SESSION_UNKNOWN/);
  });

  it("retries on 5xx up to maxServerErrors then throws", async () => {
    const fetchFn = makeStubFetch(
      { status: 200, body: { authorizeUrl: "https://www.figma.com/oauth" } },
      [
        { status: 503, text: "down" },
        { status: 503, text: "down" },
        { status: 503, text: "down" },
        { status: 503, text: "down" },
      ]
    );
    await expect(
      runOAuthFlow({
        relayUrl: "https://r.example",
        tokenPath: "/tmp/oauth.json",
        fetchFn,
        browserOpener: { open: async () => {} },
        sleeper: async () => {},
        saveTokens: async () => {},
        newSid: () => "sid_relay5xx1234",
        maxServerErrors: 3,
      })
    ).rejects.toThrow(/E_OAUTH_RELAY_5XX/);
  });

  it("recovers from a transient 5xx before a 200", async () => {
    const fetchFn = makeStubFetch(
      { status: 200, body: { authorizeUrl: "https://www.figma.com/oauth" } },
      [
        { status: 503, text: "down" },
        { status: 200, body: { tokens: goodTokens } },
      ]
    );
    const saveTokens = vi.fn(async () => {});
    await runOAuthFlow({
      relayUrl: "https://r.example",
      tokenPath: "/tmp/oauth.json",
      fetchFn,
      browserOpener: { open: async () => {} },
      sleeper: async () => {},
      saveTokens,
      newSid: () => "sid_transient5xx",
    });
    expect(saveTokens).toHaveBeenCalled();
  });

  it("throws E_OAUTH_TIMEOUT when the polling window elapses", async () => {
    const fetchFn = makeStubFetch(
      { status: 200, body: { authorizeUrl: "https://www.figma.com/oauth" } },
      [{ status: 202, text: "" }]
    );
    let virtualTime = 0;
    await expect(
      runOAuthFlow({
        relayUrl: "https://r.example",
        tokenPath: "/tmp/oauth.json",
        fetchFn,
        browserOpener: { open: async () => {} },
        sleeper: async (ms) => {
          virtualTime += ms;
        },
        now: () => virtualTime,
        timeoutMs: 5_000,
        pollIntervalMs: 1_000,
        saveTokens: async () => {},
        newSid: () => "sid_timeoutloop1",
      })
    ).rejects.toThrow(/E_OAUTH_TIMEOUT/);
  });

  it("throws E_OAUTH_RESULT_MALFORMED when 200 has no tokens", async () => {
    const fetchFn = makeStubFetch(
      { status: 200, body: { authorizeUrl: "https://www.figma.com/oauth" } },
      [{ status: 200, body: {} }]
    );
    await expect(
      runOAuthFlow({
        relayUrl: "https://r.example",
        tokenPath: "/tmp/oauth.json",
        fetchFn,
        browserOpener: { open: async () => {} },
        sleeper: async () => {},
        saveTokens: async () => {},
        newSid: () => "sid_malformed1234",
      })
    ).rejects.toThrow(/E_OAUTH_RESULT_MALFORMED/);
  });

  it("throws E_OAUTH_RESULT_UNEXPECTED on a 4xx that's not 404/410", async () => {
    const fetchFn = makeStubFetch(
      { status: 200, body: { authorizeUrl: "https://www.figma.com/oauth" } },
      [{ status: 401, text: "auth" }]
    );
    await expect(
      runOAuthFlow({
        relayUrl: "https://r.example",
        tokenPath: "/tmp/oauth.json",
        fetchFn,
        browserOpener: { open: async () => {} },
        sleeper: async () => {},
        saveTokens: async () => {},
        newSid: () => "sid_unexpected123",
      })
    ).rejects.toThrow(/E_OAUTH_RESULT_UNEXPECTED/);
  });

  it("trims trailing slash on relayUrl when building requests", async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/oauth/start")) {
        return new Response(JSON.stringify({ authorizeUrl: "https://x" }), { status: 200 });
      }
      return new Response(JSON.stringify({ tokens: goodTokens }), { status: 200 });
    }) as unknown as typeof fetch;
    await runOAuthFlow({
      relayUrl: "https://r.example/",
      tokenPath: "/tmp/oauth.json",
      fetchFn,
      browserOpener: { open: async () => {} },
      sleeper: async () => {},
      saveTokens: async () => {},
      newSid: () => "sid_trimslash123",
    });
    expect(calls[0]).toBe("https://r.example/oauth/start?sid=sid_trimslash123");
    expect(calls[1]).toBe("https://r.example/oauth/result?sid=sid_trimslash123");
  });
});

describe("buildBrowserOpenCommand", () => {
  it.each([
    ["darwin", { cmd: "open", args: ["https://figma.com/oauth"] }],
    ["linux", { cmd: "xdg-open", args: ["https://figma.com/oauth"] }],
  ] as const)("(%s) → %j", (platform, expected) => {
    expect(
      buildBrowserOpenCommand({
        platform,
        url: "https://figma.com/oauth",
      })
    ).toEqual(expected);
  });

  it("(win32) wraps in cmd /c start", () => {
    const result = buildBrowserOpenCommand({
      platform: "win32",
      url: "https://figma.com/oauth",
    });
    expect(result.cmd).toBe("cmd");
    expect(result.args).toEqual(["/c", "start", "", "https://figma.com/oauth"]);
  });
});
