import {
  CreateWebhook,
  DeleteWebhook,
  GetWebhook,
  GetWebhookRequests,
  ListTeamWebhooks,
  UpdateWebhook,
} from "@repo/tools-rest";
import { describe, expect, it } from "vitest";

describe("Phase 19 webhook catalog", () => {
  it("exposes 6 webhook tools with the expected wire names", () => {
    const names = [
      ListTeamWebhooks.name,
      GetWebhook.name,
      GetWebhookRequests.name,
      CreateWebhook.name,
      UpdateWebhook.name,
      DeleteWebhook.name,
    ];
    expect(new Set(names).size).toBe(6);
    expect(names).toEqual([
      "list_team_webhooks",
      "get_webhook",
      "get_webhook_requests",
      "create_webhook",
      "update_webhook",
      "delete_webhook",
    ]);
  });

  it("every input schema rejects extraneous keys (strict)", () => {
    const tools = [
      ListTeamWebhooks,
      GetWebhook,
      GetWebhookRequests,
      CreateWebhook,
      UpdateWebhook,
      DeleteWebhook,
    ];
    for (const tool of tools) {
      const r = tool.input.safeParse({ __unexpected: 1 });
      expect(r.success).toBe(false);
    }
  });

  it("the three write-gated tools are clearly named", () => {
    expect(CreateWebhook.description).toMatch(/WRITE/i);
    expect(UpdateWebhook.description).toMatch(/WRITE/i);
    expect(DeleteWebhook.description).toMatch(/WRITE/i);
  });
});
