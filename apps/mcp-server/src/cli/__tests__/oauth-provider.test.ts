import { describe, expect, it, vi } from "vitest";
import { createOAuthProvider } from "../oauth-provider";

const validTokens = {
  accessToken: "fa_access_xyz",
  refreshToken: "fa_refresh_abc",
  expiresAt: 1_700_000_000_000 + 3600_000,
  scope: "file_read",
};

describe("createOAuthProvider", () => {
  it("returns the access token when tokens are valid", async () => {
    const provider = createOAuthProvider({
      tokenPath: "/p",
      now: () => 1_700_000_000_000,
      env: {},
      loadTokens: vi.fn(async () => validTokens),
      saveTokens: vi.fn(async () => {}),
      refreshTokens: vi.fn(async () => validTokens),
    });
    expect(await provider()).toBe("fa_access_xyz");
  });

  it("caches the token for cacheTtlMs across multiple calls", async () => {
    const loadTokens = vi.fn(async () => validTokens);
    const provider = createOAuthProvider({
      tokenPath: "/p",
      now: () => 1_700_000_000_000,
      env: {},
      cacheTtlMs: 60_000,
      loadTokens,
      saveTokens: vi.fn(async () => {}),
      refreshTokens: vi.fn(async () => validTokens),
    });
    await provider();
    await provider();
    await provider();
    expect(loadTokens).toHaveBeenCalledTimes(1);
  });

  it("re-reads after cacheTtlMs elapses", async () => {
    const loadTokens = vi.fn(async () => validTokens);
    let virtualTime = 1_700_000_000_000;
    const provider = createOAuthProvider({
      tokenPath: "/p",
      now: () => virtualTime,
      env: {},
      cacheTtlMs: 60_000,
      loadTokens,
      saveTokens: vi.fn(async () => {}),
      refreshTokens: vi.fn(async () => validTokens),
    });
    await provider();
    virtualTime += 60_001;
    await provider();
    expect(loadTokens).toHaveBeenCalledTimes(2);
  });

  it("throws E_OAUTH_NO_TOKENS when the token file is missing", async () => {
    const provider = createOAuthProvider({
      tokenPath: "/p",
      now: () => 1_700_000_000_000,
      env: {},
      loadTokens: vi.fn(async () => null),
      saveTokens: vi.fn(async () => {}),
      refreshTokens: vi.fn(async () => validTokens),
    });
    await expect(provider()).rejects.toThrow(/E_OAUTH_NO_TOKENS/);
  });

  it("refreshes when expired and re-saves the new tokens", async () => {
    const expired = { ...validTokens, expiresAt: 1_700_000_000_000 - 60_000 };
    const refreshed = { ...validTokens, accessToken: "fa_access_NEW" };
    const loadTokens = vi.fn(async () => expired);
    const saveTokens = vi.fn(async () => {});
    const refreshTokens = vi.fn(async () => refreshed);
    const provider = createOAuthProvider({
      tokenPath: "/p",
      now: () => 1_700_000_000_000,
      env: { FIGMA_OAUTH_CLIENT_ID: "id", FIGMA_OAUTH_CLIENT_SECRET: "secret" },
      loadTokens,
      saveTokens,
      refreshTokens,
    });
    expect(await provider()).toBe("fa_access_NEW");
    expect(refreshTokens).toHaveBeenCalledWith({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "fa_refresh_abc",
    });
    expect(saveTokens).toHaveBeenCalledWith("/p", refreshed);
  });

  it("throws E_OAUTH_REFRESH_NOT_CONFIGURED on expiry without secrets", async () => {
    const expired = { ...validTokens, expiresAt: 1_700_000_000_000 - 60_000 };
    const provider = createOAuthProvider({
      tokenPath: "/p",
      now: () => 1_700_000_000_000,
      env: {},
      loadTokens: vi.fn(async () => expired),
      saveTokens: vi.fn(async () => {}),
      refreshTokens: vi.fn(async () => validTokens),
    });
    await expect(provider()).rejects.toThrow(/E_OAUTH_REFRESH_NOT_CONFIGURED/);
  });

  it("uses the in-memory refreshed token immediately without re-reading the file", async () => {
    const expired = { ...validTokens, expiresAt: 1_700_000_000_000 - 60_000 };
    const refreshed = { ...validTokens, accessToken: "fa_access_NEW" };
    const loadTokens = vi.fn(async () => expired);
    const refreshTokens = vi.fn(async () => refreshed);
    const provider = createOAuthProvider({
      tokenPath: "/p",
      now: () => 1_700_000_000_000,
      env: { FIGMA_OAUTH_CLIENT_ID: "id", FIGMA_OAUTH_CLIENT_SECRET: "secret" },
      loadTokens,
      saveTokens: vi.fn(async () => {}),
      refreshTokens,
    });
    await provider();
    await provider();
    // Only one file read despite two calls; refresh runs once because the
    // refreshed token isn't expired.
    expect(loadTokens).toHaveBeenCalledTimes(1);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
  });
});
