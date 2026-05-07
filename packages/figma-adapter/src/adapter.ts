/**
 * Editor-type discriminator — mirrors `figma.editorType` from the
 * Figma plugin API. Tools that branch on editor (e.g. FigJam-only
 * stickies) use this to short-circuit with `E_FIGMA_EDITOR_TYPE_MISMATCH`
 * before touching the API.
 */
export type EditorType = "figma" | "figjam" | "slides";

/**
 * Subset of `figma.Variable` used by Phase 2/3 tools. Extend as new
 * tools land — keep this surface minimal, not a leaky 1:1 mirror of
 * the plugin types.
 */
export interface Variable {
  readonly id: string;
  readonly name: string;
  readonly resolvedType: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
  readonly valuesByMode: Readonly<Record<string, unknown>>;
}

/**
 * Variable collection summary. Modes are exposed by `id` + `name` so
 * Phase 5's plugin handlers can resolve user-facing mode names back
 * to plugin ids without leaking the raw `figma` types upstream.
 */
export interface VariableCollection {
  readonly id: string;
  readonly name: string;
  readonly modes: readonly { readonly id: string; readonly name: string }[];
}

export interface RectangleNode {
  readonly id: string;
  readonly type: "RECTANGLE";
  readonly width: number;
  readonly height: number;
}

export interface FrameNode {
  readonly id: string;
  readonly type: "FRAME";
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly name: string;
}

export interface TextNode {
  readonly id: string;
  readonly type: "TEXT";
  readonly characters: string;
  readonly fontSize: number;
  readonly x: number;
  readonly y: number;
}

export interface EllipseNode {
  readonly id: string;
  readonly type: "ELLIPSE";
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
}

export interface LineNode {
  readonly id: string;
  readonly type: "LINE";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface StickyNode {
  readonly id: string;
  readonly type: "STICKY";
  readonly content: string;
  readonly authorName?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SectionNode {
  readonly id: string;
  readonly type: "SECTION";
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ConnectorNode {
  readonly id: string;
  readonly type: "CONNECTOR";
  readonly startNodeId: string;
  readonly endNodeId: string;
}

export interface CodeBlockNode {
  readonly id: string;
  readonly type: "CODE_BLOCK";
  readonly code: string;
  readonly language: string;
  readonly x: number;
  readonly y: number;
}

export type ShapeWithTextShape =
  | "square"
  | "ellipse"
  | "rounded_rectangle"
  | "diamond"
  | "triangle_up"
  | "triangle_down"
  | "parallelogram_right"
  | "parallelogram_left";

export interface ShapeWithTextNode {
  readonly id: string;
  readonly type: "SHAPE_WITH_TEXT";
  readonly shape: ShapeWithTextShape;
  readonly content: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TableNode {
  readonly id: string;
  readonly type: "TABLE";
  readonly rows: number;
  readonly columns: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// ---- Phase 12 (slides) ----

export interface SlideNode {
  readonly id: string;
  readonly type: "SLIDE";
  readonly name: string;
  readonly isSkipped: boolean;
  readonly fills: readonly SolidPaint[];
  readonly width: number;
  readonly height: number;
}

export interface SlideRowNode {
  readonly id: string;
  readonly type: "SLIDE_ROW";
  readonly name: string;
}

export type SlideTransitionStyle =
  | "NONE"
  | "DISSOLVE"
  | "SLIDE_FROM_LEFT"
  | "SLIDE_FROM_RIGHT"
  | "SLIDE_FROM_TOP"
  | "SLIDE_FROM_BOTTOM"
  | "PUSH_FROM_LEFT"
  | "PUSH_FROM_RIGHT"
  | "PUSH_FROM_TOP"
  | "PUSH_FROM_BOTTOM"
  | "MOVE_FROM_LEFT"
  | "MOVE_FROM_RIGHT"
  | "MOVE_FROM_TOP"
  | "MOVE_FROM_BOTTOM"
  | "SLIDE_OUT_TO_LEFT"
  | "SLIDE_OUT_TO_RIGHT"
  | "SLIDE_OUT_TO_TOP"
  | "SLIDE_OUT_TO_BOTTOM"
  | "MOVE_OUT_TO_LEFT"
  | "MOVE_OUT_TO_RIGHT"
  | "MOVE_OUT_TO_TOP"
  | "MOVE_OUT_TO_BOTTOM"
  | "SMART_ANIMATE";

export type SlideTransitionCurve =
  | "EASE_IN"
  | "EASE_OUT"
  | "EASE_IN_AND_OUT"
  | "LINEAR"
  | "GENTLE"
  | "QUICK"
  | "BOUNCY"
  | "SLOW";

export type SlideTransitionTimingType = "ON_CLICK" | "AFTER_DELAY";

export interface SlideTransition {
  readonly style: SlideTransitionStyle;
  readonly duration: number;
  readonly curve: SlideTransitionCurve;
  readonly timing: {
    readonly type: SlideTransitionTimingType;
    readonly delay?: number;
  };
}

export type SlidesView = "grid" | "single-slide";

export type SolidPaint = {
  readonly type: "SOLID";
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  readonly opacity?: number;
};

export interface NodeSnapshot {
  readonly id: string;
  readonly type: string;
  readonly width?: number;
  readonly height?: number;
  readonly x?: number;
  readonly y?: number;
  readonly characters?: string;
  readonly fontSize?: number;
  readonly fills?: readonly SolidPaint[];
  readonly strokes?: readonly SolidPaint[];
  readonly strokeWeight?: number;
  // FigJam-specific (Phase 10):
  readonly content?: string;
  readonly authorName?: string;
  readonly name?: string;
  readonly startNodeId?: string;
  readonly endNodeId?: string;
  readonly code?: string;
  readonly language?: string;
  readonly shape?: ShapeWithTextShape;
  readonly rows?: number;
  readonly columns?: number;
  // Phase 12 (slides):
  readonly isSkipped?: boolean;
}

export interface PageSelection {
  readonly nodeIds: readonly string[];
}

/**
 * Common metadata shared by every local style. Concrete style types
 * extend this with a `type` discriminator and their own payload.
 */
export interface StyleBase {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

/** Paint style (fills, e.g. solid colors, gradients). */
export interface PaintStyle extends StyleBase {
  readonly type: "PAINT";
  readonly paints: readonly Readonly<{ type: string; visible?: boolean }>[];
}

/** Text style (font + size + line height + tracking). */
export interface TextStyle extends StyleBase {
  readonly type: "TEXT";
  readonly fontName: { family: string; style: string };
  readonly fontSize: number;
  readonly lineHeight?: { value: number; unit: "PIXELS" | "PERCENT" } | { unit: "AUTO" };
  readonly letterSpacing?: { value: number; unit: "PIXELS" | "PERCENT" };
}

/** Effect style (drop shadows, blurs). */
export interface EffectStyle extends StyleBase {
  readonly type: "EFFECT";
  readonly effects: readonly Readonly<{ type: string; visible?: boolean }>[];
}

/** Component metadata (no node tree — keep it light). */
export interface Component {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly description?: string;
}

// ---- Phase 13 (a11y) ----

/**
 * A node-level annotation as exposed by the Figma plugin API.
 * `label` is the displayed text; `categoryId` ties the annotation
 * to a category from `figma.annotations.categories`.
 *
 * Plugin API note: per-annotation stable ids are not exposed.
 * Our tools address annotations by array index in `node.annotations`.
 */
export interface Annotation {
  readonly label?: string;
  readonly categoryId?: string;
}

export type A11yMetaKey = "altText" | "ariaLabel" | "landmarkRole";

export interface NodeA11yMeta {
  readonly altText?: string;
  readonly ariaLabel?: string;
  readonly landmarkRole?: string;
}

export interface ResolvedFill {
  readonly hex: string;
  readonly opacity: number;
}

export interface NodeBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The Phase 2 surface. Every plugin-side tool handler ultimately
 * depends on this interface — the `RealFigmaAdapter` (lands in
 * Phase 4) calls `figma.*`, and `FigmaFake` (this package's
 * `./testing` export) is purely in-memory.
 */
export interface FigmaAdapter {
  readonly editorType: EditorType;

  getLocalVariablesAsync(): Promise<Variable[]>;

  setValueForMode(args: { variableId: string; modeId: string; value: unknown }): Promise<void>;

  createRectangle(): RectangleNode;

  readonly currentPageSelection: PageSelection;

  getLocalPaintStylesAsync(): Promise<PaintStyle[]>;

  getLocalTextStylesAsync(): Promise<TextStyle[]>;

  getLocalEffectStylesAsync(): Promise<EffectStyle[]>;

  getLocalComponentsAsync(): Promise<Component[]>;

  getLocalVariableCollectionsAsync(): Promise<VariableCollection[]>;

  createVariableCollection(args: { name: string }): Promise<VariableCollection>;

  createVariable(args: {
    name: string;
    collectionId: string;
    resolvedType: Variable["resolvedType"];
  }): Promise<Variable>;

  deleteVariableAsync(id: string): Promise<void>;

  createFrame(args: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    name?: string;
  }): Promise<FrameNode>;

  createText(args: {
    content: string;
    fontSize?: number;
    x?: number;
    y?: number;
  }): Promise<TextNode>;

  createEllipse(args: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  }): Promise<EllipseNode>;

  createLine(args: { x1: number; y1: number; x2: number; y2: number }): Promise<LineNode>;

  setNodeFill(args: { nodeId: string; paint: SolidPaint }): Promise<void>;

  setNodeStroke(args: { nodeId: string; paint: SolidPaint; weight?: number }): Promise<void>;

  setTextContent(args: { nodeId: string; characters: string }): Promise<void>;

  resizeNode(args: { nodeId: string; width: number; height: number }): Promise<void>;

  cloneNode(args: { nodeId: string }): Promise<{ id: string }>;

  deleteNode(args: { nodeId: string }): Promise<void>;

  createComponent(args: { nodeId: string }): Promise<Component>;

  getNodeById(args: { nodeId: string }): Promise<NodeSnapshot | null>;

  // ---- Phase 10: FigJam-specific node creation and mutation ----

  createSticky(args: {
    content: string;
    authorName?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): Promise<StickyNode>;

  createSection(args: {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<SectionNode>;

  createConnector(args: { startNodeId: string; endNodeId: string }): Promise<ConnectorNode>;

  createCodeBlock(args: {
    code: string;
    language?: string;
    x?: number;
    y?: number;
  }): Promise<CodeBlockNode>;

  createShapeWithText(args: {
    shape: ShapeWithTextShape;
    content: string;
    x?: number;
    y?: number;
    width: number;
    height: number;
  }): Promise<ShapeWithTextNode>;

  createTable(args: {
    rows: number;
    columns: number;
    x?: number;
    y?: number;
    width: number;
    height: number;
  }): Promise<TableNode>;

  setStickyContent(args: { nodeId: string; content: string }): Promise<void>;

  setSectionName(args: { nodeId: string; name: string }): Promise<void>;

  moveIntoSection(args: { sectionId: string; nodeIds: readonly string[] }): Promise<void>;

  listSectionChildren(args: { sectionId: string }): Promise<readonly string[]>;

  // ---- Phase 12: Slides-specific node creation and grid management ----

  createSlide(args: { name?: string; rowIndex?: number; columnIndex?: number }): Promise<SlideNode>;

  createSlideRow(args: { rowIndex?: number }): Promise<SlideRowNode>;

  setSlideName(args: { slideId: string; name: string }): Promise<void>;

  setSlideSkipped(args: { slideId: string; skipped: boolean }): Promise<void>;

  setSlideTransition(args: {
    slideId: string;
    style: SlideTransitionStyle;
    durationSec?: number;
    curve?: SlideTransitionCurve;
    timingType?: SlideTransitionTimingType;
    timingDelaySec?: number;
  }): Promise<void>;

  getSlideTransition(args: { slideId: string }): Promise<SlideTransition>;

  setSlideBackground(args: { slideId: string; paint: SolidPaint }): Promise<void>;

  moveSlide(args: { slideId: string; rowIndex: number; columnIndex: number }): Promise<void>;

  duplicateSlide(args: { slideId: string }): Promise<SlideNode>;

  deleteSlide(args: { slideId: string }): Promise<void>;

  listSlides(args: { rowIndex?: number }): Promise<readonly string[]>;

  listSlideRows(): Promise<readonly string[]>;

  setActiveSlide(args: { slideId: string }): Promise<void>;

  getActiveSlideId(): Promise<string | null>;

  setSlidesView(args: { view: SlidesView }): Promise<void>;

  getSlidesView(): Promise<SlidesView>;

  getSlideGrid(): Promise<readonly (readonly string[])[]>;

  // ---- Phase 13: Accessibility metadata + computed properties ----

  /** Read all `a11y/*` plugin-data keys for a node. */
  getNodeA11yMeta(args: { nodeId: string }): Promise<NodeA11yMeta>;

  /**
   * Write a single `a11y/<key>` plugin-data entry. Pass `value: null`
   * to delete the key (writes the empty string under the hood — Figma's
   * plugin-data API uses "" as the absent value).
   */
  setNodeA11yMeta(args: { nodeId: string; key: A11yMetaKey; value: string | null }): Promise<void>;

  /** Read the current annotation array for a node. */
  getNodeAnnotations(args: { nodeId: string }): Promise<readonly Annotation[]>;

  /** Replace the annotation array for a node. */
  setNodeAnnotations(args: { nodeId: string; annotations: readonly Annotation[] }): Promise<void>;

  /**
   * Return the first SOLID paint on the node as `{hex, opacity}`,
   * or `null` if the node has no solid fill (or fills are mixed /
   * not solid). For text contrast, callers want the text node's
   * own fill — not its ancestors'. (Use `getResolvedBackground`
   * for the ancestor walk.)
   */
  getResolvedTextFill(args: { nodeId: string }): Promise<ResolvedFill | null>;

  /**
   * Walk up the parent chain to the first ancestor with a SOLID
   * paint, returning `{hex, opacity}`. Returns `null` if no
   * ancestor has a solid fill. Skips nodes whose fills are
   * gradients / images / mixed (those can't be auto-graded for
   * contrast).
   */
  getResolvedBackground(args: { nodeId: string }): Promise<ResolvedFill | null>;

  /**
   * Return the node's `absoluteBoundingBox` in page-space CSS pixels.
   * Returns `null` when the node has no positional dimensions
   * (e.g. the document / page node).
   */
  getNodeBoundingBox(args: { nodeId: string }): Promise<NodeBoundingBox | null>;
}
