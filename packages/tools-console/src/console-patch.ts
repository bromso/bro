import type { ConsoleLevel, ConsoleStore } from "./store";

interface ConsoleLike {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
}

export interface InstallConsoleCaptureOptions {
  readonly store: ConsoleStore;
  readonly target?: ConsoleLike;
  readonly now?: () => number;
}

let activeStore: ConsoleStore | null = null;

export function installConsoleCapture(options: InstallConsoleCaptureOptions): void {
  const target = options.target ?? (globalThis.console as ConsoleLike | undefined);
  if (!target) return;
  const now = options.now ?? Date.now;
  activeStore = options.store;

  const wrap = (level: ConsoleLevel, original: (...args: unknown[]) => void) =>
    function patched(...args: unknown[]): void {
      const message = args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" ");
      options.store.append({ level, message, timestamp: now() });
      original.apply(target, args);
    };

  target.log = wrap("log", target.log.bind(target));
  target.warn = wrap("warn", target.warn.bind(target));
  target.error = wrap("error", target.error.bind(target));
  target.info = wrap("info", target.info.bind(target));
}

export function getActiveStore(): ConsoleStore | null {
  return activeStore;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
