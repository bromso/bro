import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

let env: Record<string, string>;
let configDir: string;

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), "mcp-spawn-"));
  env = {
    ...(process.env as Record<string, string>),
    HOME: configDir,
  };
});

afterEach(async () => {
  // Kill any straggler daemon by reading the lockfile and signalling its PID.
  try {
    const lockPath = join(configDir, ".figma-mcp", "daemon.lock");
    const raw = await readFile(lockPath, "utf-8");
    const { pid } = JSON.parse(raw) as { pid: number };
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already dead */
    }
  } catch {
    /* no lockfile, nothing to clean */
  }
});

describe("real-process spawn", () => {
  it("shim spawned via the same binary forks a daemon and runs bridge_status", async () => {
    const transport = new StdioClientTransport({
      command: "bun",
      args: ["run", join(__dirname, "..", "main.ts")],
      env,
    });
    const client = new Client({ name: "spawn-test", version: "0.0.0" }, { capabilities: {} });
    await client.connect(transport);

    const result = await client.callTool({ name: "bridge_status", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result)).toContain('\\"connected\\":false');

    await client.close();
  }, 20_000);
});
