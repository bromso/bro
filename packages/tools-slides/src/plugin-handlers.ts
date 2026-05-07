import type { PluginHandler } from "@repo/protocol";
import type {
  CreateSlide,
  CreateSlideRow,
  DeleteSlide,
  DuplicateSlide,
  MoveSlide,
  SetSlideBackground,
  SetSlideName,
  SetSlideSkipped,
  SetSlideTransition,
} from "./tools";

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

export const setSlideNamePluginHandler: PluginHandler<typeof SetSlideName> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: set_slide_name requires editorType=slides (got ${figma.editorType})`
    );
  }
  await figma.setSlideName({ slideId: args.slideId, name: args.name });
  return { nodeId: args.slideId, type: "SLIDE" };
};

export const setSlideSkippedPluginHandler: PluginHandler<typeof SetSlideSkipped> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: set_slide_skipped requires editorType=slides (got ${figma.editorType})`
    );
  }
  await figma.setSlideSkipped({ slideId: args.slideId, skipped: args.skipped });
  return { nodeId: args.slideId, type: "SLIDE" };
};

export const setSlideTransitionPluginHandler: PluginHandler<typeof SetSlideTransition> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: set_slide_transition requires editorType=slides (got ${figma.editorType})`
    );
  }
  await figma.setSlideTransition({
    slideId: args.slideId,
    style: args.style,
    durationSec: args.durationSec,
    curve: args.curve,
    timingType: args.timingType,
    timingDelaySec: args.timingDelaySec,
  });
  return { nodeId: args.slideId, type: "SLIDE" };
};

export const setSlideBackgroundPluginHandler: PluginHandler<typeof SetSlideBackground> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: set_slide_background requires editorType=slides (got ${figma.editorType})`
    );
  }
  await figma.setSlideBackground({ slideId: args.slideId, paint: args.paint });
  return { nodeId: args.slideId, type: "SLIDE" };
};

export const moveSlidePluginHandler: PluginHandler<typeof MoveSlide> = async (args, { figma }) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: move_slide requires editorType=slides (got ${figma.editorType})`
    );
  }
  await figma.moveSlide({
    slideId: args.slideId,
    rowIndex: args.rowIndex,
    columnIndex: args.columnIndex,
  });
  return {
    nodeId: args.slideId,
    rowIndex: args.rowIndex,
    columnIndex: args.columnIndex,
  };
};

export const duplicateSlidePluginHandler: PluginHandler<typeof DuplicateSlide> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: duplicate_slide requires editorType=slides (got ${figma.editorType})`
    );
  }
  const node = await figma.duplicateSlide({ slideId: args.slideId });
  return { nodeId: node.id, type: "SLIDE" };
};

export const deleteSlidePluginHandler: PluginHandler<typeof DeleteSlide> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: delete_slide requires editorType=slides (got ${figma.editorType})`
    );
  }
  await figma.deleteSlide({ slideId: args.slideId });
  return { slideId: args.slideId, deleted: true as const };
};
