import type { ChildProcess } from "node:child_process";
import type { Platform } from "./detect";

export interface BuildOpenCommandOptions {
  readonly platform: Platform;
  readonly path: string;
}

export interface OpenCommand {
  readonly cmd: string;
  readonly args: ReadonlyArray<string>;
}

export function buildOpenCommand(options: BuildOpenCommandOptions): OpenCommand {
  if (options.platform === "darwin") {
    return { cmd: "open", args: ["-R", options.path] };
  }
  if (options.platform === "win32") {
    return { cmd: "explorer", args: [`/select,${options.path}`] };
  }
  // linux
  const dir = options.path.replace(/[\\/][^\\/]+$/, "");
  return { cmd: "xdg-open", args: [dir] };
}

export interface RunOpenFigmaOptions extends BuildOpenCommandOptions {
  readonly spawnFn: (
    cmd: string,
    args: readonly string[],
    options: { detached: true; stdio: "ignore" }
  ) => ChildProcess;
}

export function runOpenFigma(options: RunOpenFigmaOptions): void {
  const { cmd, args } = buildOpenCommand(options);
  const child = options.spawnFn(cmd, args, { detached: true, stdio: "ignore" });
  child?.unref?.();
}
