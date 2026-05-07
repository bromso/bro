import { describe, expect, it, vi } from "vitest";
import type { DetectedClient } from "../detect";
import { runSetup } from "../setup";

const detected: DetectedClient[] = [
  { id: "claude-code", name: "Claude Code", configPath: "/h/.claude.json", present: true },
  { id: "cursor", name: "Cursor", configPath: "/h/.cursor/mcp.json", present: false },
];

const ENTRY = { command: "npx", args: ["-y", "@scope/figma-mcp"] as const };

describe("runSetup", () => {
  it("writes one entry per detected client", async () => {
    const writeConfig = vi.fn().mockResolvedValue({ written: true, prior: null });
    const report = await runSetup({
      clients: detected,
      entry: ENTRY,
      mcpServerName: "figma",
      writeConfig,
      dryRun: false,
      clientFilter: null,
    });
    expect(writeConfig).toHaveBeenCalledTimes(2);
    expect(report.actions).toEqual([
      { id: "claude-code", action: "created", path: "/h/.claude.json" },
      { id: "cursor", action: "created", path: "/h/.cursor/mcp.json" },
    ]);
  });

  it("reports updated when prior entry existed", async () => {
    const writeConfig = vi
      .fn()
      .mockResolvedValueOnce({ written: true, prior: { command: "old" } })
      .mockResolvedValueOnce({ written: true, prior: null });
    const report = await runSetup({
      clients: detected,
      entry: ENTRY,
      mcpServerName: "figma",
      writeConfig,
      dryRun: false,
      clientFilter: null,
    });
    expect(report.actions[0]?.action).toBe("updated");
    expect(report.actions[1]?.action).toBe("created");
  });

  it("--dry-run does not call writeConfig", async () => {
    const writeConfig = vi.fn();
    const report = await runSetup({
      clients: detected,
      entry: ENTRY,
      mcpServerName: "figma",
      writeConfig,
      dryRun: true,
      clientFilter: null,
    });
    expect(writeConfig).not.toHaveBeenCalled();
    expect(report.actions.every((a) => a.action === "would-write")).toBe(true);
  });

  it("--client filters to a single client", async () => {
    const writeConfig = vi.fn().mockResolvedValue({ written: true, prior: null });
    const report = await runSetup({
      clients: detected,
      entry: ENTRY,
      mcpServerName: "figma",
      writeConfig,
      dryRun: false,
      clientFilter: "cursor",
    });
    expect(writeConfig).toHaveBeenCalledTimes(1);
    expect(report.actions).toEqual([
      { id: "cursor", action: "created", path: "/h/.cursor/mcp.json" },
    ]);
  });

  it("--client with unknown id reports skipped: not-detected", async () => {
    const writeConfig = vi.fn();
    const report = await runSetup({
      clients: detected,
      entry: ENTRY,
      mcpServerName: "figma",
      writeConfig,
      dryRun: false,
      clientFilter: "windsurf",
    });
    expect(writeConfig).not.toHaveBeenCalled();
    expect(report.actions).toEqual([{ id: "windsurf", action: "not-detected", path: null }]);
  });
});
