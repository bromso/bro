import type { FigmaAdapter } from "@repo/figma-adapter";

export const E_FIGMA_EDITOR_TYPE_MISMATCH = "E_FIGMA_EDITOR_TYPE_MISMATCH";

/**
 * Editor-type discriminator guard. Every FigJam tool handler calls
 * `requireFigJam(figma, "<tool_name>")` before touching the API.
 *
 * On mismatch, throws an Error whose `message` starts with
 * `E_FIGMA_EDITOR_TYPE_MISMATCH:` so the daemon's protocol-error
 * mapper surfaces it as the corresponding wire error code.
 */
export function requireFigJam(figma: FigmaAdapter, toolName: string): FigmaAdapter {
  if (figma.editorType !== "figjam") {
    throw new Error(
      `${E_FIGMA_EDITOR_TYPE_MISMATCH}: ${toolName} requires editorType=figjam (got ${figma.editorType})`
    );
  }
  return figma;
}
