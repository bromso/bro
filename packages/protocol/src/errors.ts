export const ErrorCode = {
  // Protocol
  E_PROTOCOL_INVALID: "E_PROTOCOL_INVALID",
  E_PROTOCOL_VERSION_DRIFT: "E_PROTOCOL_VERSION_DRIFT",
  E_PROTOCOL_UNKNOWN_TOOL: "E_PROTOCOL_UNKNOWN_TOOL",
  E_PROTOCOL_OUTPUT_INVALID: "E_PROTOCOL_OUTPUT_INVALID",

  // Figma
  E_FIGMA_NO_PERMISSION: "E_FIGMA_NO_PERMISSION",
  E_FIGMA_NODE_NOT_FOUND: "E_FIGMA_NODE_NOT_FOUND",
  E_FIGMA_PLAN_LIMIT: "E_FIGMA_PLAN_LIMIT",
  E_FIGMA_EDITOR_TYPE_MISMATCH: "E_FIGMA_EDITOR_TYPE_MISMATCH",
  E_FIGMA_SANDBOX: "E_FIGMA_SANDBOX",
  E_FIGMA_UNKNOWN: "E_FIGMA_UNKNOWN",

  // Transport
  E_BRIDGE_UNAVAILABLE: "E_BRIDGE_UNAVAILABLE",
  E_BRIDGE_NOT_CONNECTED: "E_BRIDGE_NOT_CONNECTED",
  E_TRANSPORT_TIMEOUT: "E_TRANSPORT_TIMEOUT",

  // Stream
  E_STREAM_IDEMPOTENCY_CONFLICT: "E_STREAM_IDEMPOTENCY_CONFLICT",
  E_STREAM_SESSION_NOT_FOUND: "E_STREAM_SESSION_NOT_FOUND",
  E_STREAM_OUT_OF_ORDER: "E_STREAM_OUT_OF_ORDER",

  // Daemon
  E_DAEMON_LOCKFILE_STALE: "E_DAEMON_LOCKFILE_STALE",
  E_DAEMON_PORT_BOUND: "E_DAEMON_PORT_BOUND",
  E_DAEMON_VERSION_DRIFT: "E_DAEMON_VERSION_DRIFT",

  // Relay
  E_RELAY_PAIRING_EXPIRED: "E_RELAY_PAIRING_EXPIRED",
  E_RELAY_SESSION_NOT_FOUND: "E_RELAY_SESSION_NOT_FOUND",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ErrorCategory = "protocol" | "figma" | "transport" | "stream" | "daemon" | "relay";

const CATEGORY_PREFIX_MAP: Record<string, ErrorCategory> = {
  E_PROTOCOL: "protocol",
  E_FIGMA: "figma",
  E_BRIDGE: "transport",
  E_TRANSPORT: "transport",
  E_STREAM: "stream",
  E_DAEMON: "daemon",
  E_RELAY: "relay",
};

export function errorCategoryFor(code: ErrorCode): ErrorCategory {
  for (const [prefix, category] of Object.entries(CATEGORY_PREFIX_MAP)) {
    if (code.startsWith(prefix)) return category;
  }
  throw new Error(`Unknown error code prefix: ${code}`);
}
