import { describe, expect, it } from "vitest";
import { type FsAdapter, writeConfig } from "../config-writer";

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
    fs.files.set("/cfg/mcp.json", JSON.stringify({ mcpServers: { other: { command: "x" } } }));
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
    fs.files.set("/cfg/mcp.json", JSON.stringify({ theme: "dark", mcpServers: {} }));
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
