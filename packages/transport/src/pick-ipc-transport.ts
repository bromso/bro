import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { UnixSocketClientTransport } from "./unix-socket-client";
import { UnixSocketServerTransport } from "./unix-socket-server";

export type IpcPlatform = "darwin" | "linux" | "win32";

export interface IpcTransportPair {
  readonly socketPath: string;
  readonly Client: typeof UnixSocketClientTransport;
  readonly Server: typeof UnixSocketServerTransport;
}

export interface PickIpcTransportOptions {
  readonly platform: IpcPlatform;
  readonly homeDir?: string;
  readonly username?: string;
}

export function pickIpcTransport(options: PickIpcTransportOptions): IpcTransportPair {
  const home = options.homeDir ?? homedir();
  const user = options.username ?? userInfo().username;
  const socketPath =
    options.platform === "win32"
      ? `\\\\.\\pipe\\figma-mcp-${user}`
      : join(home, ".figma-mcp", "daemon.sock");
  return {
    socketPath,
    Client: UnixSocketClientTransport,
    Server: UnixSocketServerTransport,
  };
}
