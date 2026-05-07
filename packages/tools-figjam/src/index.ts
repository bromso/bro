/**
 * @repo/tools-figjam — FigJam-specific tool pack: sticky notes, sections,
 * connectors, code blocks, shape-with-text, tables. Every handler is
 * editor-type-gated to "figjam"; calls from a Figma editor surface
 * E_FIGMA_EDITOR_TYPE_MISMATCH before touching the API.
 */

export { E_FIGMA_EDITOR_TYPE_MISMATCH, requireFigJam } from "./guard";
export * from "./plugin-handlers";
export * from "./tools";
