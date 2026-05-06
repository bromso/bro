import type { ServerHandler } from "@repo/protocol";
import type { ImportVariables } from "@repo/tools-variables";
import { type ChunkLoopTransport, runChunkLoop } from "./session-manager";

export interface ImportVariablesProviders {
  /** Build a ChunkLoopTransport bound to whatever upstream the daemon manages (WS plugin via Correlator). */
  readonly buildTransport: () => ChunkLoopTransport;
  /**
   * Optional progress emitter — invoked after each chunk-ack. Wired in
   * Task 5.9 to emit MCP `notifications/progress` via the stdio shim.
   */
  readonly onProgress?: (
    progressToken: string | number | undefined,
    info: { sessionId: string; seq: number; total: number; applied: number; failed: number }
  ) => void;
}

let nextSessionId = 0;
const newSessionId = () => `ses_${++nextSessionId}_${Date.now()}`;

export function createImportVariablesServerHandler(
  providers: ImportVariablesProviders
): ServerHandler<typeof ImportVariables> {
  return async (args) => {
    if (args.source.kind !== "inline") {
      throw new Error(`unsupported source kind: ${(args.source as { kind: string }).kind}`);
    }
    const sessionId = newSessionId();
    const summary = await runChunkLoop({
      sessionId,
      tool: "import_variables",
      atomic: args.atomic,
      items: args.source.items,
      chunkSize: args.chunkSize,
      transport: providers.buildTransport(),
      onProgress: (info) => providers.onProgress?.(undefined, info),
    });
    return {
      sessionId: summary.sessionId,
      total: summary.total,
      applied: summary.applied,
      failed: summary.failed,
      failedDetails: summary.failedDetails,
    };
  };
}
