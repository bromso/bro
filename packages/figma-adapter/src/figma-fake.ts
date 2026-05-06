import type {
  Component,
  EditorType,
  EffectStyle,
  FigmaAdapter,
  PageSelection,
  PaintStyle,
  RectangleNode,
  TextStyle,
  Variable,
  VariableCollection,
} from "./adapter";

interface MutableVariable {
  id: string;
  name: string;
  resolvedType: Variable["resolvedType"];
  valuesByMode: Record<string, unknown>;
}

export interface FigmaFakeOptions {
  readonly editorType?: EditorType;
}

/**
 * In-memory FigmaAdapter implementation for tests. Methods prefixed
 * with `__` are seeding hooks for tests; production code never calls
 * them.
 */
export class FigmaFake implements FigmaAdapter {
  private _editorType: EditorType;
  private readonly variables = new Map<string, MutableVariable>();
  private readonly collections = new Map<string, VariableCollection>();
  private readonly nodes = new Map<string, RectangleNode>();
  private readonly paintStyles = new Map<string, PaintStyle>();
  private readonly textStyles = new Map<string, TextStyle>();
  private readonly effectStyles = new Map<string, EffectStyle>();
  private readonly components = new Map<string, Component>();
  private selection: readonly string[] = [];
  private nodeCounter = 0;
  private collectionCounter = 0;
  private variableCounter = 0;

  constructor(options: FigmaFakeOptions = {}) {
    this._editorType = options.editorType ?? "figma";
  }

  get editorType(): EditorType {
    return this._editorType;
  }

  async getLocalVariablesAsync(): Promise<Variable[]> {
    return Array.from(this.variables.values()).map((v) => ({
      id: v.id,
      name: v.name,
      resolvedType: v.resolvedType,
      valuesByMode: { ...v.valuesByMode },
    }));
  }

  async setValueForMode(args: {
    variableId: string;
    modeId: string;
    value: unknown;
  }): Promise<void> {
    const v = this.variables.get(args.variableId);
    if (!v) throw new Error(`variable not found: ${args.variableId}`);
    v.valuesByMode[args.modeId] = args.value;
  }

  createRectangle(): RectangleNode {
    const id = `r${++this.nodeCounter}`;
    const node: RectangleNode = { id, type: "RECTANGLE", width: 100, height: 100 };
    this.nodes.set(id, node);
    return node;
  }

  get currentPageSelection(): PageSelection {
    return { nodeIds: [...this.selection] };
  }

  async getLocalPaintStylesAsync(): Promise<PaintStyle[]> {
    return Array.from(this.paintStyles.values());
  }

  async getLocalTextStylesAsync(): Promise<TextStyle[]> {
    return Array.from(this.textStyles.values());
  }

  async getLocalEffectStylesAsync(): Promise<EffectStyle[]> {
    return Array.from(this.effectStyles.values());
  }

  async getLocalComponentsAsync(): Promise<Component[]> {
    return Array.from(this.components.values());
  }

  async getLocalVariableCollectionsAsync(): Promise<VariableCollection[]> {
    return Array.from(this.collections.values());
  }

  async createVariableCollection(args: { name: string }): Promise<VariableCollection> {
    const id = `vc${++this.collectionCounter}`;
    const collection: VariableCollection = {
      id,
      name: args.name,
      modes: [{ id: `m${id}_default`, name: "Default" }],
    };
    this.collections.set(id, collection);
    return collection;
  }

  async createVariable(args: {
    name: string;
    collectionId: string;
    resolvedType: Variable["resolvedType"];
  }): Promise<Variable> {
    if (!this.collections.has(args.collectionId)) {
      throw new Error(`collection not found: ${args.collectionId}`);
    }
    const id = `v${++this.variableCounter}`;
    const variable: MutableVariable = {
      id,
      name: args.name,
      resolvedType: args.resolvedType,
      valuesByMode: {},
    };
    this.variables.set(id, variable);
    return {
      id,
      name: variable.name,
      resolvedType: variable.resolvedType,
      valuesByMode: { ...variable.valuesByMode },
    };
  }

  async deleteVariableAsync(id: string): Promise<void> {
    if (!this.variables.has(id)) {
      throw new Error(`variable not found: ${id}`);
    }
    this.variables.delete(id);
  }

  // ---- Test seeding API ----

  __seedVariables(variables: readonly Variable[]): void {
    for (const v of variables) {
      this.variables.set(v.id, {
        id: v.id,
        name: v.name,
        resolvedType: v.resolvedType,
        valuesByMode: { ...v.valuesByMode },
      });
    }
  }

  __select(nodeIds: readonly string[]): void {
    this.selection = [...nodeIds];
  }

  __setEditorType(type: EditorType): void {
    this._editorType = type;
  }

  __seedPaintStyles(styles: readonly PaintStyle[]): void {
    for (const s of styles) this.paintStyles.set(s.id, s);
  }

  __seedTextStyles(styles: readonly TextStyle[]): void {
    for (const s of styles) this.textStyles.set(s.id, s);
  }

  __seedEffectStyles(styles: readonly EffectStyle[]): void {
    for (const s of styles) this.effectStyles.set(s.id, s);
  }

  __seedComponents(components: readonly Component[]): void {
    for (const c of components) this.components.set(c.id, c);
  }

  __seedCollections(collections: readonly VariableCollection[]): void {
    for (const c of collections) this.collections.set(c.id, c);
  }
}
