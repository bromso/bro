/// <reference types="@figma/plugin-typings" />
import type {
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
  TableNode,
  TextNode,
  TextStyle,
  Variable,
  VariableCollection,
} from "./adapter";

/**
 * Map our lowercase shape variants to the Figma runtime's uppercase
 * `ShapeType` enum. Unknown values fall back to "SQUARE" — the
 * runtime would otherwise throw at assignment.
 */
const SHAPE_TYPE_MAP: Readonly<Record<ShapeWithTextShape, string>> = {
  square: "SQUARE",
  ellipse: "ELLIPSE",
  rounded_rectangle: "ROUNDED_RECTANGLE",
  diamond: "DIAMOND",
  triangle_up: "TRIANGLE_UP",
  triangle_down: "TRIANGLE_DOWN",
  parallelogram_right: "PARALLELOGRAM_RIGHT",
  parallelogram_left: "PARALLELOGRAM_LEFT",
};

const SUPPORTED_CODE_LANGUAGES = new Set([
  "PLAINTEXT",
  "TYPESCRIPT",
  "CPP",
  "CSS",
  "GO",
  "GRAPHQL",
  "HTML",
  "JAVASCRIPT",
  "JSON",
  "KOTLIN",
  "PHP",
  "PYTHON",
  "RUBY",
  "RUST",
  "SQL",
  "SWIFT",
  "BASH",
]);

/**
 * Production `FigmaAdapter` backed by the `figma` global injected by
 * the Figma plugin runtime. Tests stub the global via `vi.stubGlobal`.
 *
 * Each method is a thin pass-through that summarizes the plugin
 * runtime's heavier objects into the lighter shapes the protocol's
 * tool output schemas expect.
 */
export class RealFigmaAdapter implements FigmaAdapter {
  get editorType(): EditorType {
    return figma.editorType as EditorType;
  }

  async getLocalVariablesAsync(): Promise<Variable[]> {
    const vars = await figma.variables.getLocalVariablesAsync();
    return vars.map((v) => ({
      id: v.id,
      name: v.name,
      resolvedType: v.resolvedType as Variable["resolvedType"],
      valuesByMode: { ...v.valuesByMode } as Variable["valuesByMode"],
    }));
  }

  async setValueForMode(args: {
    variableId: string;
    modeId: string;
    value: unknown;
  }): Promise<void> {
    const v = await figma.variables.getVariableByIdAsync(args.variableId);
    if (!v) throw new Error(`variable not found: ${args.variableId}`);
    v.setValueForMode(args.modeId, args.value as never);
  }

  createRectangle(): RectangleNode {
    const node = figma.createRectangle();
    return { id: node.id, type: "RECTANGLE", width: node.width, height: node.height };
  }

  get currentPageSelection(): PageSelection {
    return { nodeIds: figma.currentPage.selection.map((n) => n.id) };
  }

  async getLocalComponentsAsync(): Promise<Component[]> {
    const components = figma.root.findAllWithCriteria({ types: ["COMPONENT"] });
    return components.map((c) => ({
      id: c.id,
      name: c.name,
      key: (c as { key: string }).key,
      description: (c as { description?: string }).description,
    }));
  }

  async getLocalPaintStylesAsync(): Promise<PaintStyle[]> {
    const styles = await figma.getLocalPaintStylesAsync();
    return styles.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      type: "PAINT" as const,
      paints: s.paints.map((p) => ({ type: p.type, visible: p.visible })),
    }));
  }

  async getLocalTextStylesAsync(): Promise<TextStyle[]> {
    const styles = await figma.getLocalTextStylesAsync();
    return styles.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      type: "TEXT" as const,
      fontName: { family: s.fontName.family, style: s.fontName.style },
      fontSize: s.fontSize,
      lineHeight: s.lineHeight as TextStyle["lineHeight"],
      letterSpacing: s.letterSpacing as TextStyle["letterSpacing"],
    }));
  }

  async getLocalEffectStylesAsync(): Promise<EffectStyle[]> {
    const styles = await figma.getLocalEffectStylesAsync();
    return styles.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      type: "EFFECT" as const,
      effects: s.effects.map((e) => ({ type: e.type, visible: e.visible })),
    }));
  }

  async getLocalVariableCollectionsAsync(): Promise<VariableCollection[]> {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    return collections.map((c) => ({
      id: c.id,
      name: c.name,
      modes: c.modes.map((m) => ({ id: m.modeId, name: m.name })),
    }));
  }

  async createVariableCollection(args: { name: string }): Promise<VariableCollection> {
    const c = figma.variables.createVariableCollection(args.name);
    return {
      id: c.id,
      name: c.name,
      modes: c.modes.map((m) => ({ id: m.modeId, name: m.name })),
    };
  }

  async createVariable(args: {
    name: string;
    collectionId: string;
    resolvedType: Variable["resolvedType"];
  }): Promise<Variable> {
    const v = figma.variables.createVariable(
      args.name,
      args.collectionId,
      args.resolvedType as never
    );
    return {
      id: v.id,
      name: v.name,
      resolvedType: v.resolvedType as Variable["resolvedType"],
      valuesByMode: { ...v.valuesByMode } as Variable["valuesByMode"],
    };
  }

  async deleteVariableAsync(id: string): Promise<void> {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (!v) throw new Error(`variable not found: ${id}`);
    v.remove();
  }

  async createFrame(args: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    name?: string;
  }): Promise<FrameNode> {
    const node = figma.createFrame();
    node.resize(args.width, args.height);
    if (args.x !== undefined) node.x = args.x;
    if (args.y !== undefined) node.y = args.y;
    if (args.name !== undefined) node.name = args.name;
    return {
      id: node.id,
      type: "FRAME",
      width: node.width,
      height: node.height,
      x: node.x,
      y: node.y,
      name: node.name,
    };
  }

  async createText(args: {
    content: string;
    fontSize?: number;
    x?: number;
    y?: number;
  }): Promise<TextNode> {
    const node = figma.createText();
    await figma.loadFontAsync(node.fontName as FontName);
    node.characters = args.content;
    if (args.fontSize !== undefined) node.fontSize = args.fontSize;
    if (args.x !== undefined) node.x = args.x;
    if (args.y !== undefined) node.y = args.y;
    const fontSize = typeof node.fontSize === "number" ? node.fontSize : 16;
    return {
      id: node.id,
      type: "TEXT",
      characters: node.characters,
      fontSize,
      x: node.x,
      y: node.y,
    };
  }

  async createEllipse(args: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  }): Promise<EllipseNode> {
    const node = figma.createEllipse();
    node.resize(args.width, args.height);
    if (args.x !== undefined) node.x = args.x;
    if (args.y !== undefined) node.y = args.y;
    return {
      id: node.id,
      type: "ELLIPSE",
      width: node.width,
      height: node.height,
      x: node.x,
      y: node.y,
    };
  }

  async createLine(args: { x1: number; y1: number; x2: number; y2: number }): Promise<LineNode> {
    const node = figma.createLine();
    const dx = args.x2 - args.x1;
    const dy = args.y2 - args.y1;
    node.x = args.x1;
    node.y = args.y1;
    node.resize(Math.hypot(dx, dy), 0);
    node.rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
    return {
      id: node.id,
      type: "LINE",
      x1: args.x1,
      y1: args.y1,
      x2: args.x2,
      y2: args.y2,
    };
  }

  async setNodeFill(args: { nodeId: string; paint: SolidPaint }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    (node as unknown as { fills: readonly Paint[] }).fills = [args.paint as unknown as Paint];
  }

  async setNodeStroke(args: { nodeId: string; paint: SolidPaint; weight?: number }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    const target = node as unknown as {
      strokes: readonly Paint[];
      strokeWeight?: number;
    };
    target.strokes = [args.paint as unknown as Paint];
    if (args.weight !== undefined) target.strokeWeight = args.weight;
  }

  async setTextContent(args: { nodeId: string; characters: string }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    if (node.type !== "TEXT") {
      throw new Error(`expected TEXT node: ${args.nodeId}`);
    }
    const text = node as unknown as TextSublayerNode & {
      fontName: FontName;
      characters: string;
    };
    await figma.loadFontAsync(text.fontName as FontName);
    text.characters = args.characters;
  }

  async resizeNode(args: { nodeId: string; width: number; height: number }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    (node as unknown as LayoutMixin).resize(args.width, args.height);
  }

  async cloneNode(args: { nodeId: string }): Promise<{ id: string }> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    const clone = (node as unknown as { clone: () => { id: string } }).clone();
    return { id: clone.id };
  }

  async deleteNode(args: { nodeId: string }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    (node as unknown as { remove: () => void }).remove();
  }

  async createComponent(args: { nodeId: string }): Promise<Component> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    const create = (
      figma as unknown as {
        createComponentFromNode: (n: BaseNode) => ComponentNode;
      }
    ).createComponentFromNode;
    const component = create(node);
    return {
      id: component.id,
      name: component.name,
      key: component.key,
      description: component.description,
    };
  }

  async getNodeById(args: { nodeId: string }): Promise<NodeSnapshot | null> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) return null;
    const snap = node as unknown as Partial<{
      id: string;
      type: string;
      width: number;
      height: number;
      x: number;
      y: number;
      characters: string;
      fills: readonly SolidPaint[];
      strokes: readonly SolidPaint[];
      strokeWeight: number;
    }>;
    const out: Record<string, unknown> = {
      id: node.id,
      type: node.type,
    };
    if (typeof snap.width === "number") out.width = snap.width;
    if (typeof snap.height === "number") out.height = snap.height;
    if (typeof snap.x === "number") out.x = snap.x;
    if (typeof snap.y === "number") out.y = snap.y;
    if (typeof snap.characters === "string") out.characters = snap.characters;
    if (Array.isArray(snap.fills)) out.fills = snap.fills;
    if (Array.isArray(snap.strokes)) out.strokes = snap.strokes;
    if (typeof snap.strokeWeight === "number") out.strokeWeight = snap.strokeWeight;
    return out as unknown as NodeSnapshot;
  }

  // ---- Phase 10: FigJam-specific node creation and mutation ----

  async createSticky(args: {
    content: string;
    authorName?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): Promise<StickyNode> {
    const node = (
      figma as unknown as {
        createSticky: () => {
          id: string;
          x: number;
          y: number;
          width: number;
          height: number;
          authorName?: string;
          text: { fontName: FontName; characters: string };
        };
      }
    ).createSticky();
    await figma.loadFontAsync(node.text.fontName as FontName);
    node.text.characters = args.content;
    if (args.authorName !== undefined) node.authorName = args.authorName;
    if (args.x !== undefined) node.x = args.x;
    if (args.y !== undefined) node.y = args.y;
    if (args.width !== undefined && args.height !== undefined) {
      (node as unknown as LayoutMixin).resize(args.width, args.height);
    }
    return {
      id: node.id,
      type: "STICKY",
      content: node.text.characters,
      authorName: node.authorName,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    };
  }

  async createSection(args: {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<SectionNode> {
    const node = (
      figma as unknown as {
        createSection: () => {
          id: string;
          name: string;
          x: number;
          y: number;
          width: number;
          height: number;
          resizeWithoutConstraints: (w: number, h: number) => void;
        };
      }
    ).createSection();
    node.name = args.name;
    node.x = args.x;
    node.y = args.y;
    node.resizeWithoutConstraints(args.width, args.height);
    return {
      id: node.id,
      type: "SECTION",
      name: node.name,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    };
  }

  async createConnector(args: { startNodeId: string; endNodeId: string }): Promise<ConnectorNode> {
    const start = await figma.getNodeByIdAsync(args.startNodeId);
    if (!start) throw new Error(`startNode not found: ${args.startNodeId}`);
    const end = await figma.getNodeByIdAsync(args.endNodeId);
    if (!end) throw new Error(`endNode not found: ${args.endNodeId}`);
    const node = (
      figma as unknown as {
        createConnector: () => {
          id: string;
          connectorStart: { endpointNodeId: string; magnet: string };
          connectorEnd: { endpointNodeId: string; magnet: string };
        };
      }
    ).createConnector();
    node.connectorStart = { endpointNodeId: args.startNodeId, magnet: "AUTO" };
    node.connectorEnd = { endpointNodeId: args.endNodeId, magnet: "AUTO" };
    return {
      id: node.id,
      type: "CONNECTOR",
      startNodeId: args.startNodeId,
      endNodeId: args.endNodeId,
    };
  }

  async createCodeBlock(args: {
    code: string;
    language?: string;
    x?: number;
    y?: number;
  }): Promise<CodeBlockNode> {
    const node = (
      figma as unknown as {
        createCodeBlock: () => {
          id: string;
          x: number;
          y: number;
          code: string;
          codeLanguage: string;
        };
      }
    ).createCodeBlock();
    node.code = args.code;
    const requested = (args.language ?? "plaintext").toUpperCase();
    node.codeLanguage = SUPPORTED_CODE_LANGUAGES.has(requested) ? requested : "PLAINTEXT";
    if (args.x !== undefined) node.x = args.x;
    if (args.y !== undefined) node.y = args.y;
    return {
      id: node.id,
      type: "CODE_BLOCK",
      code: node.code,
      language: args.language ?? "plaintext",
      x: node.x,
      y: node.y,
    };
  }

  async createShapeWithText(args: {
    shape: ShapeWithTextShape;
    content: string;
    x?: number;
    y?: number;
    width: number;
    height: number;
  }): Promise<ShapeWithTextNode> {
    const node = (
      figma as unknown as {
        createShapeWithText: () => {
          id: string;
          x: number;
          y: number;
          width: number;
          height: number;
          shapeType: string;
          text: { fontName: FontName; characters: string };
        };
      }
    ).createShapeWithText();
    node.shapeType = SHAPE_TYPE_MAP[args.shape] ?? "SQUARE";
    await figma.loadFontAsync(node.text.fontName as FontName);
    node.text.characters = args.content;
    if (args.x !== undefined) node.x = args.x;
    if (args.y !== undefined) node.y = args.y;
    (node as unknown as LayoutMixin).resize(args.width, args.height);
    return {
      id: node.id,
      type: "SHAPE_WITH_TEXT",
      shape: args.shape,
      content: node.text.characters,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    };
  }

  async createTable(args: {
    rows: number;
    columns: number;
    x?: number;
    y?: number;
    width: number;
    height: number;
  }): Promise<TableNode> {
    const node = (
      figma as unknown as {
        createTable: (
          rows: number,
          columns: number
        ) => {
          id: string;
          x: number;
          y: number;
          width: number;
          height: number;
          numRows: number;
          numColumns: number;
        };
      }
    ).createTable(args.rows, args.columns);
    if (args.x !== undefined) node.x = args.x;
    if (args.y !== undefined) node.y = args.y;
    (node as unknown as LayoutMixin).resize(args.width, args.height);
    return {
      id: node.id,
      type: "TABLE",
      rows: args.rows,
      columns: args.columns,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    };
  }

  async setStickyContent(args: { nodeId: string; content: string }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    if (node.type !== "STICKY") {
      throw new Error(`expected STICKY node: ${args.nodeId}`);
    }
    const sticky = node as unknown as {
      text: { fontName: FontName; characters: string };
    };
    await figma.loadFontAsync(sticky.text.fontName as FontName);
    sticky.text.characters = args.content;
  }

  async setSectionName(args: { nodeId: string; name: string }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    if (node.type !== "SECTION") {
      throw new Error(`expected SECTION node: ${args.nodeId}`);
    }
    (node as unknown as { name: string }).name = args.name;
  }

  async moveIntoSection(args: { sectionId: string; nodeIds: readonly string[] }): Promise<void> {
    const section = await figma.getNodeByIdAsync(args.sectionId);
    if (!section) throw new Error(`section not found: ${args.sectionId}`);
    if (section.type !== "SECTION") {
      throw new Error(`expected SECTION node: ${args.sectionId}`);
    }
    const sectionWithChildren = section as unknown as {
      appendChild: (n: BaseNode) => void;
    };
    for (const id of args.nodeIds) {
      const child = await figma.getNodeByIdAsync(id);
      if (!child) throw new Error(`node not found: ${id}`);
      sectionWithChildren.appendChild(child);
    }
  }

  async listSectionChildren(args: { sectionId: string }): Promise<readonly string[]> {
    const section = await figma.getNodeByIdAsync(args.sectionId);
    if (!section) throw new Error(`section not found: ${args.sectionId}`);
    if (section.type !== "SECTION") {
      throw new Error(`expected SECTION node: ${args.sectionId}`);
    }
    const sectionWithChildren = section as unknown as {
      children: readonly { id: string }[];
    };
    return sectionWithChildren.children.map((c) => c.id);
  }

  // ---- Phase 12: Slides node creation, mutation, and grid management ----

  async createSlide(args: {
    name?: string;
    rowIndex?: number;
    columnIndex?: number;
  }): Promise<SlideNode> {
    const node = (
      figma as unknown as {
        createSlide: (rowIndex?: number, columnIndex?: number) => SlideRT;
      }
    ).createSlide(args.rowIndex, args.columnIndex);
    if (args.name !== undefined) node.name = args.name;
    return {
      id: node.id,
      type: "SLIDE",
      name: node.name,
      isSkipped: node.isSkippedSlide ?? false,
      fills: solidPaintsFrom(node.fills),
      width: node.width,
      height: node.height,
    };
  }

  async createSlideRow(args: { rowIndex?: number }): Promise<SlideRowNode> {
    const node = (
      figma as unknown as {
        createSlideRow: (rowIndex?: number) => SlideRowRT;
      }
    ).createSlideRow(args.rowIndex);
    return { id: node.id, type: "SLIDE_ROW", name: node.name };
  }

  async setSlideName(args: { slideId: string; name: string }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.slideId);
    if (!node) throw new Error(`node not found: ${args.slideId}`);
    if (node.type !== "SLIDE") {
      throw new Error(`expected SLIDE node: ${args.slideId}`);
    }
    (node as unknown as { name: string }).name = args.name;
  }

  async setSlideSkipped(args: { slideId: string; skipped: boolean }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.slideId);
    if (!node) throw new Error(`node not found: ${args.slideId}`);
    if (node.type !== "SLIDE") {
      throw new Error(`expected SLIDE node: ${args.slideId}`);
    }
    (node as unknown as { isSkippedSlide: boolean }).isSkippedSlide = args.skipped;
  }

  async setSlideTransition(args: {
    slideId: string;
    style: SlideTransitionStyle;
    durationSec?: number;
    curve?: SlideTransitionCurve;
    timingType?: SlideTransitionTimingType;
    timingDelaySec?: number;
  }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.slideId);
    if (!node) throw new Error(`node not found: ${args.slideId}`);
    if (node.type !== "SLIDE") {
      throw new Error(`expected SLIDE node: ${args.slideId}`);
    }
    const transition: SlideTransition = {
      style: args.style,
      duration: args.durationSec ?? 0.3,
      curve: args.curve ?? "EASE_IN_AND_OUT",
      timing: {
        type: args.timingType ?? "ON_CLICK",
        delay: args.timingDelaySec,
      },
    };
    (
      node as unknown as {
        setSlideTransition: (t: SlideTransition) => void;
      }
    ).setSlideTransition(transition);
  }

  async getSlideTransition(args: { slideId: string }): Promise<SlideTransition> {
    const node = await figma.getNodeByIdAsync(args.slideId);
    if (!node) throw new Error(`node not found: ${args.slideId}`);
    if (node.type !== "SLIDE") {
      throw new Error(`expected SLIDE node: ${args.slideId}`);
    }
    const t = (
      node as unknown as { getSlideTransition: () => SlideTransition }
    ).getSlideTransition();
    return {
      style: t.style,
      duration: t.duration,
      curve: t.curve,
      timing: { type: t.timing.type, delay: t.timing.delay },
    };
  }

  async setSlideBackground(args: { slideId: string; paint: SolidPaint }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.slideId);
    if (!node) throw new Error(`node not found: ${args.slideId}`);
    if (node.type !== "SLIDE") {
      throw new Error(`expected SLIDE node: ${args.slideId}`);
    }
    (node as unknown as { fills: readonly Paint[] }).fills = [args.paint as unknown as Paint];
  }

  async moveSlide(args: { slideId: string; rowIndex: number; columnIndex: number }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.slideId);
    if (!node) throw new Error(`node not found: ${args.slideId}`);
    if (node.type !== "SLIDE") {
      throw new Error(`expected SLIDE node: ${args.slideId}`);
    }
    const figmaSlides = figma as unknown as {
      getSlideGrid: () => SlideRT[][];
      setSlideGrid: (grid: SlideRT[][]) => void;
    };
    const grid = figmaSlides.getSlideGrid().map((r) => [...r]);
    let target: SlideRT | undefined;
    for (const row of grid) {
      const idx = row.findIndex((s) => s.id === args.slideId);
      if (idx >= 0) {
        target = row.splice(idx, 1)[0];
        break;
      }
    }
    if (!target) throw new Error(`slide not found in grid: ${args.slideId}`);
    if (args.rowIndex < 0 || args.rowIndex >= grid.length) {
      throw new Error(`rowIndex out of range: ${args.rowIndex}`);
    }
    const targetRow = grid[args.rowIndex];
    if (args.columnIndex < 0 || args.columnIndex > targetRow.length) {
      throw new Error(`columnIndex out of range: ${args.columnIndex}`);
    }
    targetRow.splice(args.columnIndex, 0, target);
    figmaSlides.setSlideGrid(grid);
  }

  async duplicateSlide(args: { slideId: string }): Promise<SlideNode> {
    const node = await figma.getNodeByIdAsync(args.slideId);
    if (!node) throw new Error(`node not found: ${args.slideId}`);
    if (node.type !== "SLIDE") {
      throw new Error(`expected SLIDE node: ${args.slideId}`);
    }
    const cloned = (node as unknown as { clone: () => SlideRT }).clone();
    const figmaSlides = figma as unknown as {
      getSlideGrid: () => SlideRT[][];
      setSlideGrid: (grid: SlideRT[][]) => void;
    };
    const grid = figmaSlides.getSlideGrid().map((r) => [...r]);
    for (const row of grid) {
      const idx = row.findIndex((s) => s.id === args.slideId);
      if (idx >= 0) {
        row.splice(idx + 1, 0, cloned);
        break;
      }
    }
    figmaSlides.setSlideGrid(grid);
    return {
      id: cloned.id,
      type: "SLIDE",
      name: cloned.name,
      isSkipped: cloned.isSkippedSlide ?? false,
      fills: solidPaintsFrom(cloned.fills),
      width: cloned.width,
      height: cloned.height,
    };
  }

  async deleteSlide(args: { slideId: string }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.slideId);
    if (!node) throw new Error(`node not found: ${args.slideId}`);
    if (node.type !== "SLIDE") {
      throw new Error(`expected SLIDE node: ${args.slideId}`);
    }
    (node as unknown as { remove: () => void }).remove();
  }

  async listSlides(args: { rowIndex?: number }): Promise<readonly string[]> {
    const grid = (figma as unknown as { getSlideGrid: () => SlideRT[][] }).getSlideGrid();
    if (args.rowIndex === undefined) {
      return grid.flat().map((s) => s.id);
    }
    if (args.rowIndex < 0 || args.rowIndex >= grid.length) {
      throw new Error(`row not found: ${args.rowIndex}`);
    }
    return grid[args.rowIndex].map((s) => s.id);
  }

  async listSlideRows(): Promise<readonly string[]> {
    const page = figma.currentPage as unknown as {
      children: readonly {
        id: string;
        type: string;
        children?: readonly { id: string; type: string }[];
      }[];
    };
    const out: string[] = [];
    const visit = (
      nodes: readonly {
        id: string;
        type: string;
        children?: readonly { id: string; type: string }[];
      }[]
    ): void => {
      for (const n of nodes) {
        if (n.type === "SLIDE_ROW") out.push(n.id);
        if (n.children) visit(n.children);
      }
    };
    visit(page.children);
    return out;
  }

  async setActiveSlide(args: { slideId: string }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.slideId);
    if (!node) throw new Error(`node not found: ${args.slideId}`);
    if (node.type !== "SLIDE") {
      throw new Error(`expected SLIDE node: ${args.slideId}`);
    }
    (figma.currentPage as unknown as { focusedSlide?: SlideRT }).focusedSlide =
      node as unknown as SlideRT;
  }

  async getActiveSlideId(): Promise<string | null> {
    const focused = (figma.currentPage as unknown as { focusedSlide?: SlideRT | null })
      .focusedSlide;
    return focused ? focused.id : null;
  }

  async setSlidesView(args: { view: SlidesView }): Promise<void> {
    (figma.viewport as unknown as { slidesView: SlidesView }).slidesView = args.view;
  }

  async getSlidesView(): Promise<SlidesView> {
    return (figma.viewport as unknown as { slidesView: SlidesView }).slidesView;
  }

  async getSlideGrid(): Promise<readonly (readonly string[])[]> {
    const grid = (figma as unknown as { getSlideGrid: () => SlideRT[][] }).getSlideGrid();
    return grid.map((row) => row.map((s) => s.id));
  }

  // ---- Phase 13: a11y metadata, annotations, computed properties ----

  async getNodeA11yMeta(args: { nodeId: string }): Promise<NodeA11yMeta> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    const out: { altText?: string; ariaLabel?: string; landmarkRole?: string } = {};
    for (const key of ["altText", "ariaLabel", "landmarkRole"] as const) {
      const v = (node as unknown as { getPluginData: (k: string) => string }).getPluginData(
        `a11y/${key}`
      );
      if (v !== "") out[key] = v;
    }
    return out;
  }

  async setNodeA11yMeta(args: {
    nodeId: string;
    key: A11yMetaKey;
    value: string | null;
  }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    if (args.key !== "altText" && args.key !== "ariaLabel" && args.key !== "landmarkRole") {
      throw new Error(`unknown a11y key: ${args.key}`);
    }
    const stored = args.value ?? "";
    (node as unknown as { setPluginData: (k: string, v: string) => void }).setPluginData(
      `a11y/${args.key}`,
      stored
    );
  }

  async getNodeAnnotations(args: { nodeId: string }): Promise<readonly Annotation[]> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    const list =
      (
        node as unknown as {
          annotations?: readonly { label?: string; categoryId?: string }[];
        }
      ).annotations ?? [];
    return list.map((a) => ({ label: a.label, categoryId: a.categoryId }));
  }

  async setNodeAnnotations(args: {
    nodeId: string;
    annotations: readonly Annotation[];
  }): Promise<void> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    (node as unknown as { annotations: readonly Annotation[] }).annotations = args.annotations.map(
      (a) => ({ label: a.label, categoryId: a.categoryId })
    );
  }

  async getResolvedTextFill(args: { nodeId: string }): Promise<ResolvedFill | null> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    const fills = (
      node as unknown as {
        fills?: readonly {
          type: string;
          color?: { r: number; g: number; b: number };
          opacity?: number;
        }[];
      }
    ).fills;
    if (!fills || fills.length === 0) return null;
    const solid = fills.find((p) => p.type === "SOLID");
    if (!solid?.color) return null;
    return { hex: rgbToHex(solid.color), opacity: solid.opacity ?? 1 };
  }

  async getResolvedBackground(args: { nodeId: string }): Promise<ResolvedFill | null> {
    const start = await figma.getNodeByIdAsync(args.nodeId);
    if (!start) throw new Error(`node not found: ${args.nodeId}`);
    let cursor: unknown = start;
    while (cursor) {
      const parent = (cursor as { parent?: unknown }).parent as
        | {
            fills?: readonly {
              type: string;
              color?: { r: number; g: number; b: number };
              opacity?: number;
            }[];
          }
        | null
        | undefined;
      if (!parent) break;
      const fills = parent.fills;
      const solid = fills?.find((p) => p.type === "SOLID");
      if (solid?.color) {
        return { hex: rgbToHex(solid.color), opacity: solid.opacity ?? 1 };
      }
      cursor = parent;
    }
    return null;
  }

  async listNodeChildren(args: { nodeId: string }): Promise<readonly string[]> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    const children = (node as { children?: ReadonlyArray<{ id: string }> }).children;
    if (!children) return [];
    return children.map((c) => c.id);
  }

  async getNodeBoundingBox(args: { nodeId: string }): Promise<NodeBoundingBox | null> {
    const node = await figma.getNodeByIdAsync(args.nodeId);
    if (!node) throw new Error(`node not found: ${args.nodeId}`);
    const bbox = (
      node as unknown as {
        absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
      }
    ).absoluteBoundingBox;
    if (!bbox) return null;
    return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  }
}

/**
 * Local runtime alias for the Slides plugin API's `SlideNode`. The
 * `@figma/plugin-typings` package only exposes this type when
 * `editorType === "slides"`, so we mirror the runtime shape here to
 * avoid a hard dependency on the conditional.
 */
interface SlideRT {
  readonly id: string;
  name: string;
  isSkippedSlide?: boolean;
  fills: readonly Paint[];
  width: number;
  height: number;
}

interface SlideRowRT {
  readonly id: string;
  readonly name: string;
}

/**
 * Filter the runtime's heterogeneous Paint list down to the SOLID
 * paints we surface through the adapter contract. Mirrors the Phase 8
 * fills handling in `getNodeById`.
 */
function solidPaintsFrom(paints: readonly Paint[]): SolidPaint[] {
  const out: SolidPaint[] = [];
  for (const p of paints) {
    if (p.type === "SOLID") {
      out.push({ type: "SOLID", color: p.color, opacity: p.opacity });
    }
  }
  return out;
}

/**
 * Format a normalized RGB color (0..1 channels) as `#RRGGBB`. Used by
 * Phase 13's contrast-related computed properties.
 */
function rgbToHex(color: { r: number; g: number; b: number }): string {
  const toByte = (c: number): string =>
    Math.max(0, Math.min(255, Math.round((c ?? 0) * 255)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toByte(color.r)}${toByte(color.g)}${toByte(color.b)}`;
}
