export type Platform = "darwin" | "linux" | "win32";

export interface DetectClientsOptions {
  readonly homeDir: string;
  readonly platform: Platform;
  readonly fileExists: (path: string) => boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface DetectedClient {
  readonly id: "claude-code" | "claude-desktop" | "cursor" | "windsurf" | "copilot";
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
      "claude-desktop": join(
        o.homeDir,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json"
      ),
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
