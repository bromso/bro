/**
 * @repo/protocol — single source of truth for envelope, error,
 * streaming, and tool registry contracts.
 *
 * Out of scope (intentional):
 * - Transport interface (Phase 2's `@repo/transport`).
 * - FigmaAdapter (Phase 2's `@repo/figma-adapter`; placeholder seam
 *   lives in `./tools.ts` until then).
 * - MCP server SDK glue (Phase 3's `apps/mcp-server`).
 */
export * from "./envelope";
export * from "./errors";
export * from "./streaming";
export * from "./tools";
