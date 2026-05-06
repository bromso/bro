/**
 * @repo/protocol — single source of truth for envelope, error,
 * streaming, and tool registry contracts.
 *
 * Out of scope (intentional):
 * - Transport interface (Phase 2's `@repo/transport`).
 * - MCP server SDK glue (Phase 3's `apps/mcp-server`).
 */
export * from "./envelope";
export * from "./errors";
export * from "./streaming";
export * from "./tools";
