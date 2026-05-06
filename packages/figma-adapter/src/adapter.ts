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
}
