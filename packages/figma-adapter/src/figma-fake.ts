import type {
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
  TextNode,
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

interface PaintableMutableNode {
  fills: SolidPaint[];
  strokes: SolidPaint[];
  strokeWeight: number;
}

interface MutableRectangleNode extends PaintableMutableNode {
  id: string;
  type: "RECTANGLE";
  width: number;
  height: number;
  x: number;
  y: number;
}

interface MutableFrameNode extends PaintableMutableNode {
  id: string;
  type: "FRAME";
  width: number;
  height: number;
  x: number;
  y: number;
  name: string;
}

interface MutableTextNode extends PaintableMutableNode {
  id: string;
  type: "TEXT";
  characters: string;
  fontSize: number;
  x: number;
  y: number;
}

interface MutableEllipseNode extends PaintableMutableNode {
  id: string;
  type: "ELLIPSE";
  width: number;
  height: number;
  x: number;
  y: number;
}

interface MutableLineNode {
  id: string;
  type: "LINE";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokes: SolidPaint[];
  strokeWeight: number;
}

type AnyMutableNode =
  | MutableRectangleNode
  | MutableFrameNode
  | MutableTextNode
  | MutableEllipseNode
  | MutableLineNode;

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
  private readonly allNodes = new Map<string, AnyMutableNode>();
  private readonly paintStyles = new Map<string, PaintStyle>();
  private readonly textStyles = new Map<string, TextStyle>();
  private readonly effectStyles = new Map<string, EffectStyle>();
  private readonly components = new Map<string, Component>();
  private selection: readonly string[] = [];
  private nodeCounter = 0;
  private collectionCounter = 0;
  private variableCounter = 0;
  private frameCounter = 0;
  private textCounter = 0;
  private ellipseCounter = 0;
  private lineCounter = 0;
  private componentCounter = 0;

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
    const mutable: MutableRectangleNode = {
      id,
      type: "RECTANGLE",
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      fills: [],
      strokes: [],
      strokeWeight: 0,
    };
    this.allNodes.set(id, mutable);
    return { id, type: "RECTANGLE", width: mutable.width, height: mutable.height };
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

  // ---- Node creation (Phase 8) ----

  async createFrame(args: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    name?: string;
  }): Promise<FrameNode> {
    const id = `f${++this.frameCounter}`;
    const mutable: MutableFrameNode = {
      id,
      type: "FRAME",
      width: args.width,
      height: args.height,
      x: args.x ?? 0,
      y: args.y ?? 0,
      name: args.name ?? "",
      fills: [],
      strokes: [],
      strokeWeight: 0,
    };
    this.allNodes.set(id, mutable);
    return {
      id,
      type: "FRAME",
      width: mutable.width,
      height: mutable.height,
      x: mutable.x,
      y: mutable.y,
      name: mutable.name,
    };
  }

  async createText(args: {
    content: string;
    fontSize?: number;
    x?: number;
    y?: number;
  }): Promise<TextNode> {
    const id = `t${++this.textCounter}`;
    const mutable: MutableTextNode = {
      id,
      type: "TEXT",
      characters: args.content,
      fontSize: args.fontSize ?? 16,
      x: args.x ?? 0,
      y: args.y ?? 0,
      fills: [],
      strokes: [],
      strokeWeight: 0,
    };
    this.allNodes.set(id, mutable);
    return {
      id,
      type: "TEXT",
      characters: mutable.characters,
      fontSize: mutable.fontSize,
      x: mutable.x,
      y: mutable.y,
    };
  }

  async createEllipse(args: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  }): Promise<EllipseNode> {
    const id = `e${++this.ellipseCounter}`;
    const mutable: MutableEllipseNode = {
      id,
      type: "ELLIPSE",
      width: args.width,
      height: args.height,
      x: args.x ?? 0,
      y: args.y ?? 0,
      fills: [],
      strokes: [],
      strokeWeight: 0,
    };
    this.allNodes.set(id, mutable);
    return {
      id,
      type: "ELLIPSE",
      width: mutable.width,
      height: mutable.height,
      x: mutable.x,
      y: mutable.y,
    };
  }

  async createLine(args: { x1: number; y1: number; x2: number; y2: number }): Promise<LineNode> {
    const id = `ln${++this.lineCounter}`;
    const mutable: MutableLineNode = {
      id,
      type: "LINE",
      x1: args.x1,
      y1: args.y1,
      x2: args.x2,
      y2: args.y2,
      strokes: [],
      strokeWeight: 0,
    };
    this.allNodes.set(id, mutable);
    return { id, type: "LINE", x1: args.x1, y1: args.y1, x2: args.x2, y2: args.y2 };
  }

  async setNodeFill(args: { nodeId: string; paint: SolidPaint }): Promise<void> {
    const node = this.allNodes.get(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    if (node.type === "LINE") {
      throw new Error(`node is not paintable: ${args.nodeId}`);
    }
    node.fills = [args.paint];
  }

  async setNodeStroke(args: { nodeId: string; paint: SolidPaint; weight?: number }): Promise<void> {
    const node = this.allNodes.get(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    node.strokes = [args.paint];
    node.strokeWeight = args.weight ?? 1;
  }

  async setTextContent(args: { nodeId: string; characters: string }): Promise<void> {
    const node = this.allNodes.get(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    if (node.type !== "TEXT") {
      throw new Error(`expected TEXT node: ${args.nodeId}`);
    }
    node.characters = args.characters;
  }

  async resizeNode(args: { nodeId: string; width: number; height: number }): Promise<void> {
    const node = this.allNodes.get(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    if (node.type === "LINE" || node.type === "TEXT") {
      throw new Error(`node is not resizable via width/height: ${args.nodeId}`);
    }
    node.width = args.width;
    node.height = args.height;
  }

  async cloneNode(args: { nodeId: string }): Promise<{ id: string }> {
    const node = this.allNodes.get(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    const clone = this.cloneInternal(node);
    this.allNodes.set(clone.id, clone);
    return { id: clone.id };
  }

  async deleteNode(args: { nodeId: string }): Promise<void> {
    if (!this.allNodes.has(args.nodeId)) {
      throw new Error(`node not found: ${args.nodeId}`);
    }
    this.allNodes.delete(args.nodeId);
  }

  async createComponent(args: { nodeId: string }): Promise<Component> {
    const node = this.allNodes.get(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    const id = `cmp${++this.componentCounter}`;
    const component: Component = {
      id,
      name: `${node.type}_${this.componentCounter}`,
      key: `key-cmp-${this.componentCounter}`,
    };
    this.components.set(id, component);
    return component;
  }

  async getNodeById(args: { nodeId: string }): Promise<NodeSnapshot | null> {
    const node = this.allNodes.get(args.nodeId);
    if (!node) return null;
    return this.snapshot(node);
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

  __seedFrame(node: FrameNode): void {
    this.allNodes.set(node.id, {
      id: node.id,
      type: "FRAME",
      width: node.width,
      height: node.height,
      x: node.x,
      y: node.y,
      name: node.name,
      fills: [],
      strokes: [],
      strokeWeight: 0,
    });
  }

  __seedText(node: TextNode): void {
    this.allNodes.set(node.id, {
      id: node.id,
      type: "TEXT",
      characters: node.characters,
      fontSize: node.fontSize,
      x: node.x,
      y: node.y,
      fills: [],
      strokes: [],
      strokeWeight: 0,
    });
  }

  // ---- Internals ----

  private snapshot(node: AnyMutableNode): NodeSnapshot {
    if (node.type === "LINE") {
      return {
        id: node.id,
        type: node.type,
        strokes: [...node.strokes],
        strokeWeight: node.strokeWeight,
      };
    }
    const base: NodeSnapshot = {
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      fills: [...node.fills],
      strokes: [...node.strokes],
      strokeWeight: node.strokeWeight,
    };
    if (node.type === "TEXT") {
      return { ...base, characters: node.characters };
    }
    // RECTANGLE | FRAME | ELLIPSE — all have width/height
    const sized = node as MutableRectangleNode | MutableFrameNode | MutableEllipseNode;
    return { ...base, width: sized.width, height: sized.height };
  }

  private cloneInternal(node: AnyMutableNode): AnyMutableNode {
    switch (node.type) {
      case "RECTANGLE": {
        const id = `r${++this.nodeCounter}`;
        return { ...node, id, fills: [...node.fills], strokes: [...node.strokes] };
      }
      case "FRAME": {
        const id = `f${++this.frameCounter}`;
        return { ...node, id, fills: [...node.fills], strokes: [...node.strokes] };
      }
      case "TEXT": {
        const id = `t${++this.textCounter}`;
        return { ...node, id, fills: [...node.fills], strokes: [...node.strokes] };
      }
      case "ELLIPSE": {
        const id = `e${++this.ellipseCounter}`;
        return { ...node, id, fills: [...node.fills], strokes: [...node.strokes] };
      }
      case "LINE": {
        const id = `ln${++this.lineCounter}`;
        return { ...node, id, strokes: [...node.strokes] };
      }
    }
  }
}
