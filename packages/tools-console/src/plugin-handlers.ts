import type { PluginHandler } from "@repo/protocol";
import { getActiveStore } from "./console-patch";
import type {
  ClearConsole,
  ConsoleStatusTool,
  GetConsoleErrors,
  GetConsoleLogs,
  GetConsoleWarnings,
  QueryConsole,
} from "./tools";

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

export const getConsoleWarningsPluginHandler: PluginHandler<typeof GetConsoleWarnings> = async (
  args
) => ({
  entries: requireStore()
    .getRecent({ levels: ["warn"], limit: args.limit })
    .map((e) => ({ level: e.level, message: e.message, timestamp: e.timestamp })),
});

export const queryConsolePluginHandler: PluginHandler<typeof QueryConsole> = async (args) => {
  let regex: RegExp;
  try {
    regex = new RegExp(args.pattern);
  } catch (err) {
    throw new Error(`invalid regex: ${(err as Error).message}`);
  }
  const all = requireStore().getRecent({});
  const matched = all.filter((e) => regex.test(e.message));
  const limit = args.limit ?? matched.length;
  return {
    entries: matched
      .slice(0, limit)
      .map((e) => ({ level: e.level, message: e.message, timestamp: e.timestamp })),
  };
};

export const consoleStatusPluginHandler: PluginHandler<typeof ConsoleStatusTool> = async () => {
  const status = requireStore().getStatus();
  return {
    total: status.total,
    byLevel: status.byLevel,
    droppedCount: status.droppedCount,
  };
};
