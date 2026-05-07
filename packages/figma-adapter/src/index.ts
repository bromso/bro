/**
 * @repo/figma-adapter — typed seam over the Figma plugin runtime.
 *
 * Out of scope (intentional):
 * - REST API client (lands in Phase 8 with `@repo/tools-rest`).
 */
export type {
  A11yMetaKey,
  Annotation,
  CodeBlockNode,
  Component,
  ConnectorNode,
  EditorType,
  EffectStyle,
  EllipseNode,
  FigmaAdapter,
  FrameNode,
  LineNode,
  NodeA11yMeta,
  NodeBoundingBox,
  NodeSnapshot,
  PageSelection,
  PaintStyle,
  RectangleNode,
  ResolvedFill,
  SectionNode,
  ShapeWithTextNode,
  ShapeWithTextShape,
  SlideNode,
  SlideRowNode,
  SlidesView,
  SlideTransition,
  SlideTransitionCurve,
  SlideTransitionStyle,
  SlideTransitionTimingType,
  SolidPaint,
  StickyNode,
  StyleBase,
  TableNode,
  TextNode,
  TextStyle,
  Variable,
  VariableCollection,
} from "./adapter";
export { RealFigmaAdapter } from "./real-figma-adapter";
