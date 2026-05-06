import { describe, expect, it, vi } from "vitest";
import { buildOpenCommand, runOpenFigma } from "../open-figma";

describe("buildOpenCommand", () => {
  it.each([
    ["darwin", "/m/manifest.json", { cmd: "open", args: ["-R", "/m/manifest.json"] }],
    ["linux", "/m/manifest.json", { cmd: "xdg-open", args: ["/m"] }],
    ["win32", "C:\\m\\manifest.json", { cmd: "explorer", args: ["/select,C:\\m\\manifest.json"] }],
  ] as const)("(%s) → %j", (platform, path, expected) => {
    expect(buildOpenCommand({ platform, path })).toEqual(expected);
  });
});

describe("runOpenFigma", () => {
  it("spawns the platform-specific command", async () => {
    const spawnFn = vi.fn();
    await runOpenFigma({
      platform: "darwin",
      path: "/m/manifest.json",
      spawnFn: spawnFn as never,
    });
    expect(spawnFn).toHaveBeenCalledWith("open", ["-R", "/m/manifest.json"], expect.any(Object));
  });
});
