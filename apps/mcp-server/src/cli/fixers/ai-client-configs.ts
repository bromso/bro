import type { McpServerEntry, WriteConfigResult } from "../config-writer";
import type { DetectedClient } from "../detect";
import type { Fixer } from "../doctor";
import { runSetup } from "../setup";

export interface CreateAiClientConfigsFixerOptions {
  readonly clients: ReadonlyArray<DetectedClient>;
  readonly mcpServerName: string;
  readonly entry: McpServerEntry;
  readonly writeConfig: (args: {
    path: string;
    mcpServerName: string;
    entry: McpServerEntry;
  }) => Promise<WriteConfigResult>;
}

/**
 * Auto-fix for the `ai-client-configs` doctor check.
 *
 * Re-runs the per-client setup write against ALL detected clients. The write
 * is idempotent for already-correct clients (they get rewritten with the same
 * entry) and brings drifted clients back into compliance. We deliberately
 * avoid parsing the check's detail string to determine which clients drifted
 * — running setup against the full set is simpler, idempotent, and not
 * meaningfully slower.
 */
export const createAiClientConfigsFixer = (opts: CreateAiClientConfigsFixerOptions): Fixer => ({
  async run() {
    // The doctor's ai-client-configs check only flags drift on *present*
    // clients (i.e. those with an existing config file). Mirror that scope
    // here so we don't accidentally create config files for clients the
    // user never installed.
    const present = opts.clients.filter((c) => c.present);
    if (present.length === 0) {
      return { detail: "no clients to repair" };
    }
    const report = await runSetup({
      clients: present,
      entry: opts.entry,
      mcpServerName: opts.mcpServerName,
      writeConfig: opts.writeConfig,
      dryRun: false,
      clientFilter: null,
    });
    const written = report.actions.filter((a) => a.action === "created" || a.action === "updated");
    if (written.length === 0) {
      return { detail: "no clients to repair" };
    }
    const summary = written.map((a) => `${a.id}=${a.action}`).join(", ");
    return { detail: `re-applied setup: ${summary}` };
  },
});
