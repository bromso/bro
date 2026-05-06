/**
 * @repo/transport — WebSocket framing, request/response correlation,
 * reconnect/backoff. Wire format reuses @repo/protocol envelopes.
 *
 * Out of scope (intentional):
 * - MCP SDK glue (Phase 3's apps/mcp-server).
 * - Figma plugin manifest / allowedDomains (Phase 4's apps/bridge-plugin).
 * - Cloudflare relay routing (Phase 6's apps/relay).
 */

export type { CorrelatorOptions, RequestOptions } from "./correlator";
export { Correlator, TransportError } from "./correlator";
export type { BackoffOptions, ReconnectOptions } from "./reconnect";
export { computeBackoff, withReconnect } from "./reconnect";
export type { Transport } from "./transport";
export type { ConnectOptions } from "./websocket-client";
export { WebSocketClientTransport } from "./websocket-client";
export type { ListenOptions } from "./websocket-server";
export { WebSocketServerTransport } from "./websocket-server";
