import type { FigmaAdapter, VariableCollection } from "@repo/figma-adapter";
import { type ChunkAckEnvelope, type ChunkEnvelope, ErrorCode, type Logger } from "@repo/protocol";
import type { VariableInput } from "@repo/tools-variables";

export interface StreamRuntimeOptions {
  readonly figma: FigmaAdapter;
  readonly logger?: Logger;
}

interface SessionState {
  total: number;
  atomic: boolean;
  appliedSeqs: Set<number>;
  ackCache: Map<number, ChunkAckEnvelope>;
  appliedCount: number;
  failedCount: number;
  createdIds: string[];
  collectionsCache: Map<string, VariableCollection>;
  rolledBack: boolean;
  completed: boolean;
}

const noop = (): void => {};
const noopLogger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

interface CodedError extends Error {
  code?: string;
}

const codedError = (message: string, code: string): CodedError => {
  const err: CodedError = new Error(message);
  err.code = code;
  return err;
};

/**
 * Per-session import state for the plugin side. Owns the idempotency
 * map (replayed chunks return the cached ack rather than re-applying)
 * and the rollback tracker (atomic mode deletes every variable created
 * in the session on first failure).
 */
export class StreamRuntime {
  private readonly figma: FigmaAdapter;
  private readonly logger: Logger;
  private readonly sessions = new Map<string, SessionState>();

  constructor(options: StreamRuntimeOptions) {
    this.figma = options.figma;
    this.logger = options.logger ?? noopLogger;
  }

  openSession(args: { sessionId: string; total: number; atomic: boolean }): void {
    this.sessions.set(args.sessionId, {
      total: args.total,
      atomic: args.atomic,
      appliedSeqs: new Set(),
      ackCache: new Map(),
      appliedCount: 0,
      failedCount: 0,
      createdIds: [],
      collectionsCache: new Map(),
      rolledBack: false,
      completed: false,
    });
  }

  closeSession(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.completed = true;
  }

  getStatus(sessionId: string): {
    lastAckedSeq: number;
    applied: number;
    failed: number;
    atomic: boolean;
    completed: boolean;
  } | null {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    const lastAckedSeq = s.appliedSeqs.size === 0 ? 0 : Math.max(...Array.from(s.appliedSeqs));
    return {
      lastAckedSeq,
      applied: s.appliedCount,
      failed: s.failedCount,
      atomic: s.atomic,
      completed: s.completed,
    };
  }

  async applyChunk(env: ChunkEnvelope): Promise<ChunkAckEnvelope> {
    const session = this.sessions.get(env.sessionId);
    if (!session) {
      throw codedError(`session not found: ${env.sessionId}`, ErrorCode.E_STREAM_SESSION_NOT_FOUND);
    }

    if (session.appliedSeqs.has(env.seq)) {
      const cached = session.ackCache.get(env.seq);
      if (cached) return cached;
    }

    if (session.rolledBack) {
      throw codedError(`session ${env.sessionId} was rolled back`, ErrorCode.E_STREAM_OUT_OF_ORDER);
    }

    const expectedSeq =
      session.appliedSeqs.size === 0 ? 0 : Math.max(...Array.from(session.appliedSeqs)) + 1;
    if (env.seq !== expectedSeq) {
      throw codedError(
        `chunk seq ${env.seq} out of order; expected ${expectedSeq}`,
        ErrorCode.E_STREAM_OUT_OF_ORDER
      );
    }

    const items = env.items as VariableInput[];
    const failedDetails: Array<{ index: number; reason: string; name?: string }> = [];
    let applied = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        await this.applyItem(session, item);
        applied++;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failedDetails.push({ index: i, reason, name: item.name });
        if (session.atomic) {
          await this.rollback(session);
          for (let j = i + 1; j < items.length; j++) {
            failedDetails.push({ index: j, reason: "rolled back", name: items[j].name });
          }
          break;
        }
      }
    }

    const failed = failedDetails.length;
    session.appliedSeqs.add(env.seq);
    session.appliedCount += applied;
    session.failedCount += failed;

    const ack: ChunkAckEnvelope = {
      kind: "chunk-ack",
      id: env.id,
      sessionId: env.sessionId,
      seq: env.seq,
      applied,
      failed,
      failedDetails,
    };
    session.ackCache.set(env.seq, ack);
    return ack;
  }

  private async applyItem(session: SessionState, item: VariableInput): Promise<void> {
    let collection = session.collectionsCache.get(item.collection);
    if (!collection) {
      const all = await this.figma.getLocalVariableCollectionsAsync();
      collection = all.find((c) => c.name === item.collection);
      if (!collection) {
        collection = await this.figma.createVariableCollection({ name: item.collection });
      }
      session.collectionsCache.set(item.collection, collection);
    }

    const variable = await this.figma.createVariable({
      name: item.name,
      collectionId: collection.id,
      resolvedType: item.resolvedType,
    });
    session.createdIds.push(variable.id);

    // Mode names map to the collection's mode ids; unknown names fall
    // back to the first mode for Phase 5. Production resolution lands
    // in Phase 8 along with W3C tokens.
    for (const [modeName, value] of Object.entries(item.valuesByMode)) {
      const mode = collection.modes.find((m) => m.name === modeName) ?? collection.modes[0];
      await this.figma.setValueForMode({
        variableId: variable.id,
        modeId: mode.id,
        value,
      });
    }
  }

  private async rollback(session: SessionState): Promise<void> {
    for (const id of session.createdIds) {
      try {
        await this.figma.deleteVariableAsync(id);
      } catch (err) {
        this.logger.warn("rollback: failed to delete", { id, err: String(err) });
      }
    }
    session.createdIds = [];
    session.rolledBack = true;
  }
}
