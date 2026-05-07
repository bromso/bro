/**
 * @repo/tools-console — captures the Figma plugin sandbox console output
 * via a bounded ring buffer. Phase 8.4 + 8.5 fill in the 6 tool
 * definitions and handlers; Task 8.3 wires the buffer into the bridge
 * plugin.
 */

export type { InstallConsoleCaptureOptions } from "./console-patch";
export { getActiveStore, installConsoleCapture } from "./console-patch";
export * from "./plugin-handlers";
export type {
  ConsoleEntry,
  ConsoleLevel,
  ConsoleStatus,
  ConsoleStoreOptions,
  GetRecentOptions,
  SinceCursorResult,
} from "./store";
export { ConsoleStore } from "./store";
export * from "./tools";
