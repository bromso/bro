/**
 * @repo/tools-slides — Slides-specific tool pack: slide creation, layout,
 * transitions, lifecycle, and grid queries. Every handler is editor-type-gated
 * to "slides"; calls from a Figma or FigJam editor surface
 * E_FIGMA_EDITOR_TYPE_MISMATCH before touching the API.
 */
export { E_FIGMA_EDITOR_TYPE_MISMATCH, requireSlides } from "./guard";
export * from "./plugin-handlers";
export * from "./tools";
