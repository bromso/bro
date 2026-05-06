import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("WSS /pair?code=...", () => {
  it("upgrades when the code is valid", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
      sessionId: string;
    }>();

    const response = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(response.status).toBe(101);
    expect(response.webSocket).toBeDefined();
    response.webSocket?.accept();
    response.webSocket?.close();
  });

  it("returns 401 when the code is unknown", async () => {
    const response = await SELF.fetch("https://relay/pair?code=000000", {
      headers: { Upgrade: "websocket" },
    });
    expect(response.status).toBe(401);
  });

  it("rejects a second connect with the same code (single-use)", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
      sessionId: string;
    }>();

    const a = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(a.status).toBe(101);
    a.webSocket?.accept();
    a.webSocket?.close();

    const b = await SELF.fetch(`https://relay/pair?code=${pair.code}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(b.status).toBe(401);
  });

  it("returns 426 if the upgrade header is missing", async () => {
    const pair = await (await SELF.fetch("https://relay/pair", { method: "POST" })).json<{
      code: string;
    }>();
    const response = await SELF.fetch(`https://relay/pair?code=${pair.code}`);
    expect(response.status).toBe(426);
  });
});
