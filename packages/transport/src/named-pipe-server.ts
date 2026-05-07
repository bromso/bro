// packages/transport/src/named-pipe-server.ts
// Re-uses node:net `createServer().listen(pipePath)` — Node accepts
// `\\.\pipe\<name>` natively on win32 and falls back to a Unix socket
// on other platforms (which is why we still need pick-ipc-transport).
export { UnixSocketServerTransport as NamedPipeServerTransport } from "./unix-socket-server";
