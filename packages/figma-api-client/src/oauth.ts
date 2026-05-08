/**
 * Phase 21 — OAuth client-side scaffold.
 *
 * This module owns the on-disk token store the daemon will use to persist a
 * Figma OAuth bearer token across runs. The token-acquisition flow itself
 * (browser open, relay callback, code-for-token exchange) lands in Phase 22.
 *
 * Design notes:
 *   - Storage is a single JSON file (default `~/.figma-mcp/oauth.json` — the
 *     daemon picks the path; this module is path-agnostic). Plain JSON is
 *     deliberately chosen over the OS keychain because the daemon already
 *     reads PATs from `FIGMA_API_KEY`, so the keychain isn't an upgrade in
 *     threat model for v1.
 *   - File mode is forced to `0600` so that other users on a shared box
 *     can't read the refresh token. On Windows `chmod` is best-effort;
 *     we swallow the error rather than fail the save.
 *   - Writes are atomic via temp+rename to mirror the existing
 *     `cli/config-writer.ts` pattern — no half-written file if the daemon
 *     crashes mid-save.
 *   - `loadOAuthTokens` returns `null` for any failure mode (ENOENT, bad
 *     JSON, missing fields). The caller treats "no token on disk" and
 *     "token file is corrupt" identically — re-run the OAuth flow.
 */

import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface OAuthTokenSet {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Unix-ms epoch when the access token expires. */
  readonly expiresAt: number;
  /** Space-separated scope list returned by Figma. */
  readonly scope: string;
}

/**
 * Buffer applied by `isExpired` so the daemon refreshes shortly before the
 * actual expiry instead of racing the API and risking a 401.
 */
const EXPIRY_BUFFER_MS = 60_000;

export function isExpired(tokens: OAuthTokenSet, nowMs: number = Date.now()): boolean {
  return nowMs >= tokens.expiresAt - EXPIRY_BUFFER_MS;
}

export async function loadOAuthTokens(path: string): Promise<OAuthTokenSet | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    // Permission errors etc. — treat as "no usable token" so the daemon
    // re-runs the OAuth flow rather than crashing.
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isOAuthTokenSet(parsed)) return null;
  return parsed;
}

export async function saveOAuthTokens(path: string, tokens: OAuthTokenSet): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(tokens, null, 2)}\n`, "utf-8");
  await rename(tmp, path);
  // Best-effort chmod. On Windows this typically no-ops (`fs.chmod` exists
  // but the underlying mode bits don't map), and on locked-down NFS-style
  // mounts a chmod may EPERM. Either way we'd rather have the token saved
  // with the wrong mode than fail the whole save.
  try {
    await chmod(path, 0o600);
  } catch {
    // swallow
  }
}

function isOAuthTokenSet(value: unknown): value is OAuthTokenSet {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === "string" &&
    typeof v.refreshToken === "string" &&
    typeof v.expiresAt === "number" &&
    typeof v.scope === "string"
  );
}
