import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface LockRecord {
  readonly pid: number;
  readonly version: string;
  readonly socketPath: string;
}

export interface LockfileOptions {
  readonly path: string;
  readonly isPidAlive: (pid: number) => boolean;
}

export class LockfileManager {
  constructor(private readonly options: LockfileOptions) {}

  async read(): Promise<LockRecord | null> {
    try {
      const raw = await readFile(this.options.path, "utf-8");
      const parsed = JSON.parse(raw) as Partial<LockRecord>;
      if (
        typeof parsed.pid !== "number" ||
        typeof parsed.version !== "string" ||
        typeof parsed.socketPath !== "string"
      ) {
        return null;
      }
      return { pid: parsed.pid, version: parsed.version, socketPath: parsed.socketPath };
    } catch {
      return null;
    }
  }

  async readActive(): Promise<LockRecord | null> {
    const r = await this.read();
    if (!r) return null;
    return this.options.isPidAlive(r.pid) ? r : null;
  }

  async write(record: LockRecord): Promise<void> {
    await mkdir(dirname(this.options.path), { recursive: true });
    await writeFile(this.options.path, JSON.stringify(record));
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.options.path);
    } catch {
      /* ignore — already gone */
    }
  }
}

/** Default `isPidAlive` for production: `kill 0` semantics. */
export const isPidAliveDefault = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
