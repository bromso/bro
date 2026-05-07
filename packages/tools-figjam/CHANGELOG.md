# @repo/tools-figjam

## 0.1.0

### Minor Changes

- [#15](https://github.com/bromso/bro/pull/15) [`38b52a2`](https://github.com/bromso/bro/commit/38b52a2a907c387f9fa6f6f8b1f20b3ee9f1d66f) Thanks [@bromso](https://github.com/bromso)! - Phase 10: tools-figjam pack.

  A new tool pack ships, bringing the registry from ~23 to ~33 tools.

  `@repo/tools-figjam` (new): 10 tools for FigJam files. Every tool is
  gated on `figma.editorType === "figjam"`; calling on a Figma or Slides
  editor returns `E_FIGMA_EDITOR_TYPE_MISMATCH` from the plugin handler.

  - Node creation: `create_sticky`, `create_section`, `create_connector`,
    `create_code_block`, `create_shape_with_text`, `create_table`.
  - Mutators: `set_sticky_content`, `set_section_name`.
  - Section membership: `move_into_section`, `list_section_children`.

  The `requireFigJam(figma, toolName)` guard helper is exported from
  the package for downstream reuse.

  `@repo/figma-adapter` (extended): adds the `StickyNode`, `SectionNode`,
  `ConnectorNode`, `CodeBlockNode`, `ShapeWithTextNode`, `TableNode` types
  plus 10 new methods (`createSticky`, `createSection`, `createConnector`,
  `createCodeBlock`, `createShapeWithText`, `createTable`,
  `setStickyContent`, `setSectionName`, `moveIntoSection`,
  `listSectionChildren`). `FigmaFake` mirrors all methods with
  deterministic id generation (`stk1`, `sec1`, `cn1`, `cb1`, `swt1`,
  `tbl1`); `RealFigmaAdapter` wraps the matching `figma.*` calls.

  The adapter methods themselves do NOT enforce the editor-type
  discriminator — that's the tool handler's responsibility, so the
  adapter remains testable on any editor.

  Out of scope: `@repo/tools-slides`, `@repo/tools-a11y`,
  `@repo/tools-rest` (each becomes its own follow-up phase). FigJam
  widgets, timer/voting/cursor-chat, multi-board support, connector
  geometry/labels, sticky styling beyond `content` + `authorName`. A
  real-figma golden test for FigJam (Task 10.10 ships a skipped stub
  documenting why; the REST API's FigJam coverage is too thin for the
  Phase 9 round-trip pattern).

### Patch Changes

- Updated dependencies [[`38b52a2`](https://github.com/bromso/bro/commit/38b52a2a907c387f9fa6f6f8b1f20b3ee9f1d66f)]:
  - @repo/figma-adapter@0.2.0
  - @repo/protocol@0.1.1
