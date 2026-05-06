import type { PluginHandler } from "@repo/protocol";
import type { ExportVariables, StreamStatus, UpdateVariablesBatch } from "./tools";

export const exportVariablesPluginHandler: PluginHandler<typeof ExportVariables> = async (
  { pageSize, cursor },
  { figma }
) => {
  const all = await figma.getLocalVariablesAsync();
  const start = cursor ? Number(cursor) : 0;
  const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;
  const end = Math.min(safeStart + pageSize, all.length);
  const items = all.slice(safeStart, end).map((v) => ({
    id: v.id,
    name: v.name,
    resolvedType: v.resolvedType,
    valuesByMode: { ...v.valuesByMode },
  }));
  return {
    items,
    nextCursor: end < all.length ? String(end) : null,
  };
};

export const updateVariablesBatchPluginHandler: PluginHandler<typeof UpdateVariablesBatch> = async (
  { updates },
  { figma }
) => {
  let applied = 0;
  let failed = 0;
  const failedDetails: Array<{ index: number; reason: string; name?: string }> = [];
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    try {
      await figma.setValueForMode({
        variableId: u.variableId,
        modeId: u.modeId,
        value: u.value,
      });
      applied++;
    } catch (err) {
      failed++;
      failedDetails.push({
        index: i,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { applied, failed, failedDetails };
};

export interface StreamStatusProvider {
  readonly getStatus: (sessionId: string) => {
    lastAckedSeq: number;
    applied: number;
    failed: number;
    atomic: boolean;
    completed: boolean;
  } | null;
}

export function createStreamStatusPluginHandler(
  providers: StreamStatusProvider
): PluginHandler<typeof StreamStatus> {
  return async ({ sessionId }) => {
    const status = providers.getStatus(sessionId);
    if (!status) {
      // Treat unknown sessions as completed-with-no-data — caller decides what to do.
      return {
        sessionId,
        lastAckedSeq: 0,
        applied: 0,
        failed: 0,
        atomic: false,
        completed: true,
      };
    }
    return { sessionId, ...status };
  };
}
