import { describe, expect, it, vi } from "vitest";
import { chunkify, runChunkLoop } from "../session-manager";

describe("chunkify", () => {
  it("splits into batches of N", () => {
    expect(chunkify([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });
  it("returns empty array for empty input", () => {
    expect(chunkify([], 100)).toEqual([]);
  });
});

describe("runChunkLoop", () => {
  it("emits stream-open, sends each chunk, awaits ack, emits progress", async () => {
    const sent: unknown[] = [];
    const progress = vi.fn();
    const transport = {
      async send(env: unknown) {
        sent.push(env);
      },
      async request<T>(env: unknown): Promise<T> {
        sent.push(env);
        const e = env as { seq: number; total: number; items: unknown[] };
        return { applied: e.items.length, failed: 0, failedDetails: [] } as T;
      },
    };
    const summary = await runChunkLoop({
      sessionId: "ses_a",
      tool: "import_variables",
      atomic: false,
      items: [1, 2, 3, 4, 5],
      chunkSize: 2,
      transport,
      onProgress: progress,
    });
    expect(summary.total).toBe(5);
    expect(summary.applied).toBe(5);
    expect(progress).toHaveBeenCalledTimes(3);
    // The wire sequence: stream-open, chunk x3, stream-done.
    expect(sent.filter((e) => (e as { kind: string }).kind === "chunk")).toHaveLength(3);
    expect(sent.filter((e) => (e as { kind: string }).kind === "stream-open")).toHaveLength(1);
    expect(sent.filter((e) => (e as { kind: string }).kind === "stream-done")).toHaveLength(1);
  });

  it("aggregates failedDetails with index offset by chunk position", async () => {
    const transport = {
      async send() {},
      async request<T>(env: unknown): Promise<T> {
        const e = env as { seq: number; items: unknown[] };
        return {
          applied: e.items.length - 1,
          failed: 1,
          failedDetails: [{ index: 0, reason: `fail-in-chunk-${e.seq}` }],
        } as T;
      },
    };
    const summary = await runChunkLoop({
      sessionId: "ses_a",
      tool: "import_variables",
      atomic: false,
      items: [1, 2, 3, 4],
      chunkSize: 2,
      transport,
    });
    expect(summary.failed).toBe(2);
    expect(summary.failedDetails).toEqual([
      { index: 0, reason: "fail-in-chunk-0", name: undefined },
      { index: 2, reason: "fail-in-chunk-1", name: undefined },
    ]);
  });
});
