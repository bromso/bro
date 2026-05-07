import type { PluginHandler } from "@repo/protocol";
import type { CreateSection, CreateSticky } from "./tools";

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
