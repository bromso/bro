import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isExpired, loadOAuthTokens, type OAuthTokenSet, saveOAuthTokens } from "../oauth";

const sample = (overrides: Partial<OAuthTokenSet> = {}): OAuthTokenSet => ({
  accessToken: "at-1",
  refreshToken: "rt-1",
  expiresAt: Date.now() + 60 * 60 * 1000,
  scope: "file_read",
  ...overrides,
});

describe("saveOAuthTokens / loadOAuthTokens", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "oauth-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("save then load round-trips a token set", async () => {
    const path = join(dir, "tokens.json");
    const tokens = sample({ accessToken: "ROUND" });
    await saveOAuthTokens(path, tokens);
    const loaded = await loadOAuthTokens(path);
    expect(loaded).toEqual(tokens);
  });

  it("loadOAuthTokens returns null when the file does not exist (ENOENT)", async () => {
    const result = await loadOAuthTokens(join(dir, "missing.json"));
    expect(result).toBeNull();
  });

  it("loadOAuthTokens returns null on malformed JSON", async () => {
    const path = join(dir, "bad.json");
    await writeFile(path, "not json {", "utf-8");
    const result = await loadOAuthTokens(path);
    expect(result).toBeNull();
  });

  it("loadOAuthTokens returns null when fields are missing/wrong-typed", async () => {
    const path = join(dir, "partial.json");
    await writeFile(path, JSON.stringify({ accessToken: 42 }), "utf-8");
    const result = await loadOAuthTokens(path);
    expect(result).toBeNull();
  });

  it("saveOAuthTokens creates the parent directory if missing", async () => {
    const path = join(dir, "nested", "deeper", "tokens.json");
    const tokens = sample();
    await saveOAuthTokens(path, tokens);
    const raw = await readFile(path, "utf-8");
    expect(JSON.parse(raw)).toEqual(tokens);
  });

  it("saveOAuthTokens chmods the file to 0600 on POSIX", async () => {
    if (process.platform === "win32") {
      // chmod is best-effort on Windows; skip the assertion there.
      return;
    }
    const path = join(dir, "tokens.json");
    await saveOAuthTokens(path, sample());
    const st = await stat(path);
    // mask off file-type bits, keep just the permission bits
    const mode = st.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("saveOAuthTokens writes via temp+rename (no .tmp left over)", async () => {
    const path = join(dir, "tokens.json");
    await saveOAuthTokens(path, sample());
    await expect(stat(`${path}.tmp`)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("isExpired", () => {
  it("returns true when nowMs is past expiresAt", () => {
    const tokens = sample({ expiresAt: 1_000 });
    expect(isExpired(tokens, 2_000)).toBe(true);
  });

  it("returns true when nowMs is within the 60s buffer", () => {
    const tokens = sample({ expiresAt: 100_000 });
    // 30s before expiry → still considered expired (buffer)
    expect(isExpired(tokens, 100_000 - 30_000)).toBe(true);
    // exactly at the edge of the buffer → still expired
    expect(isExpired(tokens, 100_000 - 60_000)).toBe(true);
  });

  it("returns false when the token has plenty of life", () => {
    const tokens = sample({ expiresAt: 100_000 });
    // 10 minutes before expiry → fresh
    expect(isExpired(tokens, 100_000 - 10 * 60 * 1000)).toBe(false);
  });

  it("uses Date.now() when nowMs is omitted", () => {
    const tokens = sample({ expiresAt: Date.now() + 60 * 60 * 1000 });
    expect(isExpired(tokens)).toBe(false);
  });
});
