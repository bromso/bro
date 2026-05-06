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
  path: string
): Promise<{ mcpServers?: Record<string, McpServerEntry>; [k: string]: unknown }> {
  try {
    const raw = await fs.readFile(path);
    return JSON.parse(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}
