/**
 * @repo/figma-adapter — typed seam over the Figma plugin runtime.
 *
 * Out of scope (intentional):
 * - REST API client (lands in Phase 8 with `@repo/tools-rest`).
 */
export type {
  Component,
  EditorType,
  EffectStyle,
  EllipseNode,
  FigmaAdapter,
  FrameNode,
  LineNode,
  NodeSnapshot,
  PageSelection,
  PaintStyle,
  RectangleNode,
  SolidPaint,
  StyleBase,
  TextNode,
  TextStyle,
  Variable,
  VariableCollection,
} from "./adapter";
export { RealFigmaAdapter } from "./real-figma-adapter";
