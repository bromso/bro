import { describe, expect, it } from "vitest";
import { detectClients } from "../detect";

const fakeFs = (present: ReadonlyArray<string>) => {
  const set = new Set(present);
  return (p: string) => set.has(p);
};

describe("detectClients", () => {
  it("returns all clients in stable order on macOS, marking present ones", () => {
    const home = "/Users/me";
    const present = [`${home}/.claude.json`, `${home}/.cursor/mcp.json`];
    const result = detectClients({
      homeDir: home,
      platform: "darwin",
      fileExists: fakeFs(present),
    });
    expect(result.map((c) => c.id)).toEqual([
      "claude-code",
      "claude-desktop",
      "cursor",
      "windsurf",
      "copilot",
    ]);
    expect(result.find((c) => c.id === "claude-code")?.present).toBe(true);
    expect(result.find((c) => c.id === "cursor")?.present).toBe(true);
    expect(result.find((c) => c.id === "windsurf")?.present).toBe(false);
  });

  it("uses ~/.config paths on linux", () => {
    const r = detectClients({
      homeDir: "/home/me",
      platform: "linux",
      fileExists: () => false,
    });
    expect(r.find((c) => c.id === "claude-desktop")?.configPath).toBe(
      "/home/me/.config/Claude/claude_desktop_config.json"
    );
    expect(r.find((c) => c.id === "copilot")?.configPath).toBe(
      "/home/me/.config/Code/User/mcp.json"
    );
  });

  it("uses APPDATA paths on win32", () => {
    const r = detectClients({
      homeDir: "C:\\Users\\me",
      platform: "win32",
      fileExists: () => false,
      env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" },
    });
    expect(r.find((c) => c.id === "claude-desktop")?.configPath).toBe(
      "C:\\Users\\me\\AppData\\Roaming\\Claude\\claude_desktop_config.json"
    );
  });

  it("returns the same order even when no clients are present", () => {
    const r = detectClients({
      homeDir: "/h",
      platform: "darwin",
      fileExists: () => false,
    });
    expect(r.map((c) => c.id)).toEqual([
      "claude-code",
      "claude-desktop",
      "cursor",
      "windsurf",
      "copilot",
    ]);
    expect(r.every((c) => c.present === false)).toBe(true);
  });
});
