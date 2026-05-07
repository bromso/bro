import type {
  CodeBlockNode,
  Component,
  ConnectorNode,
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
  SectionNode,
  ShapeWithTextNode,
  ShapeWithTextShape,
  SolidPaint,
  StickyNode,
  TableNode,
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

interface MutableStickyNode {
  id: string;
  type: "STICKY";
  content: string;
  authorName?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MutableSectionNode {
  id: string;
  type: "SECTION";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: string[];
}

interface MutableConnectorNode {
  id: string;
  type: "CONNECTOR";
  startNodeId: string;
  endNodeId: string;
}

interface MutableCodeBlockNode {
  id: string;
  type: "CODE_BLOCK";
  code: string;
  language: string;
  x: number;
  y: number;
}

interface MutableShapeWithTextNode {
  id: string;
  type: "SHAPE_WITH_TEXT";
  shape: ShapeWithTextShape;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MutableTableNode {
  id: string;
  type: "TABLE";
  rows: number;
  columns: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

type AnyMutableNode =
  | MutableRectangleNode
  | MutableFrameNode
  | MutableTextNode
  | MutableEllipseNode
  | MutableLineNode
  | MutableStickyNode
  | MutableSectionNode
  | MutableConnectorNode
  | MutableCodeBlockNode
  | MutableShapeWithTextNode
  | MutableTableNode;

const DEFAULT_STICKY_SIZE = 200;

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
  private stickyCounter = 0;
  private sectionCounter = 0;
  private connectorCounter = 0;
  private codeBlockCounter = 0;
  private shapeWithTextCounter = 0;
  private tableCounter = 0;

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
    if (
      node.type !== "RECTANGLE" &&
      node.type !== "FRAME" &&
      node.type !== "TEXT" &&
      node.type !== "ELLIPSE"
    ) {
      throw new Error(`node is not paintable: ${args.nodeId}`);
    }
    node.fills = [args.paint];
  }

  async setNodeStroke(args: { nodeId: string; paint: SolidPaint; weight?: number }): Promise<void> {
    const node = this.allNodes.get(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    if (
      node.type !== "RECTANGLE" &&
      node.type !== "FRAME" &&
      node.type !== "TEXT" &&
      node.type !== "ELLIPSE" &&
      node.type !== "LINE"
    ) {
      throw new Error(`node is not strokable: ${args.nodeId}`);
    }
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
    if (node.type === "LINE" || node.type === "TEXT" || node.type === "CONNECTOR") {
      throw new Error(`node is not resizable via width/height: ${args.nodeId}`);
    }
    if (node.type === "CODE_BLOCK") {
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

  // ---- Phase 10: FigJam node creation and mutation ----

  async createSticky(args: {
    content: string;
    authorName?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): Promise<StickyNode> {
    const id = `stk${++this.stickyCounter}`;
    const mutable: MutableStickyNode = {
      id,
      type: "STICKY",
      content: args.content,
      authorName: args.authorName,
      x: args.x ?? 0,
      y: args.y ?? 0,
      width: args.width ?? DEFAULT_STICKY_SIZE,
      height: args.height ?? DEFAULT_STICKY_SIZE,
    };
    this.allNodes.set(id, mutable);
    return { ...mutable };
  }

  async createSection(args: {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<SectionNode> {
    const id = `sec${++this.sectionCounter}`;
    const mutable: MutableSectionNode = {
      id,
      type: "SECTION",
      name: args.name,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
      children: [],
    };
    this.allNodes.set(id, mutable);
    return {
      id,
      type: "SECTION",
      name: mutable.name,
      x: mutable.x,
      y: mutable.y,
      width: mutable.width,
      height: mutable.height,
    };
  }

  async createConnector(args: { startNodeId: string; endNodeId: string }): Promise<ConnectorNode> {
    if (!this.allNodes.has(args.startNodeId)) {
      throw new Error(`startNode not found: ${args.startNodeId}`);
    }
    if (!this.allNodes.has(args.endNodeId)) {
      throw new Error(`endNode not found: ${args.endNodeId}`);
    }
    const id = `cn${++this.connectorCounter}`;
    const mutable: MutableConnectorNode = {
      id,
      type: "CONNECTOR",
      startNodeId: args.startNodeId,
      endNodeId: args.endNodeId,
    };
    this.allNodes.set(id, mutable);
    return { ...mutable };
  }

  async createCodeBlock(args: {
    code: string;
    language?: string;
    x?: number;
    y?: number;
  }): Promise<CodeBlockNode> {
    const id = `cb${++this.codeBlockCounter}`;
    const mutable: MutableCodeBlockNode = {
      id,
      type: "CODE_BLOCK",
      code: args.code,
      language: args.language ?? "plaintext",
      x: args.x ?? 0,
      y: args.y ?? 0,
    };
    this.allNodes.set(id, mutable);
    return { ...mutable };
  }

  async createShapeWithText(args: {
    shape: ShapeWithTextShape;
    content: string;
    x?: number;
    y?: number;
    width: number;
    height: number;
  }): Promise<ShapeWithTextNode> {
    const id = `swt${++this.shapeWithTextCounter}`;
    const mutable: MutableShapeWithTextNode = {
      id,
      type: "SHAPE_WITH_TEXT",
      shape: args.shape,
      content: args.content,
      x: args.x ?? 0,
      y: args.y ?? 0,
      width: args.width,
      height: args.height,
    };
    this.allNodes.set(id, mutable);
    return { ...mutable };
  }

  async createTable(args: {
    rows: number;
    columns: number;
    x?: number;
    y?: number;
    width: number;
    height: number;
  }): Promise<TableNode> {
    const id = `tbl${++this.tableCounter}`;
    const mutable: MutableTableNode = {
      id,
      type: "TABLE",
      rows: args.rows,
      columns: args.columns,
      x: args.x ?? 0,
      y: args.y ?? 0,
      width: args.width,
      height: args.height,
    };
    this.allNodes.set(id, mutable);
    return { ...mutable };
  }

  async setStickyContent(args: { nodeId: string; content: string }): Promise<void> {
    const node = this.allNodes.get(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    if (node.type !== "STICKY") {
      throw new Error(`expected STICKY node: ${args.nodeId}`);
    }
    node.content = args.content;
  }

  async setSectionName(args: { nodeId: string; name: string }): Promise<void> {
    const node = this.allNodes.get(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    if (node.type !== "SECTION") {
      throw new Error(`expected SECTION node: ${args.nodeId}`);
    }
    node.name = args.name;
  }

  async moveIntoSection(args: { sectionId: string; nodeIds: readonly string[] }): Promise<void> {
    const section = this.allNodes.get(args.sectionId);
    if (!section) throw new Error(`section not found: ${args.sectionId}`);
    if (section.type !== "SECTION") {
      throw new Error(`expected SECTION node: ${args.sectionId}`);
    }
    for (const id of args.nodeIds) {
      if (!this.allNodes.has(id)) {
        throw new Error(`node not found: ${id}`);
      }
    }
    for (const id of args.nodeIds) {
      if (!section.children.includes(id)) {
        section.children.push(id);
      }
    }
  }

  async listSectionChildren(args: { sectionId: string }): Promise<readonly string[]> {
    const section = this.allNodes.get(args.sectionId);
    if (!section) throw new Error(`section not found: ${args.sectionId}`);
    if (section.type !== "SECTION") {
      throw new Error(`expected SECTION node: ${args.sectionId}`);
    }
    return [...section.children];
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
    if (node.type === "STICKY") {
      return {
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        content: node.content,
        authorName: node.authorName,
      };
    }
    if (node.type === "SECTION") {
      return {
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        name: node.name,
      };
    }
    if (node.type === "CONNECTOR") {
      return {
        id: node.id,
        type: node.type,
        startNodeId: node.startNodeId,
        endNodeId: node.endNodeId,
      };
    }
    if (node.type === "CODE_BLOCK") {
      return {
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        code: node.code,
        language: node.language,
      };
    }
    if (node.type === "SHAPE_WITH_TEXT") {
      return {
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        shape: node.shape,
        content: node.content,
      };
    }
    if (node.type === "TABLE") {
      return {
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        rows: node.rows,
        columns: node.columns,
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
      return { ...base, characters: node.characters, fontSize: node.fontSize };
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
      case "STICKY": {
        const id = `stk${++this.stickyCounter}`;
        return { ...node, id };
      }
      case "SECTION": {
        const id = `sec${++this.sectionCounter}`;
        return { ...node, id, children: [...node.children] };
      }
      case "CONNECTOR": {
        const id = `cn${++this.connectorCounter}`;
        return { ...node, id };
      }
      case "CODE_BLOCK": {
        const id = `cb${++this.codeBlockCounter}`;
        return { ...node, id };
      }
      case "SHAPE_WITH_TEXT": {
        const id = `swt${++this.shapeWithTextCounter}`;
        return { ...node, id };
      }
      case "TABLE": {
        const id = `tbl${++this.tableCounter}`;
        return { ...node, id };
      }
    }
  }
}
