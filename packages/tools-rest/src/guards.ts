import { type FigmaApi, FigmaApiError } from "@repo/figma-api-client";

export const E_FIGMA_API_KEY_MISSING = "E_FIGMA_API_KEY_MISSING";
export const E_WRITE_TOOLS_DISABLED = "E_WRITE_TOOLS_DISABLED";

/**
 * REST-tool entry guard. Every server-handler in this pack calls
 * `requireApiKey(figmaApi, "<tool_name>")` BEFORE any work. When the
 * daemon was started without `FIGMA_API_KEY` in the environment,
 * `figmaApi` is null and this throws.
 */
export function requireApiKey(figmaApi: FigmaApi | null | undefined, toolName: string): FigmaApi {
  if (!figmaApi) {
    throw new Error(
      `${E_FIGMA_API_KEY_MISSING}: ${toolName} requires FIGMA_API_KEY in the environment`
    );
  }
  return figmaApi;
}

/**
 * Write-tool gate. Only the three mutating tools call this:
 * `post_file_comment`, `delete_file_comment`, `post_dev_resources`.
 * The daemon constructs handlers with `enableWriteTools: false` by
 * default; `--enable-write-tools` flips it true.
 */
export function requireWriteEnabled(opts: { enableWriteTools: boolean }, toolName: string): void {
  if (!opts.enableWriteTools) {
    throw new Error(
      `${E_WRITE_TOOLS_DISABLED}: ${toolName} is gated behind --enable-write-tools (currently off)`
    );
  }
}

/**
 * Re-throw helper for handler bodies. Converts `FigmaApiError` into an
 * Error whose `.message` carries the wire code; passes other errors
 * through. Handlers wrap their REST calls in `try { … } catch (err) { mapRestError(err); }`.
 */
export function mapRestError(err: unknown): never {
  if (err instanceof FigmaApiError) {
    throw new Error(`${err.code}: ${err.message}`);
  }
  if (err instanceof Error) throw err;
  throw new Error(String(err));
}
