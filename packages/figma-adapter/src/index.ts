/**
 * @repo/figma-adapter — typed seam over the Figma plugin runtime.
 *
 * Out of scope (intentional):
 * - `RealFigmaAdapter` (lands in Phase 4 alongside `apps/bridge-plugin`).
 * - REST API client (lands in Phase 8 with `@repo/tools-rest`).
 */
export type {
  EditorType,
  FigmaAdapter,
  PageSelection,
  RectangleNode,
  Variable,
} from "./adapter";
