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
}
