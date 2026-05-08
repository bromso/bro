import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FigmaApiError } from "../errors";
import { refreshOAuthToken } from "../oauth-refresh";

const mkResp = (body: unknown, init: ResponseInit = { status: 200 }) =>
  new Response(JSON.stringify(body), init);

const FIXED_NOW = 1_700_000_000_000;

describe("refreshOAuthToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("happy path — POSTs to /v1/oauth/refresh and returns a new OAuthTokenSet", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({
        access_token: "new-at",
        refresh_token: "new-rt",
        expires_in: 3600,
        scope: "file_read file_metadata:read",
      })
    );
    const tokens = await refreshOAuthToken({
      clientId: "cid",
      clientSecret: "cs",
      refreshToken: "old-rt",
      fetchFn,
    });
    expect(tokens).toEqual({
      accessToken: "new-at",
      refreshToken: "new-rt",
      expiresAt: FIXED_NOW + 3600 * 1000,
      scope: "file_read file_metadata:read",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.figma.com/v1/oauth/refresh");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
  });

  it("body — urlencoded with grant_type=refresh_token + the expected fields", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({
        access_token: "new-at",
        expires_in: 100,
        scope: "file_read",
      })
    );
    await refreshOAuthToken({
      clientId: "MY-CID",
      clientSecret: "MY-SECRET",
      refreshToken: "MY-RT",
      fetchFn,
    });
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    const body = init.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("client_id")).toBe("MY-CID");
    expect(params.get("client_secret")).toBe("MY-SECRET");
    expect(params.get("refresh_token")).toBe("MY-RT");
  });

  it("reuses the input refresh_token when Figma omits one in the response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({
        access_token: "new-at",
        expires_in: 60,
        scope: "file_read",
        // no refresh_token
      })
    );
    const tokens = await refreshOAuthToken({
      clientId: "cid",
      clientSecret: "cs",
      refreshToken: "RECYCLED",
      fetchFn,
    });
    expect(tokens.refreshToken).toBe("RECYCLED");
  });

  it("surfaces a fresh refresh_token when Figma returns one", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({
        access_token: "new-at",
        refresh_token: "FRESH-RT",
        expires_in: 60,
        scope: "file_read",
      })
    );
    const tokens = await refreshOAuthToken({
      clientId: "cid",
      clientSecret: "cs",
      refreshToken: "OLD",
      fetchFn,
    });
    expect(tokens.refreshToken).toBe("FRESH-RT");
  });

  it("throws FigmaApiError with E_FIGMA_REST_AUTH on a 401", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ error: "invalid_grant" }, { status: 401 }));
    await expect(
      refreshOAuthToken({
        clientId: "cid",
        clientSecret: "cs",
        refreshToken: "rt",
        fetchFn,
      })
    ).rejects.toBeInstanceOf(FigmaApiError);
    await expect(
      refreshOAuthToken({
        clientId: "cid",
        clientSecret: "cs",
        refreshToken: "rt",
        fetchFn,
      })
    ).rejects.toMatchObject({ status: 401, code: "E_FIGMA_REST_AUTH" });
  });

  it("throws FigmaApiError with E_FIGMA_REST_UNKNOWN on a 500", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkResp({ error: "boom" }, { status: 500 }));
    await expect(
      refreshOAuthToken({
        clientId: "cid",
        clientSecret: "cs",
        refreshToken: "rt",
        fetchFn,
      })
    ).rejects.toMatchObject({ status: 500, code: "E_FIGMA_REST_UNKNOWN" });
  });

  it("computes expiresAt from Date.now() + expires_in*1000", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mkResp({
        access_token: "new-at",
        expires_in: 7200,
        scope: "file_read",
      })
    );
    const tokens = await refreshOAuthToken({
      clientId: "cid",
      clientSecret: "cs",
      refreshToken: "rt",
      fetchFn,
    });
    expect(tokens.expiresAt).toBe(FIXED_NOW + 7200 * 1000);
  });
});
