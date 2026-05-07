import type { PluginHandler } from "@repo/protocol";
import { requireFigJam } from "./guard";
import type {
  CreateCodeBlock,
  CreateConnector,
  CreateSection,
  CreateShapeWithText,
  CreateSticky,
  CreateTable,
  ListSectionChildren,
  MoveIntoSection,
  SetSectionName,
  SetStickyContent,
} from "./tools";

export const createStickyPluginHandler: PluginHandler<typeof CreateSticky> = async (
  args,
  { figma }
) => {
  const fj = requireFigJam(figma, "create_sticky");
  const node = await fj.createSticky(args);
  return { nodeId: node.id, type: "STICKY" };
};

export const createSectionPluginHandler: PluginHandler<typeof CreateSection> = async (
  args,
  { figma }
) => {
  const fj = requireFigJam(figma, "create_section");
  const node = await fj.createSection(args);
  return { nodeId: node.id, type: "SECTION" };
};

export const createConnectorPluginHandler: PluginHandler<typeof CreateConnector> = async (
  args,
  { figma }
) => {
  const fj = requireFigJam(figma, "create_connector");
  const node = await fj.createConnector(args);
  return { nodeId: node.id, type: "CONNECTOR" };
};

export const createCodeBlockPluginHandler: PluginHandler<typeof CreateCodeBlock> = async (
  args,
  { figma }
) => {
  const fj = requireFigJam(figma, "create_code_block");
  const node = await fj.createCodeBlock({
    code: args.code,
    language: args.language,
    x: args.x,
    y: args.y,
  });
  return { nodeId: node.id, type: "CODE_BLOCK" };
};

export const createShapeWithTextPluginHandler: PluginHandler<typeof CreateShapeWithText> = async (
  args,
  { figma }
) => {
  const fj = requireFigJam(figma, "create_shape_with_text");
  const node = await fj.createShapeWithText({
    shape: args.shape,
    content: args.content,
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
  });
  return { nodeId: node.id, type: "SHAPE_WITH_TEXT" };
};

export const createTablePluginHandler: PluginHandler<typeof CreateTable> = async (
  args,
  { figma }
) => {
  const fj = requireFigJam(figma, "create_table");
  const node = await fj.createTable({
    rows: args.rows,
    columns: args.columns,
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
  });
  return { nodeId: node.id, type: "TABLE" };
};

export const setStickyContentPluginHandler: PluginHandler<typeof SetStickyContent> = async (
  args,
  { figma }
) => {
  const fj = requireFigJam(figma, "set_sticky_content");
  await fj.setStickyContent({ nodeId: args.nodeId, content: args.content });
  return { nodeId: args.nodeId, type: "STICKY" };
};

export const setSectionNamePluginHandler: PluginHandler<typeof SetSectionName> = async (
  args,
  { figma }
) => {
  const fj = requireFigJam(figma, "set_section_name");
  await fj.setSectionName({ nodeId: args.nodeId, name: args.name });
  return { nodeId: args.nodeId, type: "SECTION" };
};

export const moveIntoSectionPluginHandler: PluginHandler<typeof MoveIntoSection> = async (
  args,
  { figma }
) => {
  const fj = requireFigJam(figma, "move_into_section");
  await fj.moveIntoSection({
    sectionId: args.sectionId,
    nodeIds: args.nodeIds,
  });
  return { sectionId: args.sectionId, moved: args.nodeIds.length };
};

export const listSectionChildrenPluginHandler: PluginHandler<typeof ListSectionChildren> = async (
  args,
  { figma }
) => {
  const fj = requireFigJam(figma, "list_section_children");
  const nodeIds = await fj.listSectionChildren({ sectionId: args.sectionId });
  return { nodeIds: [...nodeIds], count: nodeIds.length };
};
