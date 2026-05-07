/// <reference types="@figma/plugin-typings" />
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
}
