/**
 * @repo/tools-rest — REST-API-backed read tools (cloud-mode-without-plugin).
 *
 * Tools call the Figma REST API via @repo/figma-api-client. Auth is
 * FIGMA_API_KEY env (read in apps/mcp-server/src/main.ts and threaded
 * through ServerHandlerContext). Three tools mutate (post_file_comment,
 * delete_file_comment, post_dev_resources); they're gated behind the
 * --enable-write-tools daemon flag.
 *
 * Phase 11.4 adds the requireApiKey + write-tool gate guards. Phase
 * 11.5-11.10 add the 20 tool definitions and server-handlers.
 */

export {
  E_FIGMA_API_KEY_MISSING,
  E_WRITE_TOOLS_DISABLED,
  mapRestError,
  requireApiKey,
  requireWriteEnabled,
} from "./guards";
export * from "./server-handlers";
export * from "./tools";
