---
"@bromso/figma-mcp": minor
"@repo/tools-rest": minor
"@repo/figma-api-client": minor
---

`tools-rest` gains 6 webhook tools backed by the Figma webhooks v2 API.
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
