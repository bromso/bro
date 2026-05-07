import type { McpServerEntry } from "./config-writer";

export interface PairResult {
  readonly code: string;
  readonly sessionId: string;
  readonly expiresAt: number;
}

export interface PairWithRelayOptions {
  readonly relayUrl: string;
  readonly fetchFn: typeof fetch;
}

export async function pairWithRelay(options: PairWithRelayOptions): Promise<PairResult> {
  const resp = await options.fetchFn(`${options.relayUrl}/pair`, { method: "POST" });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`E_RELAY_PAIR_FAILED: ${resp.status} ${detail}`);
  }
  return (await resp.json()) as PairResult;
}

export interface FormatPairBannerOptions {
  readonly code: string;
  readonly expiresAt: number;
  readonly now?: number;
}

export function formatPairBanner(options: FormatPairBannerOptions): string {
  const now = options.now ?? Date.now();
  const ttlMs = Math.max(0, options.expiresAt - now);
  const minutes = Math.floor(ttlMs / 60_000);
  const seconds = Math.floor((ttlMs % 60_000) / 1_000);
  const ttl = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  return [
    "",
    "  ┌────────────────────────────────────────┐",
    `  │  Pairing code: ${options.code}                    │`,
    `  │  expires in ${ttl.padEnd(20)}      │`,
    "  └────────────────────────────────────────┘",
    "",
    "  Open the Figma plugin and enter this code to pair.",
    "",
  ].join("\n");
}

export interface CloudEntryOptions {
  readonly relayUrl: string;
  readonly sessionId: string;
}

export function cloudEntry(options: CloudEntryOptions): McpServerEntry {
  return {
    type: "http",
    url: `${options.relayUrl}/mcp/${options.sessionId}`,
  };
}

export const DEFAULT_RELAY_URL = "https://figma-mcp-relay.bromso.workers.dev";
