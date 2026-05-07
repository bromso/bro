import type { PluginHandler } from "@repo/protocol";
import { getActiveStore } from "./console-patch";
import type { ClearConsole, GetConsoleErrors, GetConsoleLogs } from "./tools";

const requireStore = () => {
  const store = getActiveStore();
  if (!store) throw new Error("E_CONSOLE_STORE_UNINSTALLED");
  return store;
};

export const getConsoleLogsPluginHandler: PluginHandler<typeof GetConsoleLogs> = async (args) => ({
  entries: requireStore()
    .getRecent({ limit: args.limit })
    .map((e) => ({ level: e.level, message: e.message, timestamp: e.timestamp })),
});

export const clearConsolePluginHandler: PluginHandler<typeof ClearConsole> = async () => {
  const store = requireStore();
  const cleared = store.getStatus().total;
  store.clear();
  return { cleared };
};

export const getConsoleErrorsPluginHandler: PluginHandler<typeof GetConsoleErrors> = async (
  args
) => ({
  entries: requireStore()
    .getRecent({ levels: ["error"], limit: args.limit })
    .map((e) => ({ level: e.level, message: e.message, timestamp: e.timestamp })),
});
