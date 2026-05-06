import { ErrorCode } from "@repo/protocol";
import { TransportError } from "./correlator";

export interface BackoffOptions {
  /** Initial delay in ms before the second attempt. */
  readonly baseMs: number;
  /** Cap on delay. */
  readonly maxMs: number;
  /** Random source — `Math.random` in production, deterministic in tests. */
  readonly random?: () => number;
}

export interface ReconnectOptions extends BackoffOptions {
  /** Total number of attempts including the first. */
  readonly maxAttempts: number;
  /** Cancel pending retries. */
  readonly signal?: AbortSignal;
}

/**
 * Exponential backoff with +/- 50% jitter. `attempt` is 0-indexed:
 * attempt 0 returns ~baseMs, attempt 1 returns ~2*baseMs, etc.
 */
export function computeBackoff(attempt: number, options: BackoffOptions): number {
  const random = options.random ?? Math.random;
  const exp = Math.min(options.maxMs, options.baseMs * 2 ** attempt);
  const jitter = exp * (random() - 0.5); // [-0.5, 0.5] * exp
  return Math.max(0, Math.round(exp + jitter));
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function withReconnect<T>(
  connect: () => Promise<T>,
  options: ReconnectOptions
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await connect();
    } catch (err) {
      lastErr = err;
      if (attempt === options.maxAttempts - 1) break;
      const delay = computeBackoff(attempt, options);
      await sleep(delay, options.signal);
    }
  }
  throw new TransportError({
    kind: "error",
    id: "reconnect",
    ok: false,
    code: ErrorCode.E_BRIDGE_UNAVAILABLE,
    category: "transport",
    message: `connect failed after ${options.maxAttempts} attempts`,
    details: { lastError: String(lastErr) },
  });
}
