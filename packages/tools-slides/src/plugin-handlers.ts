import type { PluginHandler } from "@repo/protocol";
import type { CreateSlide, CreateSlideRow } from "./tools";

const E_MISMATCH = "E_FIGMA_EDITOR_TYPE_MISMATCH";

export const createSlidePluginHandler: PluginHandler<typeof CreateSlide> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: create_slide requires editorType=slides (got ${figma.editorType})`
    );
  }
  const node = await figma.createSlide(args);
  return { nodeId: node.id, type: "SLIDE" };
};

export const createSlideRowPluginHandler: PluginHandler<typeof CreateSlideRow> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: create_slide_row requires editorType=slides (got ${figma.editorType})`
    );
  }
  const node = await figma.createSlideRow(args);
  return { nodeId: node.id, type: "SLIDE_ROW" };
};
