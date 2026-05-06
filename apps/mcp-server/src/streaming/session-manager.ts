import type {
  ChunkAckEnvelope,
  ChunkEnvelope,
  StreamDoneEnvelope,
  StreamOpenEnvelope,
} from "@repo/protocol";

export function chunkify<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export interface ChunkLoopTransport {
  send(env: StreamOpenEnvelope | StreamDoneEnvelope): Promise<void>;
  request<T = ChunkAckEnvelope>(env: ChunkEnvelope): Promise<T>;
}

export interface ChunkLoopOptions {
  readonly sessionId: string;
  readonly tool: string;
  readonly atomic: boolean;
  readonly items: readonly unknown[];
  readonly chunkSize: number;
  readonly transport: ChunkLoopTransport;
  readonly onProgress?: (info: {
    sessionId: string;
    seq: number;
    total: number;
    applied: number;
    failed: number;
  }) => void;
}

export interface StreamSummary {
  sessionId: string;
  total: number;
  applied: number;
  failed: number;
  failedDetails: Array<{ index: number; reason: string; name?: string }>;
}

let nextRequestId = 0;
const newId = () => `stream_${++nextRequestId}_${Date.now()}`;

export async function runChunkLoop(opts: ChunkLoopOptions): Promise<StreamSummary> {
  const open: StreamOpenEnvelope = {
    kind: "stream-open",
    id: newId(),
    sessionId: opts.sessionId,
    tool: opts.tool,
    total: opts.items.length,
    atomic: opts.atomic,
  };
  await opts.transport.send(open);

  let appliedTotal = 0;
  let failedTotal = 0;
  const failedDetailsTotal: StreamSummary["failedDetails"] = [];

  const batches = chunkify(opts.items, opts.chunkSize);
  for (let seq = 0; seq < batches.length; seq++) {
    const batch = batches[seq];
    const chunk: ChunkEnvelope = {
      kind: "chunk",
      id: newId(),
      sessionId: opts.sessionId,
      seq,
      total: opts.items.length,
      items: batch as unknown[],
      idempotencyKey: `${opts.sessionId}:${seq}`,
    };
    const ack = await opts.transport.request<ChunkAckEnvelope>(chunk);
    appliedTotal += ack.applied;
    failedTotal += ack.failed;
    for (const fd of ack.failedDetails) {
      failedDetailsTotal.push({
        index: seq * opts.chunkSize + fd.index,
        reason: fd.reason,
        name: fd.name,
      });
    }
    opts.onProgress?.({
      sessionId: opts.sessionId,
      seq,
      total: opts.items.length,
      applied: appliedTotal,
      failed: failedTotal,
    });
  }

  const done: StreamDoneEnvelope = {
    kind: "stream-done",
    id: newId(),
    sessionId: opts.sessionId,
    summary: { total: opts.items.length, applied: appliedTotal, failed: failedTotal },
  };
  await opts.transport.send(done);

  return {
    sessionId: opts.sessionId,
    total: opts.items.length,
    applied: appliedTotal,
    failed: failedTotal,
    failedDetails: failedDetailsTotal,
  };
}
