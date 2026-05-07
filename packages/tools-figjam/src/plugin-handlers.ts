import type { PluginHandler } from "@repo/protocol";
import type { CreateCodeBlock, CreateConnector, CreateSection, CreateSticky } from "./tools";

const E_MISMATCH = "E_FIGMA_EDITOR_TYPE_MISMATCH";

export const createStickyPluginHandler: PluginHandler<typeof CreateSticky> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(
      `${E_MISMATCH}: create_sticky requires editorType=figjam (got ${figma.editorType})`
    );
  }
  const node = await figma.createSticky(args);
  return { nodeId: node.id, type: "STICKY" };
};

export const createSectionPluginHandler: PluginHandler<typeof CreateSection> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(
      `${E_MISMATCH}: create_section requires editorType=figjam (got ${figma.editorType})`
    );
  }
  const node = await figma.createSection(args);
  return { nodeId: node.id, type: "SECTION" };
};

export const createConnectorPluginHandler: PluginHandler<typeof CreateConnector> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(
      `${E_MISMATCH}: create_connector requires editorType=figjam (got ${figma.editorType})`
    );
  }
  const node = await figma.createConnector(args);
  return { nodeId: node.id, type: "CONNECTOR" };
};

export const createCodeBlockPluginHandler: PluginHandler<typeof CreateCodeBlock> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "figjam") {
    throw new Error(
      `${E_MISMATCH}: create_code_block requires editorType=figjam (got ${figma.editorType})`
    );
  }
  const node = await figma.createCodeBlock({
    code: args.code,
    language: args.language,
    x: args.x,
    y: args.y,
  });
  return { nodeId: node.id, type: "CODE_BLOCK" };
};
