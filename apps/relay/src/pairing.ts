export interface PairingCodeStoreOptions {
  readonly ttlMs: number;
  readonly now?: () => number;
}

interface Entry {
  sessionId: string;
  expiresAt: number;
  consumed: boolean;
}

export class PairingCodeStore {
  private readonly entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: PairingCodeStoreOptions) {
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? (() => Date.now());
  }

  generate(sessionId: string): { code: string; expiresAt: number } {
    const code = generateSixDigitCode();
    const expiresAt = this.now() + this.ttlMs;
    this.entries.set(code, { sessionId, expiresAt, consumed: false });
    return { code, expiresAt };
  }

  validate(code: string): { sessionId: string; consumed: boolean } | null {
    const entry = this.entries.get(code);
    if (!entry) return null;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(code);
      return null;
    }
    return { sessionId: entry.sessionId, consumed: entry.consumed };
  }

  consume(code: string): string | null {
    const entry = this.entries.get(code);
    if (!entry) return null;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(code);
      return null;
    }
    if (entry.consumed) return null;
    entry.consumed = true;
    return entry.sessionId;
  }
}

function generateSixDigitCode(): string {
  // crypto.getRandomValues exists in the Workers runtime AND Node 19+.
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const n = arr[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}
