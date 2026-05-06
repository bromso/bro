import type { LockfileManager } from "./daemon/lockfile";

export type StartupMode = "shim" | "daemon";

export interface SpawnDaemonResult {
  pid: number;
  socketPath: string;
}

export interface ResolveStartupOptions {
  readonly argv: readonly string[];
  readonly version: string;
  readonly lockfile: LockfileManager;
  readonly socketPath: string;
  readonly spawnDaemon: () => Promise<SpawnDaemonResult>;
}

export interface ResolveStartupResult {
  readonly mode: StartupMode;
  readonly socketPath: string;
}

/**
 * Decide how this process should run:
 *   - `--daemon` flag → daemon mode (caller starts the daemon).
 *   - active lockfile  → shim mode reusing the running daemon's socket.
 *   - stale/no lockfile → clear stale entry and fork a new daemon, then shim.
 *
 * `spawnDaemon` is injected so tests can stub the fork. In production
 * `main.ts` supplies a callback that detaches a child process and
 * polls the lockfile until the new daemon registers.
 */
export async function resolveStartup(
  options: ResolveStartupOptions
): Promise<ResolveStartupResult> {
  if (options.argv.includes("--daemon")) {
    return { mode: "daemon", socketPath: options.socketPath };
  }
  const active = await options.lockfile.readActive();
  if (active) {
    return { mode: "shim", socketPath: active.socketPath };
  }
  // Clear any stale lockfile (read-but-not-active means dead PID).
  const stale = await options.lockfile.read();
  if (stale) await options.lockfile.clear();
  const spawned = await options.spawnDaemon();
  return { mode: "shim", socketPath: spawned.socketPath };
}
