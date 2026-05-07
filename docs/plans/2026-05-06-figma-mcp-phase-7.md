# Phase 7: Setup CLI + Diagnostics

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** One-command install. `figma-mcp setup` detects AI clients and writes their MCP configs. `figma-mcp doctor` diagnoses problems. `--print-path` resolves the bundled plugin manifest. `--cloud` mode pairs through the Phase 6 relay.

**Architecture:** Adds a CLI dispatch layer in front of the existing shim/daemon resolution. Pure-function detectors and config writers (injected fs/spawn for tests). Doctor runs parallel health checks.

**Tech Stack:** Node 22 (existing); the CLI lives inside `apps/mcp-server` so the published binary keeps a single entry. No new runtime deps unless absolutely required (the existing Streamable HTTP client work for `--cloud` may pull in the MCP SDK Streamable HTTP transport already vendored).

---

## Out of scope (call-out so the executor doesn't drift)

- **Production relay URL.** Phase 9 pins the deploy domain. Phase 7 uses `https://figma-mcp-relay.bromso.workers.dev` as a placeholder, configurable via `--relay-url`.
- **Windows beyond best-effort.** CI runs macOS; named-pipe code is exercised via unit tests with a `pickIpcTransport(platform)` selector. Real Windows smoke is Phase 9.
- **Telemetry, auto-update, self-installer.** v1 install path is `npx @scope/figma-mcp setup`. No analytics. No auto-pulling new versions.
- **OAuth / login flow for cloud.** Pairing codes are the only auth — same as Phase 6.
- **Multi-shim fan-out for `--cloud`.** The Streamable HTTP entry in AI client configs points to a single relay session; per-AI-client multiplexing over the same session is Phase 8+.
- **Beyond the design doc's six error categories.** No new categories. No new MCP error codes. CLI failures map to `DaemonError` (local) or `RelayError` (cloud) where applicable; everything else is a process-exit non-zero with a stderr message.
- **Doctor remediation actions.** Doctor *reports*; it does NOT auto-fix. (No "doctor --fix" in v1.)

---

## Acceptance Criteria

- `apps/mcp-server/src/cli/` exists and exposes a pure dispatcher used by `main.ts` BEFORE `resolveStartup`.
- `figma-mcp setup` (no flags) detects supported AI clients and writes/merges their MCP config entries; reports a table of `{client, action, path}`. `--dry-run` prints without writing. `--client <id>` filters.
- `figma-mcp setup --cloud` calls the relay's `POST /pair`, prints the 6-digit code with TTL, writes Streamable HTTP entries.
- `figma-mcp doctor` runs all checks in parallel; supports `--json`. Reports the failure modes from the design's "specific gotchas" list (stale lockfile, dead daemon, plugin not paired, AI client config drift, port/socket conflict, recent errors, version drift, editor-type mismatch — the last two are reported via the daemon's own diagnostics).
- `figma-mcp --print-path` prints the absolute path to the bundled bridge plugin's `manifest.json` and exits 0.
- `figma-mcp setup --open-figma` opens the OS file picker pre-positioned at the manifest path.
- `figma-mcp --help` prints usage covering every subcommand and flag introduced in this phase.
- Existing shim/daemon paths are untouched — `bun run --filter @repo/mcp-server test` still passes for all pre-Phase-7 tests.
- Coverage gate ≥80/75/80/80 over `apps/mcp-server/src/cli/**`.
- Phase 7 changeset under `.changeset/phase-7-setup-cli.md`.
- Commit hygiene: each task ends with one conventional-commit-formatted commit. No multi-task commits, no `git add -A`.

---

## Task Map

| #    | Task                                                     | Package / App | Type       |
| ---- | -------------------------------------------------------- | ------------- | ---------- |
| 7.1  | Scaffold `apps/mcp-server/src/cli/` + dispatcher + help  | mcp-server    | code       |
| 7.2  | AI client detector (pure, injected fs)                   | mcp-server    | code       |
| 7.3  | Config writer (atomic merge, preserves siblings)         | mcp-server    | code       |
| 7.4  | `figma-mcp setup` orchestration + `--dry-run`/`--client` | mcp-server    | code       |
| 7.5  | `setup --cloud` (relay pair + Streamable HTTP entry)     | mcp-server    | code       |
| 7.6  | `--print-path` + dist asset wiring                       | mcp-server    | code/infra |
| 7.7  | `setup --open-figma` (cross-platform spawn)              | mcp-server    | code       |
| 7.8  | `figma-mcp doctor` (parallel checks + `--json`)          | mcp-server    | code       |
| 7.9  | `doctor` socket/port-conflict check                      | mcp-server    | code       |
| 7.10 | Windows named-pipe transport + `pickIpcTransport`        | transport     | code       |
| 7.11 | Wire CLI into `main.ts` + E2E spawn tests                | mcp-server    | code/tests |
| 7.12 | Coverage gate + Phase 7 changeset + acceptance           | repo          | infra      |

---

## Task 7.1: Scaffold `apps/mcp-server/src/cli/` + dispatcher

**Goal:** A pure function `dispatch({argv}) → CliCommand` that classifies `argv[2]` into one of `{kind: "setup"|"doctor"|"print-path"|"runtime", flags}`. Plus a `--help` short-circuit that prints usage. The dispatcher is the ONLY thing `main.ts` will check before falling through to the existing `resolveStartup` flow. Unknown subcommands fall through to `runtime` (preserves the existing stdio-shim path).

**Files:**

- Create: `apps/mcp-server/src/cli/dispatch.ts`
- Create: `apps/mcp-server/src/cli/usage.ts`
- Create: `apps/mcp-server/src/cli/__tests__/dispatch.test.ts`

**Step 1: Failing tests** — `apps/mcp-server/src/cli/__tests__/dispatch.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { dispatch } from "../dispatch";

describe("dispatch", () => {
  it.each([
    [["node", "main.js"], "runtime"],
    [["node", "main.js", "--daemon"], "runtime"],
    [["node", "main.js", "setup"], "setup"],
    [["node", "main.js", "doctor"], "doctor"],
    [["node", "main.js", "--print-path"], "print-path"],
    [["node", "main.js", "--help"], "help"],
    [["node", "main.js", "-h"], "help"],
  ])("classifies %j as %s", (argv, expected) => {
    expect(dispatch({ argv }).kind).toBe(expected);
  });

  it("setup --dry-run sets the dryRun flag", () => {
    const cmd = dispatch({ argv: ["node", "main.js", "setup", "--dry-run"] });
    expect(cmd.kind).toBe("setup");
    if (cmd.kind === "setup") {
      expect(cmd.flags.dryRun).toBe(true);
    }
  });

  it("setup --cloud --relay-url=X captures the URL", () => {
    const cmd = dispatch({
      argv: ["node", "main.js", "setup", "--cloud", "--relay-url=https://r.example"],
    });
    if (cmd.kind !== "setup") throw new Error("expected setup");
    expect(cmd.flags.cloud).toBe(true);
    expect(cmd.flags.relayUrl).toBe("https://r.example");
  });

  it("setup --client cursor sets clientFilter", () => {
    const cmd = dispatch({
      argv: ["node", "main.js", "setup", "--client", "cursor"],
    });
    if (cmd.kind !== "setup") throw new Error("expected setup");
    expect(cmd.flags.client).toBe("cursor");
  });

  it("doctor --json sets json flag", () => {
    const cmd = dispatch({ argv: ["node", "main.js", "doctor", "--json"] });
    if (cmd.kind !== "doctor") throw new Error("expected doctor");
    expect(cmd.flags.json).toBe(true);
  });
});
```

Run `bun run --filter @repo/mcp-server test dispatch` → FAIL.

**Step 2: Implement** — `apps/mcp-server/src/cli/dispatch.ts`

```ts
export type CliCommand =
  | { kind: "runtime" }
  | { kind: "help" }
  | { kind: "print-path" }
  | {
      kind: "setup";
      flags: {
        dryRun: boolean;
        cloud: boolean;
        openFigma: boolean;
        client: string | null;
        relayUrl: string | null;
      };
    }
  | { kind: "doctor"; flags: { json: boolean } };

export interface DispatchOptions {
  readonly argv: readonly string[];
}

export function dispatch(options: DispatchOptions): CliCommand {
  const args = options.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return { kind: "help" };
  if (args.includes("--print-path")) return { kind: "print-path" };

  const sub = args[0];
  if (sub === "setup") {
    const rest = args.slice(1);
    return {
      kind: "setup",
      flags: {
        dryRun: rest.includes("--dry-run"),
        cloud: rest.includes("--cloud"),
        openFigma: rest.includes("--open-figma"),
        client: takeValue(rest, "--client"),
        relayUrl: takeValue(rest, "--relay-url"),
      },
    };
  }
  if (sub === "doctor") {
    return { kind: "doctor", flags: { json: args.includes("--json") } };
  }
  return { kind: "runtime" };
}

function takeValue(args: readonly string[], flag: string): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === flag && i + 1 < args.length) return args[i + 1];
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return null;
}
```

**Step 3: Usage** — `apps/mcp-server/src/cli/usage.ts`

```ts
export const USAGE = `Usage: figma-mcp [command] [options]

Commands:
  (no command)         Run as MCP stdio shim (default; spawns daemon if needed).
  setup                Detect AI clients and write their MCP configs.
  doctor               Diagnose daemon, plugin pairing, and AI client configs.

Options:
  --print-path         Print the bundled bridge-plugin manifest path and exit.
  --help, -h           Show this usage text.

setup options:
  --dry-run            Print actions without writing any files.
  --client <id>        Only configure the named client (claude-code|claude-desktop|cursor|windsurf|copilot).
  --cloud              Configure for the cloud relay; pairs and prints a 6-digit code.
  --open-figma         Open the bundled plugin manifest in the OS file picker for drag-import.
  --relay-url <url>    Override the relay base URL (default: https://figma-mcp-relay.bromso.workers.dev).

doctor options:
  --json               Emit JSON output for tooling consumption.
`;
```

**Step 4: Verify, commit**

```bash
bun run --filter @repo/mcp-server test dispatch
git add apps/mcp-server/src/cli
git commit -m "feat(mcp-server): cli dispatcher + usage scaffold"
```

---

## Task 7.2: AI client detector

**Goal:** Pure function `detectClients({homeDir, fileExists, platform}) → Array<{id, name, configPath, present}>`. Stable order regardless of which clients are installed. `fileExists` is a pure injected predicate; tests pass a `Set<string>` adapter.

**Detection map** (canonical paths — research confirmed):

| id              | name           | macOS path                                                                  | Linux path                                            | Windows path                                                |
| --------------- | -------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| claude-code     | Claude Code    | `~/.claude.json`                                                            | `~/.claude.json`                                      | `~/.claude.json`                                            |
| claude-desktop  | Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json`           | `~/.config/Claude/claude_desktop_config.json`         | `%APPDATA%\Claude\claude_desktop_config.json`               |
| cursor          | Cursor         | `~/.cursor/mcp.json`                                                        | `~/.cursor/mcp.json`                                  | `%USERPROFILE%\.cursor\mcp.json`                            |
| windsurf        | Windsurf       | `~/.codeium/windsurf/mcp_config.json`                                       | `~/.codeium/windsurf/mcp_config.json`                 | `%USERPROFILE%\.codeium\windsurf\mcp_config.json`           |
| copilot         | VS Code Copilot| `~/Library/Application Support/Code/User/mcp.json`                          | `~/.config/Code/User/mcp.json`                        | `%APPDATA%\Code\User\mcp.json`                              |

> Detector returns the path it would WRITE TO; `present` is `fileExists(path)`. A missing file is fine — setup will create it. Project-scoped Claude Code (`./.mcp.json`) is intentionally NOT detected at user level; setup operates user-globally for v1.

**Files:**

- Create: `apps/mcp-server/src/cli/detect.ts`
- Create: `apps/mcp-server/src/cli/__tests__/detect.test.ts`

**Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { detectClients } from "../detect";

const fakeFs = (present: ReadonlyArray<string>) => {
  const set = new Set(present);
  return (p: string) => set.has(p);
};

describe("detectClients", () => {
  it("returns all clients in stable order on macOS, marking present ones", () => {
    const home = "/Users/me";
    const present = [
      `${home}/.claude.json`,
      `${home}/.cursor/mcp.json`,
    ];
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
      "/home/me/.config/Claude/claude_desktop_config.json",
    );
    expect(r.find((c) => c.id === "copilot")?.configPath).toBe(
      "/home/me/.config/Code/User/mcp.json",
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
      "C:\\Users\\me\\AppData\\Roaming\\Claude\\claude_desktop_config.json",
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
```

**Step 2: Implement** — `apps/mcp-server/src/cli/detect.ts`

```ts
export type Platform = "darwin" | "linux" | "win32";

export interface DetectClientsOptions {
  readonly homeDir: string;
  readonly platform: Platform;
  readonly fileExists: (path: string) => boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface DetectedClient {
  readonly id:
    | "claude-code"
    | "claude-desktop"
    | "cursor"
    | "windsurf"
    | "copilot";
  readonly name: string;
  readonly configPath: string;
  readonly present: boolean;
}

const STABLE_ORDER: ReadonlyArray<DetectedClient["id"]> = [
  "claude-code",
  "claude-desktop",
  "cursor",
  "windsurf",
  "copilot",
];

export function detectClients(options: DetectClientsOptions): DetectedClient[] {
  const paths = resolvePaths(options);
  return STABLE_ORDER.map((id) => ({
    id,
    name: NAMES[id],
    configPath: paths[id],
    present: options.fileExists(paths[id]),
  }));
}

const NAMES: Record<DetectedClient["id"], string> = {
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  windsurf: "Windsurf",
  copilot: "VS Code Copilot",
};

function join(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}

function joinWin(...parts: string[]): string {
  return parts.join("\\").replace(/\\+/g, "\\");
}

function resolvePaths(o: DetectClientsOptions): Record<DetectedClient["id"], string> {
  if (o.platform === "win32") {
    const appData = o.env?.APPDATA ?? joinWin(o.homeDir, "AppData", "Roaming");
    return {
      "claude-code": joinWin(o.homeDir, ".claude.json"),
      "claude-desktop": joinWin(appData, "Claude", "claude_desktop_config.json"),
      cursor: joinWin(o.homeDir, ".cursor", "mcp.json"),
      windsurf: joinWin(o.homeDir, ".codeium", "windsurf", "mcp_config.json"),
      copilot: joinWin(appData, "Code", "User", "mcp.json"),
    };
  }
  if (o.platform === "darwin") {
    return {
      "claude-code": join(o.homeDir, ".claude.json"),
      "claude-desktop": join(o.homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      cursor: join(o.homeDir, ".cursor", "mcp.json"),
      windsurf: join(o.homeDir, ".codeium", "windsurf", "mcp_config.json"),
      copilot: join(o.homeDir, "Library", "Application Support", "Code", "User", "mcp.json"),
    };
  }
  // linux
  return {
    "claude-code": join(o.homeDir, ".claude.json"),
    "claude-desktop": join(o.homeDir, ".config", "Claude", "claude_desktop_config.json"),
    cursor: join(o.homeDir, ".cursor", "mcp.json"),
    windsurf: join(o.homeDir, ".codeium", "windsurf", "mcp_config.json"),
    copilot: join(o.homeDir, ".config", "Code", "User", "mcp.json"),
  };
}
```

**Step 3: Verify, commit**

```bash
bun run --filter @repo/mcp-server test detect
git add apps/mcp-server/src/cli/detect.ts apps/mcp-server/src/cli/__tests__/detect.test.ts
git commit -m "feat(mcp-server): pure AI client detector with platform-specific paths"
```

---

## Task 7.3: Config writer

**Goal:** Pure function `writeConfig({path, mcpServerName, entry, fs}) → {written, prior}`. Reads existing JSON (or empty `{}` if missing), merges/replaces the entry under `mcpServers[name]`, writes atomically (temp + rename), preserves all other keys. Creates missing parent directories.

**Files:**

- Create: `apps/mcp-server/src/cli/config-writer.ts`
- Create: `apps/mcp-server/src/cli/__tests__/config-writer.test.ts`

**Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { writeConfig, type FsAdapter } from "../config-writer";

class MemoryFs implements FsAdapter {
  files = new Map<string, string>();
  dirs = new Set<string>();

  async readFile(path: string): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) {
      const err = new Error(`ENOENT ${path}`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }
    return v;
  }
  async writeFile(path: string, data: string): Promise<void> {
    this.files.set(path, data);
  }
  async rename(from: string, to: string): Promise<void> {
    const v = this.files.get(from);
    if (v === undefined) throw new Error("missing");
    this.files.set(to, v);
    this.files.delete(from);
  }
  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }
}

const ENTRY = { command: "npx", args: ["@scope/figma-mcp"] };

describe("writeConfig", () => {
  it("creates the file when missing", async () => {
    const fs = new MemoryFs();
    const result = await writeConfig({
      path: "/cfg/mcp.json",
      mcpServerName: "figma",
      entry: ENTRY,
      fs,
    });
    expect(result.written).toBe(true);
    expect(result.prior).toBeNull();
    expect(JSON.parse(fs.files.get("/cfg/mcp.json")!)).toEqual({
      mcpServers: { figma: ENTRY },
    });
  });

  it("preserves sibling mcpServers entries", async () => {
    const fs = new MemoryFs();
    fs.files.set(
      "/cfg/mcp.json",
      JSON.stringify({ mcpServers: { other: { command: "x" } } }),
    );
    await writeConfig({
      path: "/cfg/mcp.json",
      mcpServerName: "figma",
      entry: ENTRY,
      fs,
    });
    const after = JSON.parse(fs.files.get("/cfg/mcp.json")!);
    expect(after.mcpServers.other).toEqual({ command: "x" });
    expect(after.mcpServers.figma).toEqual(ENTRY);
  });

  it("preserves top-level non-mcpServers keys", async () => {
    const fs = new MemoryFs();
    fs.files.set(
      "/cfg/mcp.json",
      JSON.stringify({ theme: "dark", mcpServers: {} }),
    );
    await writeConfig({
      path: "/cfg/mcp.json",
      mcpServerName: "figma",
      entry: ENTRY,
      fs,
    });
    expect(JSON.parse(fs.files.get("/cfg/mcp.json")!).theme).toBe("dark");
  });

  it("is idempotent: rewriting the same entry returns prior=existing", async () => {
    const fs = new MemoryFs();
    await writeConfig({ path: "/cfg/mcp.json", mcpServerName: "figma", entry: ENTRY, fs });
    const second = await writeConfig({
      path: "/cfg/mcp.json",
      mcpServerName: "figma",
      entry: ENTRY,
      fs,
    });
    expect(second.prior).toEqual(ENTRY);
    expect(second.written).toBe(true);
  });

  it("creates the parent directory if missing", async () => {
    const fs = new MemoryFs();
    await writeConfig({
      path: "/deep/nested/cfg/mcp.json",
      mcpServerName: "figma",
      entry: ENTRY,
      fs,
    });
    expect(fs.dirs.has("/deep/nested/cfg")).toBe(true);
  });

  it("writes via temp + rename (atomic)", async () => {
    const fs = new MemoryFs();
    let renameCalled = false;
    const wrapped: FsAdapter = {
      ...fs,
      readFile: fs.readFile.bind(fs),
      writeFile: fs.writeFile.bind(fs),
      mkdir: fs.mkdir.bind(fs),
      async rename(from, to) {
        renameCalled = true;
        return fs.rename(from, to);
      },
    };
    await writeConfig({
      path: "/cfg/mcp.json",
      mcpServerName: "figma",
      entry: ENTRY,
      fs: wrapped,
    });
    expect(renameCalled).toBe(true);
  });
});
```

**Step 2: Implement** — `apps/mcp-server/src/cli/config-writer.ts`

```ts
export interface FsAdapter {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export interface McpServerEntry {
  readonly command?: string;
  readonly args?: ReadonlyArray<string>;
  readonly type?: "stdio" | "http";
  readonly url?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export interface WriteConfigOptions {
  readonly path: string;
  readonly mcpServerName: string;
  readonly entry: McpServerEntry;
  readonly fs: FsAdapter;
}

export interface WriteConfigResult {
  readonly written: boolean;
  readonly prior: McpServerEntry | null;
}

export async function writeConfig(options: WriteConfigOptions): Promise<WriteConfigResult> {
  const existing = await readJsonOrEmpty(options.fs, options.path);
  const mcpServers: Record<string, McpServerEntry> = {
    ...(existing.mcpServers ?? {}),
  };
  const prior = mcpServers[options.mcpServerName] ?? null;
  mcpServers[options.mcpServerName] = options.entry;
  const next = { ...existing, mcpServers };

  const dir = options.path.replace(/[\\/][^\\/]+$/, "");
  if (dir) await options.fs.mkdir(dir);

  const tmp = `${options.path}.tmp`;
  await options.fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`);
  await options.fs.rename(tmp, options.path);

  return { written: true, prior };
}

async function readJsonOrEmpty(
  fs: FsAdapter,
  path: string,
): Promise<{ mcpServers?: Record<string, McpServerEntry>; [k: string]: unknown }> {
  try {
    const raw = await fs.readFile(path);
    return JSON.parse(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}
```

> Atomic write semantics: temp file in the same directory + rename. POSIX rename is atomic on the same filesystem; Windows is best-effort (the rename can fail if the target is open, but that's a foot-gun the user controls).

**Step 3: Verify, commit**

```bash
bun run --filter @repo/mcp-server test config-writer
git add apps/mcp-server/src/cli/config-writer.ts apps/mcp-server/src/cli/__tests__/config-writer.test.ts
git commit -m "feat(mcp-server): atomic config writer that preserves siblings"
```

---

## Task 7.4: `figma-mcp setup` orchestration

**Goal:** `runSetup({clients, writeConfig, dryRun, clientFilter, entry, log}) → SetupReport`. Iterates the detected clients, optionally filters by `--client`, calls `writeConfig` per client (or skips on `--dry-run`), and accumulates a report. Output is a table when `dryRun`/normal; the entry written to all local-mode clients is `{command: "npx", args: ["-y", "@scope/figma-mcp"]}`.

**Files:**

- Create: `apps/mcp-server/src/cli/setup.ts`
- Create: `apps/mcp-server/src/cli/__tests__/setup.test.ts`

**Step 1: Failing tests**

```ts
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
```

**Step 2: Implement** — `apps/mcp-server/src/cli/setup.ts`

```ts
import type { DetectedClient } from "./detect";
import type { McpServerEntry, WriteConfigResult } from "./config-writer";

export type SetupAction = "created" | "updated" | "would-write" | "skipped" | "not-detected";

export interface SetupActionRecord {
  readonly id: string;
  readonly action: SetupAction;
  readonly path: string | null;
}

export interface SetupReport {
  readonly actions: ReadonlyArray<SetupActionRecord>;
}

export interface RunSetupOptions {
  readonly clients: ReadonlyArray<DetectedClient>;
  readonly entry: McpServerEntry;
  readonly mcpServerName: string;
  readonly writeConfig: (args: {
    path: string;
    mcpServerName: string;
    entry: McpServerEntry;
  }) => Promise<WriteConfigResult>;
  readonly dryRun: boolean;
  readonly clientFilter: string | null;
}

export async function runSetup(options: RunSetupOptions): Promise<SetupReport> {
  const targets = options.clientFilter
    ? options.clients.filter((c) => c.id === options.clientFilter)
    : options.clients;

  if (options.clientFilter && targets.length === 0) {
    return {
      actions: [{ id: options.clientFilter, action: "not-detected", path: null }],
    };
  }

  const actions: SetupActionRecord[] = [];
  for (const client of targets) {
    if (options.dryRun) {
      actions.push({ id: client.id, action: "would-write", path: client.configPath });
      continue;
    }
    const result = await options.writeConfig({
      path: client.configPath,
      mcpServerName: options.mcpServerName,
      entry: options.entry,
    });
    actions.push({
      id: client.id,
      action: result.prior ? "updated" : "created",
      path: client.configPath,
    });
  }
  return { actions };
}

export function formatSetupTable(report: SetupReport): string {
  const rows = report.actions.map(
    (a) => `  ${a.id.padEnd(16)} ${a.action.padEnd(14)} ${a.path ?? "-"}`,
  );
  return ["Client            Action         Path", ...rows].join("\n");
}
```

**Step 3: Verify, commit**

```bash
bun run --filter @repo/mcp-server test setup
git add apps/mcp-server/src/cli/setup.ts apps/mcp-server/src/cli/__tests__/setup.test.ts
git commit -m "feat(mcp-server): setup orchestration with --dry-run and --client filter"
```

---

## Task 7.5: `setup --cloud`

**Goal:** When `--cloud` is set, hit `POST {relayUrl}/pair`, get `{code, sessionId, expiresAt}`, print the 6-digit code in a banner with TTL, and write Streamable HTTP entries to AI client configs pointing at `{relayUrl}/mcp/{sessionId}`. Inject `fetch` for tests.

**Files:**

- Create: `apps/mcp-server/src/cli/setup-cloud.ts`
- Create: `apps/mcp-server/src/cli/__tests__/setup-cloud.test.ts`

**Step 1: Failing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { pairWithRelay, formatPairBanner, cloudEntry } from "../setup-cloud";

describe("pairWithRelay", () => {
  it("POSTs to {relayUrl}/pair and returns the JSON body", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: "123456",
        sessionId: "ses_abc",
        expiresAt: 1_700_000_300_000,
      }),
    });
    const result = await pairWithRelay({
      relayUrl: "https://r.example",
      fetchFn: fetchFn as never,
    });
    expect(fetchFn).toHaveBeenCalledWith("https://r.example/pair", {
      method: "POST",
    });
    expect(result).toEqual({
      code: "123456",
      sessionId: "ses_abc",
      expiresAt: 1_700_000_300_000,
    });
  });

  it("throws when relay returns non-2xx", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: async () => "down" });
    await expect(
      pairWithRelay({ relayUrl: "https://r.example", fetchFn: fetchFn as never }),
    ).rejects.toThrow(/E_RELAY/);
  });
});

describe("formatPairBanner", () => {
  it("includes the 6-digit code and TTL", () => {
    const banner = formatPairBanner({
      code: "123456",
      expiresAt: 1_700_000_300_000,
      now: 1_700_000_000_000,
    });
    expect(banner).toContain("123456");
    expect(banner).toMatch(/expires in 5m/);
  });
});

describe("cloudEntry", () => {
  it("returns a Streamable HTTP MCP entry", () => {
    const entry = cloudEntry({
      relayUrl: "https://r.example",
      sessionId: "ses_abc",
    });
    expect(entry.type).toBe("http");
    expect(entry.url).toBe("https://r.example/mcp/ses_abc");
  });
});
```

**Step 2: Implement** — `apps/mcp-server/src/cli/setup-cloud.ts`

```ts
import type { McpServerEntry } from "./config-writer";

export interface PairResult {
  readonly code: string;
  readonly sessionId: string;
  readonly expiresAt: number;
}

export interface PairWithRelayOptions {
  readonly relayUrl: string;
  readonly fetchFn: typeof fetch;
}

export async function pairWithRelay(options: PairWithRelayOptions): Promise<PairResult> {
  const resp = await options.fetchFn(`${options.relayUrl}/pair`, { method: "POST" });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`E_RELAY_PAIR_FAILED: ${resp.status} ${detail}`);
  }
  return (await resp.json()) as PairResult;
}

export interface FormatPairBannerOptions {
  readonly code: string;
  readonly expiresAt: number;
  readonly now?: number;
}

export function formatPairBanner(options: FormatPairBannerOptions): string {
  const now = options.now ?? Date.now();
  const ttlMs = Math.max(0, options.expiresAt - now);
  const minutes = Math.floor(ttlMs / 60_000);
  const seconds = Math.floor((ttlMs % 60_000) / 1_000);
  const ttl = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  return [
    "",
    "  ┌────────────────────────────────────────┐",
    `  │  Pairing code: ${options.code}                    │`,
    `  │  expires in ${ttl.padEnd(20)}      │`,
    "  └────────────────────────────────────────┘",
    "",
    "  Open the Figma plugin and enter this code to pair.",
    "",
  ].join("\n");
}

export interface CloudEntryOptions {
  readonly relayUrl: string;
  readonly sessionId: string;
}

export function cloudEntry(options: CloudEntryOptions): McpServerEntry {
  return {
    type: "http",
    url: `${options.relayUrl}/mcp/${options.sessionId}`,
  };
}

export const DEFAULT_RELAY_URL = "https://figma-mcp-relay.bromso.workers.dev";
```

> The relay URL default is a placeholder; Phase 9 pins the production domain.

**Step 3: Verify, commit**

```bash
bun run --filter @repo/mcp-server test setup-cloud
git add apps/mcp-server/src/cli/setup-cloud.ts apps/mcp-server/src/cli/__tests__/setup-cloud.test.ts
git commit -m "feat(mcp-server): setup --cloud pairs with relay and emits Streamable HTTP entry"
```

---

## Task 7.6: `--print-path` + dist asset wiring

**Goal:** `figma-mcp --print-path` prints the absolute path to the bundled bridge-plugin `manifest.json` and exits 0. Resolution uses `fileURLToPath(new URL("./plugin/manifest.json", import.meta.url))` from the bundled `dist/main.js`.

The bridge plugin builds to `apps/bridge-plugin/dist/manifest.json`. To make `--print-path` work in production we copy that asset into `apps/mcp-server/dist/plugin/`. We add a Turbo task `copy-plugin-assets` to the mcp-server build pipeline.

**Files:**

- Create: `apps/mcp-server/src/cli/print-path.ts`
- Create: `apps/mcp-server/src/cli/__tests__/print-path.test.ts`
- Create: `apps/mcp-server/scripts/copy-plugin-assets.mjs`
- Modify: `apps/mcp-server/package.json` (add `build` + `copy-plugin-assets` scripts; add `@repo/bridge-plugin` to devDeps if not already)
- Modify: `turbo.json` (the new `build` task on `@repo/mcp-server` `dependsOn` `^build`)

**Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { resolveManifestPath } from "../print-path";

describe("resolveManifestPath", () => {
  it("resolves relative to import.meta.url", () => {
    const stubbedMetaUrl = "file:///opt/figma-mcp/dist/main.js";
    const result = resolveManifestPath({ metaUrl: stubbedMetaUrl });
    expect(result).toBe("/opt/figma-mcp/dist/plugin/manifest.json");
  });

  it("works with file URLs containing spaces", () => {
    const stubbedMetaUrl = "file:///Users/me/dir%20with%20space/dist/main.js";
    const result = resolveManifestPath({ metaUrl: stubbedMetaUrl });
    expect(result).toBe("/Users/me/dir with space/dist/plugin/manifest.json");
  });
});
```

**Step 2: Implement** — `apps/mcp-server/src/cli/print-path.ts`

```ts
import { fileURLToPath } from "node:url";

export interface ResolveManifestPathOptions {
  readonly metaUrl: string;
}

export function resolveManifestPath(options: ResolveManifestPathOptions): string {
  return fileURLToPath(new URL("./plugin/manifest.json", options.metaUrl));
}
```

**Step 3: Asset copy script** — `apps/mcp-server/scripts/copy-plugin-assets.mjs`

```js
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "..", "bridge-plugin", "dist", "manifest.json");
const dest = resolve(here, "..", "dist", "plugin", "manifest.json");

await mkdir(dirname(dest), { recursive: true });
await copyFile(src, dest);
console.log(`copied ${src} -> ${dest}`);
```

**Step 4: package.json**

Add scripts:

```json
"build": "tsc -p tsconfig.build.json && node scripts/copy-plugin-assets.mjs",
"copy-plugin-assets": "node scripts/copy-plugin-assets.mjs"
```

> If `tsconfig.build.json` doesn't exist, this task creates a minimal one with `outDir: "dist"` and `noEmit: false`. Otherwise the existing build passes through.

**Step 5: turbo.json** — declare the build pipeline so `@repo/bridge-plugin#build` runs before `@repo/mcp-server#build`. The existing `^build` dependency in turbo's default pipeline already handles this once both packages declare a `build` task.

**Step 6: Smoke verification**

```bash
bun run --filter @repo/bridge-plugin build
bun run --filter @repo/mcp-server build
node apps/mcp-server/dist/main.js --print-path
# Should print an absolute path; verify with:
ls -la "$(node apps/mcp-server/dist/main.js --print-path)"
```

> If the `dist/main.js` ESM resolution + asset copy is too invasive for this phase (e.g., tsc emit lands in a different layout), fall back to: keep the unit test passing, add a TODO in `print-path.ts`, and defer the asset copy to Phase 9. Document the deferment in the changeset.

**Step 7: Commit**

```bash
git add apps/mcp-server/src/cli/print-path.ts apps/mcp-server/src/cli/__tests__/print-path.test.ts apps/mcp-server/scripts/copy-plugin-assets.mjs apps/mcp-server/package.json turbo.json apps/mcp-server/tsconfig.build.json
git commit -m "feat(mcp-server): --print-path resolves bundled bridge-plugin manifest"
```

---

## Task 7.7: `setup --open-figma`

**Goal:** Open the OS file picker pre-positioned at the manifest path. Pure logic in `buildOpenCommand({platform, path}) → {cmd, args}`; `runOpenFigma` calls it and spawns. Inject `spawnFn` for tests.

| platform | command    | argv                            |
| -------- | ---------- | ------------------------------- |
| darwin   | `open`     | `["-R", path]`                  |
| linux    | `xdg-open` | `[dirname(path)]`               |
| win32    | `explorer` | `[`/select,${path}`]`           |

**Files:**

- Create: `apps/mcp-server/src/cli/open-figma.ts`
- Create: `apps/mcp-server/src/cli/__tests__/open-figma.test.ts`

**Step 1: Failing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildOpenCommand, runOpenFigma } from "../open-figma";

describe("buildOpenCommand", () => {
  it.each([
    ["darwin", "/m/manifest.json", { cmd: "open", args: ["-R", "/m/manifest.json"] }],
    ["linux", "/m/manifest.json", { cmd: "xdg-open", args: ["/m"] }],
    [
      "win32",
      "C:\\m\\manifest.json",
      { cmd: "explorer", args: ["/select,C:\\m\\manifest.json"] },
    ],
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
```

**Step 2: Implement** — `apps/mcp-server/src/cli/open-figma.ts`

```ts
import type { ChildProcess } from "node:child_process";
import type { Platform } from "./detect";

export interface BuildOpenCommandOptions {
  readonly platform: Platform;
  readonly path: string;
}

export interface OpenCommand {
  readonly cmd: string;
  readonly args: ReadonlyArray<string>;
}

export function buildOpenCommand(options: BuildOpenCommandOptions): OpenCommand {
  if (options.platform === "darwin") {
    return { cmd: "open", args: ["-R", options.path] };
  }
  if (options.platform === "win32") {
    return { cmd: "explorer", args: [`/select,${options.path}`] };
  }
  // linux
  const dir = options.path.replace(/[\\/][^\\/]+$/, "");
  return { cmd: "xdg-open", args: [dir] };
}

export interface RunOpenFigmaOptions extends BuildOpenCommandOptions {
  readonly spawnFn: (cmd: string, args: readonly string[], options: { detached: true; stdio: "ignore" }) => ChildProcess;
}

export function runOpenFigma(options: RunOpenFigmaOptions): void {
  const { cmd, args } = buildOpenCommand(options);
  const child = options.spawnFn(cmd, args, { detached: true, stdio: "ignore" });
  child.unref?.();
}
```

**Step 3: Verify, commit**

```bash
bun run --filter @repo/mcp-server test open-figma
git add apps/mcp-server/src/cli/open-figma.ts apps/mcp-server/src/cli/__tests__/open-figma.test.ts
git commit -m "feat(mcp-server): setup --open-figma reveals manifest in OS file picker"
```

---

## Task 7.8: `figma-mcp doctor`

**Goal:** Run a set of checks in parallel, each `{name, run() → Promise<{status, detail}>}`. Status is `"ok" | "warn" | "error"`. `runDoctor({checks}) → DoctorReport`. CLI entrypoint formats the report (colored by default, JSON with `--json`).

**Initial check set:**

| name                      | what it verifies                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `daemon-liveness`         | `LockfileManager.readActive()` returns a record (lockfile present + PID alive).                 |
| `lockfile-staleness`      | If `read()` returns a record but `readActive()` does not → warn that a stale entry was cleaned. |
| `plugin-pairing`          | Connect to daemon socket, send `bridge_status` request, report `pluginState.connected`.         |
| `ai-client-configs`       | For each detected client, JSON-parse + assert `mcpServers.figma` exists.                        |
| `recent-errors`           | Tail `~/.figma-mcp/daemon.log` (last 50 lines); report any `level=error` entries.               |

**Files:**

- Create: `apps/mcp-server/src/cli/doctor.ts`
- Create: `apps/mcp-server/src/cli/checks/daemon-liveness.ts`
- Create: `apps/mcp-server/src/cli/checks/plugin-pairing.ts`
- Create: `apps/mcp-server/src/cli/checks/ai-client-configs.ts`
- Create: `apps/mcp-server/src/cli/checks/recent-errors.ts`
- Create: `apps/mcp-server/src/cli/__tests__/doctor.test.ts`
- Create: `apps/mcp-server/src/cli/__tests__/checks.test.ts`

**Step 1: Failing tests** — `doctor.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { formatDoctorJson, formatDoctorText, runDoctor } from "../doctor";

describe("runDoctor", () => {
  it("runs all checks in parallel and aggregates results", async () => {
    const checks = [
      { name: "a", run: async () => ({ status: "ok" as const, detail: "fine" }) },
      { name: "b", run: async () => ({ status: "warn" as const, detail: "meh" }) },
      { name: "c", run: async () => ({ status: "error" as const, detail: "bad" }) },
    ];
    const report = await runDoctor({ checks });
    expect(report.results).toHaveLength(3);
    expect(report.summary).toEqual({ ok: 1, warn: 1, error: 1 });
  });

  it("captures thrown errors as error status", async () => {
    const checks = [
      {
        name: "boom",
        run: async () => {
          throw new Error("kaboom");
        },
      },
    ];
    const report = await runDoctor({ checks });
    expect(report.results[0].status).toBe("error");
    expect(report.results[0].detail).toMatch(/kaboom/);
  });
});

describe("formatDoctorJson", () => {
  it("emits a stable JSON shape", () => {
    const report = {
      summary: { ok: 1, warn: 0, error: 0 },
      results: [{ name: "x", status: "ok" as const, detail: "ok" }],
    };
    const json = JSON.parse(formatDoctorJson(report));
    expect(json).toEqual(report);
  });
});

describe("formatDoctorText", () => {
  it("includes a status glyph per check", () => {
    const text = formatDoctorText({
      summary: { ok: 1, warn: 1, error: 1 },
      results: [
        { name: "a", status: "ok", detail: "fine" },
        { name: "b", status: "warn", detail: "meh" },
        { name: "c", status: "error", detail: "bad" },
      ],
    });
    expect(text).toMatch(/✓.*a/);
    expect(text).toMatch(/!.*b/);
    expect(text).toMatch(/✗.*c/);
  });
});
```

**Step 2: Implement** — `apps/mcp-server/src/cli/doctor.ts`

```ts
export type CheckStatus = "ok" | "warn" | "error";

export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface Check {
  readonly name: string;
  readonly run: () => Promise<{ status: CheckStatus; detail: string }>;
}

export interface DoctorReport {
  readonly summary: { ok: number; warn: number; error: number };
  readonly results: ReadonlyArray<CheckResult>;
}

export interface RunDoctorOptions {
  readonly checks: ReadonlyArray<Check>;
}

export async function runDoctor(options: RunDoctorOptions): Promise<DoctorReport> {
  const results: CheckResult[] = await Promise.all(
    options.checks.map(async (c): Promise<CheckResult> => {
      try {
        const r = await c.run();
        return { name: c.name, status: r.status, detail: r.detail };
      } catch (err) {
        return { name: c.name, status: "error", detail: String(err instanceof Error ? err.message : err) };
      }
    }),
  );
  return {
    summary: results.reduce(
      (acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }),
      { ok: 0, warn: 0, error: 0 },
    ),
    results,
  };
}

export function formatDoctorJson(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatDoctorText(report: DoctorReport): string {
  const glyph = (s: CheckStatus) => (s === "ok" ? "✓" : s === "warn" ? "!" : "✗");
  const lines = report.results.map((r) => `  ${glyph(r.status)} ${r.name.padEnd(24)} ${r.detail}`);
  const summary = `\nSummary: ${report.summary.ok} ok, ${report.summary.warn} warn, ${report.summary.error} error`;
  return `${lines.join("\n")}${summary}`;
}
```

**Step 3: Implement individual checks**

`checks/daemon-liveness.ts`:

```ts
import type { LockfileManager } from "../../daemon/lockfile";
import type { Check } from "../doctor";

export const createDaemonLivenessCheck = (lockfile: LockfileManager): Check => ({
  name: "daemon-liveness",
  async run() {
    const active = await lockfile.readActive();
    if (active) {
      return { status: "ok" as const, detail: `pid=${active.pid} version=${active.version}` };
    }
    const stale = await lockfile.read();
    if (stale) {
      return { status: "error" as const, detail: `stale lockfile (pid=${stale.pid} not alive)` };
    }
    return { status: "warn" as const, detail: "no daemon running" };
  },
});
```

`checks/plugin-pairing.ts`:

```ts
import type { Check } from "../doctor";

export interface PluginPairingProbe {
  request(method: "bridge_status"): Promise<{ pluginState?: { connected?: boolean } }>;
}

export const createPluginPairingCheck = (probe: () => Promise<PluginPairingProbe>): Check => ({
  name: "plugin-pairing",
  async run() {
    let p: PluginPairingProbe;
    try {
      p = await probe();
    } catch (err) {
      return { status: "error" as const, detail: `daemon unreachable: ${err}` };
    }
    const r = await p.request("bridge_status");
    if (r.pluginState?.connected) {
      return { status: "ok" as const, detail: "plugin paired" };
    }
    return { status: "warn" as const, detail: "plugin not paired" };
  },
});
```

`checks/ai-client-configs.ts`:

```ts
import type { DetectedClient } from "../detect";
import type { Check } from "../doctor";

export const createAiClientConfigsCheck = (
  clients: ReadonlyArray<DetectedClient>,
  readFile: (path: string) => Promise<string>,
): Check => ({
  name: "ai-client-configs",
  async run() {
    const probs: string[] = [];
    for (const c of clients) {
      if (!c.present) continue;
      try {
        const raw = await readFile(c.configPath);
        const json = JSON.parse(raw);
        if (!json?.mcpServers?.figma) {
          probs.push(`${c.id}: missing mcpServers.figma`);
        }
      } catch (err) {
        probs.push(`${c.id}: ${err}`);
      }
    }
    if (probs.length === 0) {
      return { status: "ok" as const, detail: "all configured clients valid" };
    }
    return { status: "warn" as const, detail: probs.join("; ") };
  },
});
```

`checks/recent-errors.ts`:

```ts
import type { Check } from "../doctor";

export const createRecentErrorsCheck = (
  logPath: string,
  readFile: (path: string) => Promise<string>,
): Check => ({
  name: "recent-errors",
  async run() {
    let raw: string;
    try {
      raw = await readFile(logPath);
    } catch {
      return { status: "ok" as const, detail: "no daemon log present" };
    }
    const lines = raw.split("\n").slice(-50);
    const errors = lines.filter((l) => l.includes('"level":"error"'));
    if (errors.length === 0) {
      return { status: "ok" as const, detail: "no recent errors" };
    }
    return {
      status: "warn" as const,
      detail: `${errors.length} recent error(s); last: ${errors[errors.length - 1].slice(0, 200)}`,
    };
  },
});
```

**Step 4: Tests for the checks** — `__tests__/checks.test.ts` covers each helper with table-driven cases (lockfile present/active/stale, probe throws/returns paired-or-not, configs missing/present/malformed, log absent/present/with-errors).

**Step 5: Verify, commit**

```bash
bun run --filter @repo/mcp-server test doctor checks
git add apps/mcp-server/src/cli/doctor.ts apps/mcp-server/src/cli/checks apps/mcp-server/src/cli/__tests__/doctor.test.ts apps/mcp-server/src/cli/__tests__/checks.test.ts
git commit -m "feat(mcp-server): doctor runs parallel checks (daemon, pairing, configs, errors)"
```

---

## Task 7.9: `doctor` socket/port-conflict check

**Goal:** Verify the daemon socket can be connected to. If a foreign listener is bound to the same path (PID in lockfile differs from the one accepting connections, or no lockfile but the path exists and accepts), status: error with `E_PORT_CONFLICT`. Cross-platform via `pickIpcTransport` selector (Task 7.10's selector is consumed here too — order tasks accordingly during execution).

**Files:**

- Create: `apps/mcp-server/src/cli/checks/socket-conflict.ts`
- Create: `apps/mcp-server/src/cli/__tests__/socket-conflict.test.ts`

**Step 1: Failing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { createSocketConflictCheck } from "../checks/socket-conflict";

describe("socket-conflict", () => {
  it("ok when socket connects and lockfile pid matches", async () => {
    const check = createSocketConflictCheck({
      socketPath: "/tmp/x.sock",
      probeConnect: vi.fn().mockResolvedValue({ ok: true }),
      lockfileActive: vi.fn().mockResolvedValue({ pid: 1234 }),
    });
    const r = await check.run();
    expect(r.status).toBe("ok");
  });

  it("error when path accepts but lockfile is missing", async () => {
    const check = createSocketConflictCheck({
      socketPath: "/tmp/x.sock",
      probeConnect: vi.fn().mockResolvedValue({ ok: true }),
      lockfileActive: vi.fn().mockResolvedValue(null),
    });
    const r = await check.run();
    expect(r.status).toBe("error");
    expect(r.detail).toContain("E_PORT_CONFLICT");
  });

  it("ok when path is unbound (no daemon)", async () => {
    const check = createSocketConflictCheck({
      socketPath: "/tmp/x.sock",
      probeConnect: vi.fn().mockResolvedValue({ ok: false, code: "ENOENT" }),
      lockfileActive: vi.fn().mockResolvedValue(null),
    });
    const r = await check.run();
    expect(r.status).toBe("ok");
  });
});
```

**Step 2: Implement** — `apps/mcp-server/src/cli/checks/socket-conflict.ts`

```ts
import type { Check } from "../doctor";

export interface SocketConflictOptions {
  readonly socketPath: string;
  readonly probeConnect: () => Promise<{ ok: boolean; code?: string }>;
  readonly lockfileActive: () => Promise<{ pid: number } | null>;
}

export const createSocketConflictCheck = (opts: SocketConflictOptions): Check => ({
  name: "socket-conflict",
  async run() {
    const probe = await opts.probeConnect();
    if (!probe.ok) {
      return { status: "ok" as const, detail: "socket path unbound" };
    }
    const active = await opts.lockfileActive();
    if (!active) {
      return {
        status: "error" as const,
        detail: `E_PORT_CONFLICT: ${opts.socketPath} accepts connections but no daemon lockfile`,
      };
    }
    return { status: "ok" as const, detail: `socket bound to pid=${active.pid}` };
  },
});
```

**Step 3: Production wiring** — in `doctor`'s composition (Task 7.11), `probeConnect` calls `pickIpcTransport(platform).clientConnect({path})` and resolves `{ok: true}` on success or `{ok: false, code: err.code}` on `ENOENT`/`ECONNREFUSED`.

**Step 4: Commit**

```bash
bun run --filter @repo/mcp-server test socket-conflict
git add apps/mcp-server/src/cli/checks/socket-conflict.ts apps/mcp-server/src/cli/__tests__/socket-conflict.test.ts
git commit -m "feat(mcp-server): doctor socket/port-conflict check"
```

---

## Task 7.10: Windows named-pipe transport + `pickIpcTransport`

**Goal:** Mirror `unix-socket-{server,client}.ts` with `named-pipe-{server,client}.ts`. Both use `node:net`; on Windows `createServer().listen(pipePath)` and `createConnection({path: pipePath})` work natively when the path matches `\\.\pipe\<name>`. Add a `pickIpcTransport(platform)` selector that returns the right pair.

> The unix-socket transports already exist (`packages/transport/src/unix-socket-{server,client}.ts`). This task adds the named-pipe variants and the selector — no changes to existing code beyond exports.

**Files:**

- Create: `packages/transport/src/named-pipe-server.ts`
- Create: `packages/transport/src/named-pipe-client.ts`
- Create: `packages/transport/src/pick-ipc-transport.ts`
- Create: `packages/transport/src/__tests__/named-pipe.test.ts`
- Create: `packages/transport/src/__tests__/pick-ipc-transport.test.ts`
- Modify: `packages/transport/src/index.ts` (re-export new modules)

**Step 1: Implement named-pipe transports** — these are byte-for-byte copies of the unix-socket transports with `path` semantics:

```ts
// packages/transport/src/named-pipe-server.ts
// Re-uses node:net `createServer().listen(pipePath)` — Node accepts
// `\\.\pipe\<name>` natively on win32 and falls back to a Unix socket
// on other platforms (which is why we still need pick-ipc-transport).
export { UnixSocketServerTransport as NamedPipeServerTransport } from "./unix-socket-server";
```

```ts
// packages/transport/src/named-pipe-client.ts
export { UnixSocketClientTransport as NamedPipeClientTransport } from "./unix-socket-client";
```

> **Honesty note:** On Node, `net.createServer().listen("\\\\.\\pipe\\foo")` and `net.createConnection({path: "\\\\.\\pipe\\foo"})` work without any code changes — Windows treats pipe paths the same as Unix socket paths via libuv. The "named pipe transport" is the same code with a different path naming convention. Re-exporting under aliases makes the Phase 7 design intent explicit while keeping the implementation honest. If a future need arises (e.g., true Windows-only `\\?\pipe\` semantics), this is the seam to specialize.

**Step 2: `pickIpcTransport`** — `packages/transport/src/pick-ipc-transport.ts`

```ts
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { UnixSocketClientTransport } from "./unix-socket-client";
import { UnixSocketServerTransport } from "./unix-socket-server";

export type IpcPlatform = "darwin" | "linux" | "win32";

export interface IpcTransportPair {
  readonly socketPath: string;
  readonly Client: typeof UnixSocketClientTransport;
  readonly Server: typeof UnixSocketServerTransport;
}

export interface PickIpcTransportOptions {
  readonly platform: IpcPlatform;
  readonly homeDir?: string;
  readonly username?: string;
}

export function pickIpcTransport(options: PickIpcTransportOptions): IpcTransportPair {
  const home = options.homeDir ?? homedir();
  const user = options.username ?? userInfo().username;
  const socketPath =
    options.platform === "win32"
      ? `\\\\.\\pipe\\figma-mcp-${user}`
      : join(home, ".figma-mcp", "daemon.sock");
  return {
    socketPath,
    Client: UnixSocketClientTransport,
    Server: UnixSocketServerTransport,
  };
}
```

**Step 3: Tests** — `pick-ipc-transport.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { pickIpcTransport } from "../pick-ipc-transport";

describe("pickIpcTransport", () => {
  it("returns a Unix socket path on darwin", () => {
    const r = pickIpcTransport({ platform: "darwin", homeDir: "/Users/me" });
    expect(r.socketPath).toBe("/Users/me/.figma-mcp/daemon.sock");
  });

  it("returns a named-pipe path on win32", () => {
    const r = pickIpcTransport({ platform: "win32", username: "alice" });
    expect(r.socketPath).toBe("\\\\.\\pipe\\figma-mcp-alice");
  });

  it("returns Unix path on linux", () => {
    const r = pickIpcTransport({ platform: "linux", homeDir: "/home/me" });
    expect(r.socketPath).toBe("/home/me/.figma-mcp/daemon.sock");
  });
});
```

The `named-pipe.test.ts` does a roundtrip server/client message exchange on a Unix path (which is what CI exercises) and asserts the API surface; the Windows path is exercised only in unit selector tests.

**Step 4: Re-export from index** — `packages/transport/src/index.ts`

```ts
export type { IpcPlatform, IpcTransportPair, PickIpcTransportOptions } from "./pick-ipc-transport";
export { pickIpcTransport } from "./pick-ipc-transport";
export { NamedPipeServerTransport } from "./named-pipe-server";
export { NamedPipeClientTransport } from "./named-pipe-client";
```

**Step 5: Verify, commit**

```bash
bun run --filter @repo/transport test pick-ipc-transport named-pipe
git add packages/transport/src/named-pipe-server.ts packages/transport/src/named-pipe-client.ts packages/transport/src/pick-ipc-transport.ts packages/transport/src/__tests__/named-pipe.test.ts packages/transport/src/__tests__/pick-ipc-transport.test.ts packages/transport/src/index.ts
git commit -m "feat(transport): add pickIpcTransport selector + named-pipe aliases for win32"
```

---

## Task 7.11: Wire CLI into `main.ts` + E2E spawn tests

**Goal:** `main.ts` calls `dispatch(process.argv)` first. `runtime` falls through to the existing `resolveStartup` flow (untouched). Other commands run their handler and exit. Add E2E spawn tests that drive the binary end-to-end.

**Files:**

- Modify: `apps/mcp-server/src/main.ts`
- Create: `apps/mcp-server/src/__tests__/cli-spawn.test.ts`

**Step 1: Failing tests** — `apps/mcp-server/src/__tests__/cli-spawn.test.ts`

```ts
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const main = join(here, "..", "main.ts");

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "cli-spawn-"));
});

describe("cli spawn", () => {
  it("--help prints usage and exits 0", () => {
    const r = spawnSync("bun", ["run", main, "--help"], { encoding: "utf-8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage:/);
    expect(r.stdout).toMatch(/setup/);
    expect(r.stdout).toMatch(/doctor/);
  });

  it("setup --dry-run prints a table without writing", () => {
    const r = spawnSync("bun", ["run", main, "setup", "--dry-run"], {
      encoding: "utf-8",
      env: { ...process.env, HOME: tmp },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Client/);
    expect(r.stdout).toMatch(/would-write/);
  });

  it("doctor --json against a stopped daemon emits a JSON shape with daemon-down", () => {
    const r = spawnSync("bun", ["run", main, "doctor", "--json"], {
      encoding: "utf-8",
      env: { ...process.env, HOME: tmp },
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toHaveProperty("results");
    const daemon = parsed.results.find((c: { name: string }) => c.name === "daemon-liveness");
    expect(daemon.status).not.toBe("ok");
  });

  it("--print-path prints a path string and exits 0", () => {
    const r = spawnSync("bun", ["run", main, "--print-path"], { encoding: "utf-8" });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().length).toBeGreaterThan(0);
    // In dev (running via bun run main.ts) the resolved path may not yet exist
    // because the bridge plugin isn't built. Assert format only.
    expect(r.stdout.trim()).toMatch(/manifest\.json$/);
  });
});
```

**Step 2: Implement `main.ts` wiring** — insert at the very top of `async function main()`:

```ts
import { dispatch } from "./cli/dispatch";
import { USAGE } from "./cli/usage";
import { resolveManifestPath } from "./cli/print-path";
import { detectClients, type Platform } from "./cli/detect";
import { writeConfig } from "./cli/config-writer";
import { runSetup, formatSetupTable } from "./cli/setup";
import {
  pairWithRelay,
  formatPairBanner,
  cloudEntry,
  DEFAULT_RELAY_URL,
} from "./cli/setup-cloud";
import { buildOpenCommand, runOpenFigma } from "./cli/open-figma";
import {
  runDoctor,
  formatDoctorJson,
  formatDoctorText,
} from "./cli/doctor";
import { createDaemonLivenessCheck } from "./cli/checks/daemon-liveness";
import { createPluginPairingCheck } from "./cli/checks/plugin-pairing";
import { createAiClientConfigsCheck } from "./cli/checks/ai-client-configs";
import { createRecentErrorsCheck } from "./cli/checks/recent-errors";
import { createSocketConflictCheck } from "./cli/checks/socket-conflict";
import { spawn } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";

async function main(): Promise<void> {
  const cmd = dispatch({ argv: process.argv });

  if (cmd.kind === "help") {
    process.stdout.write(USAGE);
    return;
  }

  if (cmd.kind === "print-path") {
    process.stdout.write(`${resolveManifestPath({ metaUrl: import.meta.url })}\n`);
    return;
  }

  if (cmd.kind === "setup") {
    await handleSetup(cmd.flags);
    return;
  }

  if (cmd.kind === "doctor") {
    await handleDoctor(cmd.flags);
    return;
  }

  // cmd.kind === "runtime" — fall through to existing shim/daemon path:
  await runRuntime();
}
```

`handleSetup` orchestration:

```ts
async function handleSetup(flags: {
  dryRun: boolean;
  cloud: boolean;
  openFigma: boolean;
  client: string | null;
  relayUrl: string | null;
}): Promise<void> {
  const homeDir = (process.env.HOME ?? process.env.USERPROFILE) as string;
  const platform = process.platform as Platform;
  const fileExists = (p: string) => existsSync(p);
  const clients = detectClients({ homeDir, platform, fileExists, env: process.env });

  let entry = { command: "npx", args: ["-y", "@scope/figma-mcp"] };
  if (flags.cloud) {
    const relayUrl = flags.relayUrl ?? DEFAULT_RELAY_URL;
    const pair = await pairWithRelay({ relayUrl, fetchFn: fetch });
    process.stdout.write(formatPairBanner(pair));
    entry = cloudEntry({ relayUrl, sessionId: pair.sessionId }) as typeof entry;
  }

  const report = await runSetup({
    clients,
    entry,
    mcpServerName: "figma",
    writeConfig: (a) => writeConfig({ ...a, fs: nodeFsAdapter() }),
    dryRun: flags.dryRun,
    clientFilter: flags.client,
  });
  process.stdout.write(`${formatSetupTable(report)}\n`);

  if (flags.openFigma) {
    const path = resolveManifestPath({ metaUrl: import.meta.url });
    runOpenFigma({ platform, path, spawnFn: spawn as never });
  }
}
```

`handleDoctor` orchestration:

```ts
async function handleDoctor(flags: { json: boolean }): Promise<void> {
  const homeDir = (process.env.HOME ?? process.env.USERPROFILE) as string;
  const platform = process.platform as Platform;
  const ipc = pickIpcTransport({ platform });
  const lockfile = new LockfileManager({
    path: join(homeDir, ".figma-mcp", "daemon.lock"),
    isPidAlive: isPidAliveDefault,
  });
  const clients = detectClients({ homeDir, platform, fileExists: existsSync, env: process.env });

  const report = await runDoctor({
    checks: [
      createDaemonLivenessCheck(lockfile),
      createSocketConflictCheck({
        socketPath: ipc.socketPath,
        probeConnect: () => probeIpcConnect(ipc),
        lockfileActive: () => lockfile.readActive(),
      }),
      createPluginPairingCheck(() => connectPluginPairingProbe(ipc)),
      createAiClientConfigsCheck(clients, (p) => readFile(p, "utf-8")),
      createRecentErrorsCheck(join(homeDir, ".figma-mcp", "daemon.log"), (p) =>
        readFile(p, "utf-8"),
      ),
    ],
  });
  process.stdout.write(flags.json ? `${formatDoctorJson(report)}\n` : `${formatDoctorText(report)}\n`);
}
```

`probeIpcConnect`, `connectPluginPairingProbe`, `nodeFsAdapter` are thin Node-side wiring helpers; keep them inside `main.ts` so the cli/ modules stay pure. `runRuntime` is the existing daemon/shim body verbatim, extracted into a helper for tidiness.

**Step 3: Verify** — preserve the existing test suite:

```bash
bun run --filter @repo/mcp-server test
```

All previous tests (orchestrator, e2e, e2e-ws-plugin, e2e-import-variables, mcp-bridge, spawn.smoke) pass plus the new cli-spawn suite.

**Step 4: Commit**

```bash
git add apps/mcp-server/src/main.ts apps/mcp-server/src/__tests__/cli-spawn.test.ts
git commit -m "feat(mcp-server): wire CLI dispatcher into main.ts + e2e spawn tests"
```

---

## Task 7.12: Coverage gate + Phase 7 changeset + acceptance

**Files:**

- Modify: `apps/mcp-server/vitest.config.ts` (extend coverage `include` to capture `src/cli/**`)
- Create: `.changeset/phase-7-setup-cli.md`

**Step 1: Tighten coverage scope**

The existing `vitest.config.ts` already has `include: ["src/**/*.ts"]` and `exclude: ["src/__tests__/**", "src/main.ts"]`. The cli/ tree is captured automatically. Confirm thresholds (≥80/75/80/80) are met:

```bash
bun run --filter @repo/mcp-server test --coverage
```

If a sub-area dips below threshold, add table-driven tests for the missing branches. Do NOT lower the threshold.

**Step 2: Root acceptance**

```bash
bun run lint
bun run types
bun run test
```

All green.

**Step 3: Changeset** — `.changeset/phase-7-setup-cli.md`

```markdown
---
"@repo/mcp-server": minor
"@repo/transport": minor
---

Phase 7: Setup CLI + diagnostics.

`@repo/mcp-server` (apps/mcp-server) gains a CLI dispatch layer:

- `figma-mcp setup` detects installed AI clients (Claude Code,
  Claude Desktop, Cursor, Windsurf, VS Code Copilot) and writes
  their MCP config entries atomically, preserving siblings.
- `figma-mcp setup --cloud` pairs with the relay (Phase 6) and
  writes Streamable HTTP entries pointing at `/mcp/{sessionId}`.
- `figma-mcp setup --dry-run` and `--client <id>` for previewing
  and scoping.
- `figma-mcp setup --open-figma` reveals the bundled bridge
  plugin manifest in the OS file picker.
- `figma-mcp doctor` runs parallel health checks: daemon
  liveness, lockfile staleness, plugin pairing, AI client
  config drift, recent errors, socket/port conflict. `--json`
  for machine output.
- `figma-mcp --print-path` resolves the bundled bridge plugin
  manifest path.
- `figma-mcp --help` prints usage.

`@repo/transport` (packages/transport) gains:

- `pickIpcTransport(platform)` selector: Unix socket on
  POSIX, named pipe on win32.
- `NamedPipeServerTransport` / `NamedPipeClientTransport`
  re-exports (Node's `node:net` accepts pipe paths verbatim).

Out of scope: production relay URL (Phase 9), Windows beyond
unit-tested selector, telemetry, auto-update, doctor --fix.
```

**Step 4: Commit**

```bash
git add .changeset/phase-7-setup-cli.md apps/mcp-server/vitest.config.ts
git commit -m "chore(changeset): record Phase 7 setup CLI + diagnostics"
```

**Step 5: Final acceptance pass**

```bash
bun run lint && bun run types && bun run test
git log master..HEAD --oneline
```

**Phase 7 done.** The binary now installs itself into AI clients, diagnoses problems, and is one drag-import away from a paired plugin.

---

## Notes on Execution

**Per-client configuration quirks:**

- **Claude Code** has TWO config locations: `~/.claude.json` (user-scoped, what we write) and `./.mcp.json` (project-scoped). v1 only writes user-scoped. Claude Code also exposes a `claude mcp add` CLI; we do not invoke it because (a) it adds a hard dep on the CLI being installed, (b) the JSON write achieves the same result with no extra surface area.
- **Claude Desktop** requires a **full app restart** to pick up new `mcpServers` entries. The setup CLI prints a hint on success — but does not attempt to restart the app.
- **Cursor** picks up changes on **reload** (Cmd-Shift-P → Reload Window). Our setup output should mention this.
- **Windsurf** picks up changes when the MCP panel is opened or refreshed.
- **VS Code Copilot** path (`Code/User/mcp.json`) is the user-level path introduced in 1.95+. Older versions used `settings.json`. We write the modern path; if the user has an older Copilot the entry will be ignored — `doctor`'s `ai-client-configs` check catches this as a `warn`.

**`--print-path` in dev vs production:** `import.meta.url` in `bun run src/main.ts` resolves to the source file, not `dist/`. The CLI test asserts the **format** of the path (ends in `manifest.json`), not its existence. After `bun run --filter @repo/mcp-server build` the resolved path points to `apps/mcp-server/dist/plugin/manifest.json` which exists.

**Atomic write on Windows:** `fs.rename` over an existing file fails with `EPERM` on Windows when the target is open. The config writer's atomic-rename pattern is best-effort there — that's the existing trade-off in the Node fs API. We do not paper over it with `fs.copyFile + fs.unlink` because that loses atomicity and can yield a half-written config; a clean failure is preferable.

**Doctor exit code:** v1 always exits 0 from `doctor` (the report itself signals problems via status). A `--strict` flag that exits non-zero on any `error` is a Phase 9 candidate; it's not in this plan.

**Process.argv quirks:** Bun and Node both expose `process.argv` with `[execPath, scriptPath, ...userArgs]`. The dispatcher slices from index 2 — same as Node convention. When the binary is invoked via `npx @scope/figma-mcp setup`, npm shim wrappers preserve argv, so no special handling needed.

**Test isolation:** the cli-spawn tests set `HOME` to a temp directory so detection finds nothing and writes don't pollute the developer's machine. The pre-existing `spawn.smoke.test.ts` already uses this pattern — match it.

**Order-of-execution dependency:** Task 7.9 imports the `pickIpcTransport` selector from Task 7.10. The executor should land 7.10 before 7.9, OR write 7.9's `probeConnect` against the existing `UnixSocketClientTransport` and refactor when 7.10 lands. The task map deliberately lists 7.10 before 7.11 (which is the only task that wires both into `main.ts`).

---

## Out of scope

- Production relay URL — Phase 9 pins it; Phase 7 uses `https://figma-mcp-relay.bromso.workers.dev` placeholder via `--relay-url`.
- Windows beyond best-effort: CI runs macOS; the `pickIpcTransport` selector + named-pipe path are unit-tested but not exercised against a real Windows runtime in this phase.
- Telemetry, analytics, opt-in/opt-out flows.
- Auto-update of the published binary.
- Self-installer beyond `npx @scope/figma-mcp setup`.
- Doctor's auto-fix mode (`doctor --fix`).
- A `--strict` exit-code mode for `doctor`.
- Project-scoped `.mcp.json` writes (Claude Code project mode).
- Older VS Code Copilot config layout (`settings.json`-embedded MCP).
- `setup --uninstall` (removing entries we wrote). Manual user action via JSON editor for v1.
- Multi-shim coordination over a single relay session — Phase 8+.
- Bridge plugin's `allowedDomains` update for the production relay domain — Phase 9.

---

## References

- Phase 6 plan (relay): `docs/plans/2026-05-06-figma-mcp-phase-6.md`
- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md` (§ "Cloud pairing", § "Specific gotchas").
- Roadmap: `docs/plans/2026-05-06-figma-mcp-rewrite-plan.md` (Phase 7 high-level scope).
- Existing entry point: `apps/mcp-server/src/main.ts`.
- Startup decision logic: `apps/mcp-server/src/orchestrator.ts`.
- Lockfile: `apps/mcp-server/src/daemon/lockfile.ts`.
- Relay pair endpoint contract: `apps/relay/src/index.ts` (`POST /pair`).
- Existing IPC transports: `packages/transport/src/unix-socket-{server,client}.ts`.
- [Claude Code MCP docs](https://docs.claude.com/en/docs/claude-code/mcp).
- [Claude Desktop MCP config](https://modelcontextprotocol.io/quickstart/user).
- [Cursor MCP docs](https://docs.cursor.com/context/mcp).
- [Windsurf MCP docs](https://docs.codeium.com/windsurf/mcp).
- [VS Code MCP support](https://code.visualstudio.com/docs/copilot/chat/mcp-servers).
