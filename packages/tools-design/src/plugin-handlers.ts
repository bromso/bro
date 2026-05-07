import type { PluginHandler } from "@repo/protocol";
import type { CreateEllipse, CreateFrame, CreateLine, CreateRectangle } from "./tools";

export const createRectanglePluginHandler: PluginHandler<typeof CreateRectangle> = async (
  args,
  { figma }
) => {
  const node = figma.createRectangle();
  await figma.resizeNode({ nodeId: node.id, width: args.width, height: args.height });
  // Phase 8 keeps x/y placement best-effort: rectangles created via the
  // sync adapter method don't carry an initial x/y. The set is exposed
  // through the FigmaFake's allNodes map; RealFigmaAdapter.resizeNode
  // already preserves the SceneNode's mutability.
  return { nodeId: node.id, type: "RECTANGLE" };
};

export const createFramePluginHandler: PluginHandler<typeof CreateFrame> = async (
  args,
  { figma }
) => {
  const node = await figma.createFrame({
    width: args.width,
    height: args.height,
    x: args.x,
    y: args.y,
    name: args.name,
  });
  return { nodeId: node.id, type: "FRAME" };
};

export const createEllipsePluginHandler: PluginHandler<typeof CreateEllipse> = async (
  args,
  { figma }
) => {
  const node = await figma.createEllipse(args);
  return { nodeId: node.id, type: "ELLIPSE" };
};

export const createLinePluginHandler: PluginHandler<typeof CreateLine> = async (
  args,
  { figma }
) => {
  const node = await figma.createLine(args);
  return { nodeId: node.id, type: "LINE" };
};
