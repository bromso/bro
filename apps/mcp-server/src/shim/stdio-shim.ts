import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport as McpTransport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Envelope, RequestEnvelope, ToolDefinition } from "@repo/protocol";
import { Correlator, UnixSocketClientTransport } from "@repo/transport";
import { registerToolsWithMcp } from "../mcp-bridge";

export interface ShimOptions {
  readonly socketPath: string;
  readonly sourceClientId: string;
  readonly tools: readonly ToolDefinition[];
  readonly mcpServerInfo: { name: string; version: string };
}

let nextRequestId = 0;
const newId = () => `req_${++nextRequestId}_${Date.now()}`;

export class StdioShim {
  private readonly mcpServer: Server;
  private readonly correlator: Correlator;
  private readonly ipc: UnixSocketClientTransport;

  constructor(options: ShimOptions, ipc: UnixSocketClientTransport) {
    this.ipc = ipc;
    this.correlator = new Correlator(ipc);
    this.mcpServer = new Server(options.mcpServerInfo, { capabilities: { tools: {} } });

    registerToolsWithMcp({
      mcpServer: this.mcpServer,
      tools: options.tools,
      resolve: (name, args, ctx) => {
        // Subscribe to chunk-acks for the duration of this call so the
        // bridge can emit MCP notifications/progress as the daemon
        // streams chunks to the plugin. Phase 5: best-effort, no
        // sessionId filter (Daemon broadcasts all envelopes to every
        // shim, but two concurrent imports from the same shim would
        // briefly mis-attribute). A proper sessionId→progressToken map
        // lands in Phase 6/7.
        const off = this.ipc.onMessage((env: Envelope) => {
          if (env.kind === "chunk-ack") {
            ctx.emitProgress({
              progress: env.seq + 1,
              message: `${env.applied} applied / ${env.failed} failed`,
            });
          }
        });
        return this.correlator
          .request({
            kind: "request",
            id: newId(),
            sourceClientId: options.sourceClientId,
            tool: name,
            args: (args ?? {}) as Record<string, unknown>,
          } satisfies RequestEnvelope)
          .finally(off);
      },
    });
  }

  connectMcp(transport: McpTransport): Promise<void> {
    return this.mcpServer.connect(transport);
  }

  async stop(): Promise<void> {
    await this.ipc.close();
    await this.mcpServer.close();
  }
}

export async function createStdioShim(options: ShimOptions): Promise<StdioShim> {
  const ipc = await UnixSocketClientTransport.connect({ path: options.socketPath });
  return new StdioShim(options, ipc);
}
