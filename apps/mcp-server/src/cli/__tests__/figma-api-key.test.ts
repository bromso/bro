import { describe, expect, it } from "vitest";
import { createFigmaApiKeyCheck } from "../checks/figma-api-key";

describe("figma-api-key check", () => {
  it("returns ok when FIGMA_API_KEY is set", async () => {
    const check = createFigmaApiKeyCheck({ env: { FIGMA_API_KEY: "figd_xyz" } });
    const r = await check.run();
    expect(r.status).toBe("ok");
    expect(r.detail).toMatch(/set/i);
  });

  it("returns warn when FIGMA_API_KEY is missing", async () => {
    const check = createFigmaApiKeyCheck({ env: {} });
    const r = await check.run();
    expect(r.status).toBe("warn");
    expect(r.detail).toContain("FIGMA_API_KEY");
    expect(r.detail).toContain("E_FIGMA_API_KEY_MISSING");
  });

  it("returns warn when FIGMA_API_KEY is an empty string", async () => {
    const check = createFigmaApiKeyCheck({ env: { FIGMA_API_KEY: "" } });
    const r = await check.run();
    expect(r.status).toBe("warn");
  });

  it("returns warn when FIGMA_API_KEY is undefined explicitly", async () => {
    const check = createFigmaApiKeyCheck({ env: { FIGMA_API_KEY: undefined } });
    const r = await check.run();
    expect(r.status).toBe("warn");
  });
});
