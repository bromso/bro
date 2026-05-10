/// <reference types="node" />
/**
 * Phase 22 — daemon-side OAuth flow.
 *
 * Three-step flow with seams (`fetchFn`, `browserOpener`, `sleeper`,
 * `now`) so tests can drive the polling loop synchronously and the
 * production caller can use the real defaults:
 *
 *   1. Generate a sid (`sid_<random>`).
 *   2. POST /oauth/start?sid=<sid> on the relay → receives {authorizeUrl}.
 *   3. Open the user's browser at authorizeUrl.
 *   4. Poll /oauth/result?sid=<sid> every 1s until 200 (done), 410 (expired),
 *      or 5xx (retry up to 3 times then fail). Times out after 5 minutes.
 *   5. On 200 with tokens, write them via `saveOAuthTokens`.
 *
 * The polling cadence is intentionally low-frequency (1s) — the relay's DO
 * is keyed by sid so each poll only consults its own DO instance, and the
 * 5-minute window is dominated by user think-time (clicking through the
 * Figma consent screen). Faster polling adds load without speeding up the
 * common case.
 */

import { defaultSaveOAuthTokens, type SaveOAuthTokens } from "./oauth-flow-helpers";

export type Platform = NodeJS.Platform;

export interface BrowserOpener {
  open(url: string): Promise<void>;
}

export interface OAuthFlowOptions {
  readonly relayUrl: string;
  readonly tokenPath: string;
  readonly fetchFn?: typeof fetch;
  readonly browserOpener?: BrowserOpener;
  readonly sleeper?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly saveTokens?: SaveOAuthTokens;
  /** Random sid generator. Defaults to crypto.randomUUID. */
  readonly newSid?: () => string;
  /** Override timeouts for tests. */
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly maxServerErrors?: number;
}

export interface OAuthFlowResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly scope: string;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_MAX_SERVER_ERRORS = 3;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const defaultNewSid = (): string => {
  // Use the global Web Crypto API — available in Node 20+ and Workers,
  // matching the relay's `crypto.randomUUID()` usage. Strip the dashes so
  // the sid passes the relay's `sid_[A-Za-z0-9]{8,64}` validator.
  const random = crypto.randomUUID().replace(/-/g, "");
  return `sid_${random}`;
};

export async function runOAuthFlow(options: OAuthFlowOptions): Promise<OAuthFlowResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const browser = options.browserOpener ?? defaultBrowserOpener();
  const sleeper = options.sleeper ?? defaultSleep;
  const now = options.now ?? Date.now;
  const saveTokens = options.saveTokens ?? defaultSaveOAuthTokens;
  const newSid = options.newSid ?? defaultNewSid;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxServerErrors = options.maxServerErrors ?? DEFAULT_MAX_SERVER_ERRORS;

  const sid = newSid();
  const relayBase = options.relayUrl.replace(/\/$/, "");

  // Step 1 — POST /oauth/start.
  const startResp = await fetchFn(`${relayBase}/oauth/start?sid=${sid}`, { method: "POST" });
  if (!startResp.ok) {
    const detail = await startResp.text().catch(() => "");
    throw new Error(`E_OAUTH_START_FAILED: ${startResp.status} ${detail}`);
  }
  const { authorizeUrl } = (await startResp.json()) as { authorizeUrl?: string };
  if (typeof authorizeUrl !== "string" || authorizeUrl.length === 0) {
    throw new Error("E_OAUTH_START_NO_URL");
  }

  // Step 2 — open the browser. We don't await user interaction; the polling
  // loop below picks up the result whenever the user finishes consenting.
  await browser.open(authorizeUrl);

  // Step 3 — poll /oauth/result. Loop bounded by `timeoutMs` from `now()`
  // rather than wall-clock so tests with a fake clock terminate.
  const startedAt = now();
  let serverErrorCount = 0;
  while (now() - startedAt < timeoutMs) {
    const pollResp = await fetchFn(`${relayBase}/oauth/result?sid=${sid}`, {
      method: "GET",
    });
    if (pollResp.status === 200) {
      const body = (await pollResp.json()) as { tokens?: OAuthFlowResult };
      if (!body.tokens) {
        throw new Error("E_OAUTH_RESULT_MALFORMED");
      }
      await saveTokens(options.tokenPath, body.tokens);
      return body.tokens;
    }
    if (pollResp.status === 202) {
      serverErrorCount = 0;
      await sleeper(pollIntervalMs);
      continue;
    }
    if (pollResp.status === 410) {
      throw new Error("E_OAUTH_SESSION_EXPIRED");
    }
    if (pollResp.status === 404) {
      throw new Error("E_OAUTH_SESSION_UNKNOWN");
    }
    if (pollResp.status >= 500) {
      serverErrorCount += 1;
      if (serverErrorCount > maxServerErrors) {
        throw new Error(`E_OAUTH_RELAY_5XX: ${pollResp.status}`);
      }
      await sleeper(pollIntervalMs);
      continue;
    }
    // Unexpected status — fail loudly.
    const detail = await pollResp.text().catch(() => "");
    throw new Error(`E_OAUTH_RESULT_UNEXPECTED: ${pollResp.status} ${detail}`);
  }

  throw new Error("E_OAUTH_TIMEOUT");
}

/**
 * Default browser opener — spawns the platform's "open URL" command.
 * Mirrors the platform switch in `cli/open-figma.ts` but for arbitrary
 * URLs rather than for revealing a manifest in Finder.
 */
export function buildBrowserOpenCommand(opts: {
  readonly platform: Platform;
  readonly url: string;
}): { readonly cmd: string; readonly args: ReadonlyArray<string> } {
  if (opts.platform === "darwin") {
    return { cmd: "open", args: [opts.url] };
  }
  if (opts.platform === "win32") {
    // `start` is a cmd.exe builtin; the empty "" first arg is the window
    // title, required when the URL itself is wrapped in quotes.
    return { cmd: "cmd", args: ["/c", "start", "", opts.url] };
  }
  return { cmd: "xdg-open", args: [opts.url] };
}

function defaultBrowserOpener(): BrowserOpener {
  return {
    async open(url: string) {
      // Lazy import so unit tests of `runOAuthFlow` don't need to mock
      // child_process — the production path runs through this opener,
      // tests pass their own.
      const { spawn } = await import("node:child_process");
      const { cmd, args } = buildBrowserOpenCommand({
        platform: process.platform,
        url,
      });
      const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
      child.unref?.();
    },
  };
}
