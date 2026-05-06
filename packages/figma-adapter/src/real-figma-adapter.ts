/// <reference types="@figma/plugin-typings" />
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
}
