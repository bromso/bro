export type ConsoleLevel = "log" | "warn" | "error" | "info";

export interface ConsoleEntry {
  readonly level: ConsoleLevel;
  readonly message: string;
  readonly timestamp: number;
}

export interface ConsoleStoreOptions {
  readonly capacity?: number;
}

export interface GetRecentOptions {
  readonly levels?: ReadonlyArray<ConsoleLevel>;
  readonly limit?: number;
}

export interface ConsoleStatus {
  readonly total: number;
  readonly byLevel: Record<ConsoleLevel, number>;
  readonly droppedCount: number;
}

export interface SinceCursorResult {
  readonly entries: ReadonlyArray<ConsoleEntry>;
  readonly nextCursor: string;
}

const DEFAULT_CAPACITY = 1000;

interface SequencedEntry extends ConsoleEntry {
  readonly seq: number;
}

export class ConsoleStore {
  private readonly capacity: number;
  private readonly buffer: SequencedEntry[] = [];
  private droppedCount = 0;
  private nextSeq = 0;

  constructor(options: ConsoleStoreOptions = {}) {
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
  }

  append(entry: ConsoleEntry): void {
    this.buffer.push({ ...entry, seq: this.nextSeq++ });
    while (this.buffer.length > this.capacity) {
      this.buffer.shift();
      this.droppedCount++;
    }
  }

  getRecent(options: GetRecentOptions = {}): ReadonlyArray<ConsoleEntry> {
    const levels = options.levels ? new Set(options.levels) : null;
    const filtered = levels ? this.buffer.filter((e) => levels.has(e.level)) : this.buffer;
    const limit = options.limit ?? filtered.length;
    return filtered.slice(-limit).map(({ seq, ...rest }) => rest);
  }

  clear(): void {
    this.buffer.length = 0;
    this.droppedCount = 0;
    this.nextSeq = 0;
  }

  getStatus(): ConsoleStatus {
    const byLevel: Record<ConsoleLevel, number> = { log: 0, warn: 0, error: 0, info: 0 };
    for (const e of this.buffer) byLevel[e.level]++;
    return {
      total: this.buffer.length,
      byLevel,
      droppedCount: this.droppedCount,
    };
  }

  getSinceCursor(options: { cursor: string | null }): SinceCursorResult {
    const cursorSeq = options.cursor === null ? -1 : Number.parseInt(options.cursor, 10);
    const entries = this.buffer.filter((e) => e.seq > cursorSeq).map(({ seq, ...rest }) => rest);
    const last = this.buffer[this.buffer.length - 1];
    const nextCursor = last ? String(last.seq) : (options.cursor ?? "-1");
    return { entries, nextCursor };
  }
}
