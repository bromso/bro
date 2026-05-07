import type { PluginHandler } from "@repo/protocol";
import type {
  CreateSlide,
  CreateSlideRow,
  DeleteSlide,
  DuplicateSlide,
  GetSlide,
  GetSlideGrid,
  ListSlideRows,
  ListSlides,
  MoveSlide,
  SetActiveSlide,
  SetSlideBackground,
  SetSlideName,
  SetSlideSkipped,
  SetSlidesView,
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

export const listSlidesPluginHandler: PluginHandler<typeof ListSlides> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: list_slides requires editorType=slides (got ${figma.editorType})`
    );
  }
  const nodeIds = await figma.listSlides({ rowIndex: args.rowIndex });
  return { nodeIds: [...nodeIds], count: nodeIds.length };
};

export const listSlideRowsPluginHandler: PluginHandler<typeof ListSlideRows> = async (
  _args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: list_slide_rows requires editorType=slides (got ${figma.editorType})`
    );
  }
  const rowIds = await figma.listSlideRows();
  return { rowIds: [...rowIds], count: rowIds.length };
};

export const setActiveSlidePluginHandler: PluginHandler<typeof SetActiveSlide> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: set_active_slide requires editorType=slides (got ${figma.editorType})`
    );
  }
  await figma.setActiveSlide({ slideId: args.slideId });
  return { slideId: args.slideId };
};

export const getSlidePluginHandler: PluginHandler<typeof GetSlide> = async (args, { figma }) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: get_slide requires editorType=slides (got ${figma.editorType})`
    );
  }
  const node = await figma.getNodeById({ nodeId: args.slideId });
  if (!node || node.type !== "SLIDE") {
    throw new Error(`expected SLIDE node: ${args.slideId}`);
  }
  const transition = await figma.getSlideTransition({ slideId: args.slideId });
  const grid = await figma.getSlideGrid();
  const isFirst = grid[0]?.[0] === args.slideId;
  return {
    nodeId: args.slideId,
    type: "SLIDE",
    name: (node as { name?: string }).name ?? "",
    isSkipped: (node as { isSkipped?: boolean }).isSkipped ?? false,
    isFirst,
    transition: {
      style: transition.style,
      durationSec: transition.duration,
      curve: transition.curve,
    },
  };
};

export const setSlidesViewPluginHandler: PluginHandler<typeof SetSlidesView> = async (
  args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: set_slides_view requires editorType=slides (got ${figma.editorType})`
    );
  }
  await figma.setSlidesView({ view: args.view });
  return { view: args.view };
};

export const getSlideGridPluginHandler: PluginHandler<typeof GetSlideGrid> = async (
  _args,
  { figma }
) => {
  if (figma.editorType !== "slides") {
    throw new Error(
      `${E_MISMATCH}: get_slide_grid requires editorType=slides (got ${figma.editorType})`
    );
  }
  const grid = await figma.getSlideGrid();
  return { grid: grid.map((row) => [...row]) };
};
