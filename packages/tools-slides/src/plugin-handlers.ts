import type { PluginHandler } from "@repo/protocol";
import { requireSlides } from "./guard";
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

export const createSlidePluginHandler: PluginHandler<typeof CreateSlide> = async (
  args,
  { figma }
) => {
  const sl = requireSlides(figma, "create_slide");
  const node = await sl.createSlide(args);
  return { nodeId: node.id, type: "SLIDE" };
};

export const createSlideRowPluginHandler: PluginHandler<typeof CreateSlideRow> = async (
  args,
  { figma }
) => {
  const sl = requireSlides(figma, "create_slide_row");
  const node = await sl.createSlideRow(args);
  return { nodeId: node.id, type: "SLIDE_ROW" };
};

export const setSlideNamePluginHandler: PluginHandler<typeof SetSlideName> = async (
  args,
  { figma }
) => {
  const sl = requireSlides(figma, "set_slide_name");
  await sl.setSlideName({ slideId: args.slideId, name: args.name });
  return { nodeId: args.slideId, type: "SLIDE" };
};

export const setSlideSkippedPluginHandler: PluginHandler<typeof SetSlideSkipped> = async (
  args,
  { figma }
) => {
  const sl = requireSlides(figma, "set_slide_skipped");
  await sl.setSlideSkipped({ slideId: args.slideId, skipped: args.skipped });
  return { nodeId: args.slideId, type: "SLIDE" };
};

export const setSlideTransitionPluginHandler: PluginHandler<typeof SetSlideTransition> = async (
  args,
  { figma }
) => {
  const sl = requireSlides(figma, "set_slide_transition");
  await sl.setSlideTransition({
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
  const sl = requireSlides(figma, "set_slide_background");
  await sl.setSlideBackground({ slideId: args.slideId, paint: args.paint });
  return { nodeId: args.slideId, type: "SLIDE" };
};

export const moveSlidePluginHandler: PluginHandler<typeof MoveSlide> = async (args, { figma }) => {
  const sl = requireSlides(figma, "move_slide");
  await sl.moveSlide({
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
  const sl = requireSlides(figma, "duplicate_slide");
  const node = await sl.duplicateSlide({ slideId: args.slideId });
  return { nodeId: node.id, type: "SLIDE" };
};

export const deleteSlidePluginHandler: PluginHandler<typeof DeleteSlide> = async (
  args,
  { figma }
) => {
  const sl = requireSlides(figma, "delete_slide");
  await sl.deleteSlide({ slideId: args.slideId });
  return { slideId: args.slideId, deleted: true as const };
};

export const listSlidesPluginHandler: PluginHandler<typeof ListSlides> = async (
  args,
  { figma }
) => {
  const sl = requireSlides(figma, "list_slides");
  const nodeIds = await sl.listSlides({ rowIndex: args.rowIndex });
  return { nodeIds: [...nodeIds], count: nodeIds.length };
};

export const listSlideRowsPluginHandler: PluginHandler<typeof ListSlideRows> = async (
  _args,
  { figma }
) => {
  const sl = requireSlides(figma, "list_slide_rows");
  const rowIds = await sl.listSlideRows();
  return { rowIds: [...rowIds], count: rowIds.length };
};

export const setActiveSlidePluginHandler: PluginHandler<typeof SetActiveSlide> = async (
  args,
  { figma }
) => {
  const sl = requireSlides(figma, "set_active_slide");
  await sl.setActiveSlide({ slideId: args.slideId });
  return { slideId: args.slideId };
};

export const getSlidePluginHandler: PluginHandler<typeof GetSlide> = async (args, { figma }) => {
  const sl = requireSlides(figma, "get_slide");
  const node = await sl.getNodeById({ nodeId: args.slideId });
  if (!node || node.type !== "SLIDE") {
    throw new Error(`expected SLIDE node: ${args.slideId}`);
  }
  const transition = await sl.getSlideTransition({ slideId: args.slideId });
  const grid = await sl.getSlideGrid();
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
  const sl = requireSlides(figma, "set_slides_view");
  await sl.setSlidesView({ view: args.view });
  return { view: args.view };
};

export const getSlideGridPluginHandler: PluginHandler<typeof GetSlideGrid> = async (
  _args,
  { figma }
) => {
  const sl = requireSlides(figma, "get_slide_grid");
  const grid = await sl.getSlideGrid();
  return { grid: grid.map((row) => [...row]) };
};
