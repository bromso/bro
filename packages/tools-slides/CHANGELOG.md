# @repo/tools-slides

## 0.1.1

### Patch Changes

- Updated dependencies [[`bbbedc9`](https://github.com/bromso/bro/commit/bbbedc93cd008f187efaf8e823c825698882f3a5)]:
  - @repo/figma-adapter@0.4.0
  - @repo/protocol@0.1.3

## 0.1.0

### Minor Changes

- [#18](https://github.com/bromso/bro/pull/18) [`ee1ef8b`](https://github.com/bromso/bro/commit/ee1ef8be73c70ab7cd2515f22df73a1bbef35a48) Thanks [@bromso](https://github.com/bromso)! - Phase 12: tools-slides pack.

  A new tool pack ships, bringing the registry from ~53 to ~68 tools.

  `@repo/tools-slides` (new): 15 tools for Figma Slides files. Every tool is
  gated on `figma.editorType === "slides"`; calling on a Figma or FigJam
  editor returns `E_FIGMA_EDITOR_TYPE_MISMATCH` from the plugin handler.

  - Slide creation: `create_slide`, `create_slide_row`, `duplicate_slide`.
  - Slide metadata: `set_slide_name`, `set_slide_skipped`,
    `set_slide_background`, `set_slide_transition`.
  - Slide lifecycle: `move_slide`, `delete_slide`.
  - Queries: `list_slides`, `list_slide_rows`, `get_slide`, `get_slide_grid`.
  - Focus + view: `set_active_slide`, `set_slides_view`.

  The `requireSlides(figma, toolName)` guard helper is exported from
  the package for downstream reuse. The wire error code
  `E_FIGMA_EDITOR_TYPE_MISMATCH` is the same code Phase 10's FigJam
  guard surfaces — the daemon does not distinguish "wrong editor"
  between FigJam and Slides packs.

  `@repo/figma-adapter` (extended): adds the `SlideNode`, `SlideRowNode`
  types and supporting types (`SlideTransition`, `SlideTransitionStyle`,
  `SlideTransitionCurve`, `SlideTransitionTimingType`, `SlidesView`)
  plus 17 new methods (`createSlide`, `createSlideRow`, `setSlideName`,
  `setSlideSkipped`, `setSlideTransition`, `getSlideTransition`,
  `setSlideBackground`, `moveSlide`, `duplicateSlide`, `deleteSlide`,
  `listSlides`, `listSlideRows`, `setActiveSlide`, `getActiveSlideId`,
  `setSlidesView`, `getSlidesView`, `getSlideGrid`). `FigmaFake` mirrors
  all methods with deterministic id generation (`sld1`, `slr1`);
  `RealFigmaAdapter` wraps the matching `figma.*` calls (`figma.createSlide`,
  `figma.createSlideRow`, `figma.getSlideGrid`, `figma.setSlideGrid`,
  `slide.setSlideTransition`, `slide.getSlideTransition`,
  `slide.isSkippedSlide`, `figma.currentPage.focusedSlide`,
  `figma.viewport.slidesView`, `slide.clone`).

  The adapter methods themselves do NOT enforce the editor-type
  discriminator — that's the tool handler's responsibility, so the
  adapter remains testable on any editor.

  Out of scope: `@repo/tools-a11y` (audit / lint / annotation tools).
  Programmatic presentation mode, audience pointer, cursor chat,
  embedded interactive slide elements (polls / facepile / YouTube),
  slide layout templates, speaker notes (no plugin API), slide
  thumbnail tinting (no plugin API), `slidesviewchange` event
  subscription. A real-figma golden test for Slides (Task 12.11
  ships a skipped stub documenting why; Slides REST coverage is
  shallow and the round-trip value is low for plugin-side tools).

### Patch Changes

- Updated dependencies [[`ee1ef8b`](https://github.com/bromso/bro/commit/ee1ef8be73c70ab7cd2515f22df73a1bbef35a48)]:
  - @repo/figma-adapter@0.3.0
  - @repo/protocol@0.1.2
