import type { EditorType, FigmaAdapter, PageSelection, RectangleNode, Variable } from "./adapter";

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
  private readonly nodes = new Map<string, RectangleNode>();
  private selection: readonly string[] = [];
  private nodeCounter = 0;

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
}
