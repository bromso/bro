# @repo/tools-rest

## 0.2.1

### Patch Changes

- Updated dependencies [[`322f32d`](https://github.com/bromso/bro/commit/322f32d7558a13a539c8bc3dfb93a5e478dc1d58)]:
  - @repo/figma-api-client@0.4.0
  - @repo/protocol@0.1.3

## 0.2.0

### Minor Changes

- [#32](https://github.com/bromso/bro/pull/32) [`5a59da5`](https://github.com/bromso/bro/commit/5a59da510731dbca729e8f4ccee79ecd0df9581f) Thanks [@bromso](https://github.com/bromso)! - `tools-rest` gains 6 webhook tools backed by the Figma webhooks v2 API.
  Three reads (`list_team_webhooks`, `get_webhook`, `get_webhook_requests`)
  and three writes (`create_webhook`, `update_webhook`, `delete_webhook`).
  Writes are gated behind `--enable-write-tools` like the existing rest
  write tools.

  `@repo/figma-api-client` adds `requestV2` to hit Figma's v2 API surface
  without breaking the existing 20 v1 tools.

  Out of scope: webhook delivery handling (figma-mcp doesn't host the
  endpoint a webhook posts to — that's the user's app), event-type
  filtering beyond Figma's documented enum, OAuth-based webhook ownership
  (PAT only).

### Patch Changes

- Updated dependencies [[`5a59da5`](https://github.com/bromso/bro/commit/5a59da510731dbca729e8f4ccee79ecd0df9581f)]:
  - @repo/figma-api-client@0.3.0
  - @repo/protocol@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @repo/protocol@0.1.3

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @repo/protocol@0.1.2

## 0.1.0

### Minor Changes

- [#17](https://github.com/bromso/bro/pull/17) [`dfd5950`](https://github.com/bromso/bro/commit/dfd595027015a8eed33cdf20fda5ba40aacf8f79) Thanks [@bromso](https://github.com/bromso)! - Phase 11: tools-rest pack (cloud-mode-without-plugin reads).

  A new server-side-only tool pack ships, bringing the registry from ~33 to ~53 tools.

  `@repo/figma-api-client` (new): a typed Figma REST client wrapping native
  `fetch` against `https://api.figma.com/v1/`. Constructor takes
  `{apiKey, fetchFn?, baseUrl?}` for testability. Throws `FigmaApiError`
  on non-2xx with codes `E_FIGMA_REST_AUTH` (401/403), `E_FIGMA_REST_404`,
  `E_FIGMA_REST_429`, `E_FIGMA_REST_UNKNOWN`. Ships `FigmaApiFake` for
  in-memory tests.

  `@repo/tools-rest` (new): 20 server-handler tools backed by REST. No
  plugin handlers — these tools work whenever `FIGMA_API_KEY` is in env,
  even without a paired bridge plugin.

  - File metadata: `get_file_metadata`, `get_file_pages`, `get_node_by_id`,
    `get_file_versions`.
  - File catalog: `get_file_styles`, `get_file_components`,
    `get_file_component_sets`, `get_file_branches`.
  - Assets + identity: `get_image_renders`, `get_image_fills`, `get_user_me`.
  - Comments: `get_file_comments`, `post_file_comment` (write-gated),
    `delete_file_comment` (write-gated).
  - Team / project: `get_team_projects`, `get_project_files`,
    `get_team_components` (cursor-paginated).
  - Team catalog + dev resources: `get_team_styles` (cursor-paginated),
    `get_dev_resources`, `post_dev_resources` (write-gated).

  `@bromso/figma-mcp`: reads `FIGMA_API_KEY` from env on startup. New
  `--enable-write-tools` flag (default off) gates the three mutating tools
  behind an explicit opt-in to prevent prompt-driven mass commenting / spam
  dev resources. With the flag off, write tools surface
  `E_WRITE_TOOLS_DISABLED` immediately on call. With no `FIGMA_API_KEY`,
  all 20 REST tools surface `E_FIGMA_API_KEY_MISSING` — the daemon boots
  fine.

  Protocol surface: `ServerHandlerContext.figmaApi?: FigmaApi | null` is
  the new typed seam. The Phase 1 `figmaApiKey` placeholder remains
  `@deprecated` for one more phase as a migration window.

  Out of scope: `@repo/tools-slides`, `@repo/tools-a11y`. Webhook tools.
  OAuth-based auth (env-only for now). Plugin runtime tools (those are
  tools-extract / tools-design / tools-figjam). REST writes beyond comments

  - dev resources (Figma's REST API does not support file content updates).
    WebSocket-based real-time subscriptions. Real-Figma golden tests for the
    REST pack. Caching. Rate-limit auto-retry.

### Patch Changes

- Updated dependencies [[`dfd5950`](https://github.com/bromso/bro/commit/dfd595027015a8eed33cdf20fda5ba40aacf8f79)]:
  - @repo/figma-api-client@0.2.0
  - @repo/protocol@0.1.1
