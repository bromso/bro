import type { McpServerEntry, WriteConfigResult } from "./config-writer";
import type { DetectedClient } from "./detect";

export type SetupAction = "created" | "updated" | "would-write" | "skipped" | "not-detected";

export interface SetupActionRecord {
  readonly id: string;
  readonly action: SetupAction;
  readonly path: string | null;
}

export interface SetupReport {
  readonly actions: ReadonlyArray<SetupActionRecord>;
}

export interface RunSetupOptions {
  readonly clients: ReadonlyArray<DetectedClient>;
  readonly entry: McpServerEntry;
  readonly mcpServerName: string;
  readonly writeConfig: (args: {
    path: string;
    mcpServerName: string;
    entry: McpServerEntry;
  }) => Promise<WriteConfigResult>;
  readonly dryRun: boolean;
  readonly clientFilter: string | null;
}

export async function runSetup(options: RunSetupOptions): Promise<SetupReport> {
  const targets = options.clientFilter
    ? options.clients.filter((c) => c.id === options.clientFilter)
    : options.clients;

  if (options.clientFilter && targets.length === 0) {
    return {
      actions: [{ id: options.clientFilter, action: "not-detected", path: null }],
    };
  }

  const actions: SetupActionRecord[] = [];
  for (const client of targets) {
    if (options.dryRun) {
      actions.push({ id: client.id, action: "would-write", path: client.configPath });
      continue;
    }
    const result = await options.writeConfig({
      path: client.configPath,
      mcpServerName: options.mcpServerName,
      entry: options.entry,
    });
    actions.push({
      id: client.id,
      action: result.prior ? "updated" : "created",
      path: client.configPath,
    });
  }
  return { actions };
}

export function formatSetupTable(report: SetupReport): string {
  const rows = report.actions.map(
    (a) => `  ${a.id.padEnd(16)} ${a.action.padEnd(14)} ${a.path ?? "-"}`
  );
  return ["Client            Action         Path", ...rows].join("\n");
}
