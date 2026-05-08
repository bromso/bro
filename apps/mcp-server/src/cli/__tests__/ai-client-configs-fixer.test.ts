import { describe, expect, it } from "vitest";
import { createAiClientConfigsCheck } from "../checks/ai-client-configs";
import type { McpServerEntry, WriteConfigResult } from "../config-writer";
import type { DetectedClient } from "../detect";
import { createAiClientConfigsFixer } from "../fixers/ai-client-configs";

const ENTRY: McpServerEntry = { command: "npx", args: ["-y", "@bromso/figma-mcp"] };
const SERVER_NAME = "figma";

function makeStore() {
  const files = new Map<string, string>();
  const writeConfig = async (args: {
    path: string;
    mcpServerName: string;
    entry: McpServerEntry;
  }): Promise<WriteConfigResult> => {
    const existingRaw = files.get(args.path);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    const mcpServers = { ...(existing.mcpServers ?? {}) };
    const prior = mcpServers[args.mcpServerName] ?? null;
    mcpServers[args.mcpServerName] = args.entry;
    files.set(args.path, JSON.stringify({ ...existing, mcpServers }));
    return { written: true, prior };
  };
  const readFile = async (path: string): Promise<string> => {
    const v = files.get(path);
    if (v === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return v;
  };
  return { files, writeConfig, readFile };
}

const cursor: DetectedClient = {
  id: "cursor",
  name: "Cursor",
  configPath: "/cfg/cursor.json",
  present: true,
};
const windsurf: DetectedClient = {
  id: "windsurf",
  name: "Windsurf",
  configPath: "/cfg/windsurf.json",
  present: true,
};
const copilot: DetectedClient = {
  id: "copilot",
  name: "Copilot",
  configPath: "/cfg/copilot.json",
  present: false,
};

describe("createAiClientConfigsFixer", () => {
  it("rewrites drifted clients (mixed-state set)", async () => {
    const { files, writeConfig, readFile } = makeStore();
    // cursor is correct, windsurf is drifted (missing mcpServers.figma)
    files.set("/cfg/cursor.json", JSON.stringify({ mcpServers: { figma: ENTRY } }));
    files.set("/cfg/windsurf.json", JSON.stringify({ mcpServers: {} }));

    // Sanity: the check reports drift on windsurf only.
    const checkBefore = await createAiClientConfigsCheck(
      [cursor, windsurf, copilot],
      readFile
    ).run();
    expect(checkBefore.status).toBe("warn");
    expect(checkBefore.detail).toMatch(/windsurf/);
    expect(checkBefore.detail).not.toMatch(/cursor/);

    const fixer = createAiClientConfigsFixer({
      clients: [cursor, windsurf, copilot],
      mcpServerName: SERVER_NAME,
      entry: ENTRY,
      writeConfig,
    });
    const result = await fixer.run();

    // Both detected (present) clients get re-written; copilot is skipped
    // because it's not present.
    expect(result.detail).toMatch(/cursor/);
    expect(result.detail).toMatch(/windsurf/);
    expect(result.detail).not.toMatch(/copilot/);

    const checkAfter = await createAiClientConfigsCheck(
      [cursor, windsurf, copilot],
      readFile
    ).run();
    expect(checkAfter.status).toBe("ok");
  });

  it("creates entries for clients that have no config file yet", async () => {
    const { writeConfig } = makeStore();
    // cursor is "present" per detection but file was never written to the
    // store — runSetup will create it.
    const fixer = createAiClientConfigsFixer({
      clients: [cursor],
      mcpServerName: SERVER_NAME,
      entry: ENTRY,
      writeConfig,
    });
    const result = await fixer.run();
    expect(result.detail).toMatch(/cursor=created/);
  });

  it("reports 'no clients to repair' when no detected clients are present", async () => {
    const { writeConfig } = makeStore();
    const fixer = createAiClientConfigsFixer({
      clients: [],
      mcpServerName: SERVER_NAME,
      entry: ENTRY,
      writeConfig,
    });
    const result = await fixer.run();
    expect(result.detail).toBe("no clients to repair");
  });

  it("is idempotent — running twice leaves clients correct", async () => {
    const { files, writeConfig, readFile } = makeStore();
    files.set("/cfg/cursor.json", JSON.stringify({ mcpServers: {} }));
    const fixer = createAiClientConfigsFixer({
      clients: [cursor],
      mcpServerName: SERVER_NAME,
      entry: ENTRY,
      writeConfig,
    });
    await fixer.run();
    await fixer.run();
    const checkAfter = await createAiClientConfigsCheck([cursor], readFile).run();
    expect(checkAfter.status).toBe("ok");
  });

  it("propagates writeConfig errors as a thrown fixer failure", async () => {
    const fixer = createAiClientConfigsFixer({
      clients: [cursor],
      mcpServerName: SERVER_NAME,
      entry: ENTRY,
      writeConfig: async () => {
        throw new Error("disk full");
      },
    });
    await expect(fixer.run()).rejects.toThrow(/disk full/);
  });
});
