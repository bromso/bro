import { describe, expect, it } from "vitest";
import { createOAuthCheck } from "../checks/oauth";

const goodTokens = {
  accessToken: "fa_access_xyz",
  refreshToken: "fa_refresh_abc",
  expiresAt: 1_700_000_000_000 + 3600_000,
  scope: "file_read",
};

describe("oauth check", () => {
  it("returns warn when the token file does not exist (ENOENT)", async () => {
    const check = createOAuthCheck({
      tokenPath: "/nope/oauth.json",
      readFile: async () => {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      },
    });
    const r = await check.run();
    expect(r.status).toBe("warn");
    expect(r.detail).toMatch(/no OAuth token file/);
  });

  it("returns error when the token file is unreadable for non-ENOENT reasons", async () => {
    const check = createOAuthCheck({
      tokenPath: "/some/path",
      readFile: async () => {
        const err = new Error("EACCES") as NodeJS.ErrnoException;
        err.code = "EACCES";
        throw err;
      },
    });
    const r = await check.run();
    expect(r.status).toBe("error");
    expect(r.detail).toMatch(/unreadable/);
    expect(r.detail).toMatch(/EACCES/);
  });

  it("returns error when the token file is invalid JSON", async () => {
    const check = createOAuthCheck({
      tokenPath: "/p",
      readFile: async () => "{not-json",
    });
    const r = await check.run();
    expect(r.status).toBe("error");
    expect(r.detail).toMatch(/not valid JSON/);
  });

  it("returns error when JSON is valid but missing required fields", async () => {
    const check = createOAuthCheck({
      tokenPath: "/p",
      readFile: async () => JSON.stringify({ accessToken: "only" }),
    });
    const r = await check.run();
    expect(r.status).toBe("error");
    expect(r.detail).toMatch(/missing required fields/);
  });

  it("returns ok when tokens are present and not expired", async () => {
    const check = createOAuthCheck({
      tokenPath: "/p",
      readFile: async () => JSON.stringify(goodTokens),
      now: () => 1_700_000_000_000,
    });
    const r = await check.run();
    expect(r.status).toBe("ok");
    expect(r.detail).toMatch(/valid until/);
  });

  it("returns warn when tokens expire within ~60s (matches Phase 21 buffer)", async () => {
    const expiringSoon = {
      ...goodTokens,
      expiresAt: 1_700_000_000_000 + 30_000, // 30s ahead
    };
    const check = createOAuthCheck({
      tokenPath: "/p",
      readFile: async () => JSON.stringify(expiringSoon),
      now: () => 1_700_000_000_000,
    });
    const r = await check.run();
    expect(r.status).toBe("warn");
    expect(r.detail).toMatch(/expires within/);
  });

  it("returns warn when tokens are already expired", async () => {
    const expired = { ...goodTokens, expiresAt: 1_700_000_000_000 - 60_000 };
    const check = createOAuthCheck({
      tokenPath: "/p",
      readFile: async () => JSON.stringify(expired),
      now: () => 1_700_000_000_000,
    });
    const r = await check.run();
    expect(r.status).toBe("warn");
  });
});
