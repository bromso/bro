import { describe, expect, it } from "vitest";
import { pickIpcTransport } from "../pick-ipc-transport";

describe("pickIpcTransport", () => {
  it("returns a Unix socket path on darwin", () => {
    const r = pickIpcTransport({ platform: "darwin", homeDir: "/Users/me" });
    expect(r.socketPath).toBe("/Users/me/.figma-mcp/daemon.sock");
  });

  it("returns a named-pipe path on win32", () => {
    const r = pickIpcTransport({ platform: "win32", username: "alice" });
    expect(r.socketPath).toBe("\\\\.\\pipe\\figma-mcp-alice");
  });

  it("returns Unix path on linux", () => {
    const r = pickIpcTransport({ platform: "linux", homeDir: "/home/me" });
    expect(r.socketPath).toBe("/home/me/.figma-mcp/daemon.sock");
  });
});
