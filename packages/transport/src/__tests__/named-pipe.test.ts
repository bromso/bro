import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestEnvelope } from "@repo/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { NamedPipeClientTransport } from "../named-pipe-client";
import { NamedPipeServerTransport } from "../named-pipe-server";

const sample: RequestEnvelope = {
  kind: "request",
  id: "req_1",
  sourceClientId: "test",
  tool: "ping",
  args: {},
};

const waitFor = <T>(fn: () => T | undefined, timeoutMs = 1000): Promise<T> =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const v = fn();
      if (v !== undefined) return resolve(v);
      if (Date.now() - start > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, 10);
    };
    tick();
  });

let socketPath: string;

beforeEach(async () => {
  // CI exercises this on POSIX via a Unix socket path; on Windows the same
  // code uses `\\.\pipe\<name>`. The aliases are intentional re-exports —
  // this test verifies the API surface roundtrips end-to-end.
  const dir = await mkdtemp(join(tmpdir(), "mcp-pipe-"));
  socketPath = join(dir, "daemon.sock");
});

describe("NamedPipeServerTransport <-> NamedPipeClientTransport", () => {
  it("client -> server envelope round-trip", async () => {
    const server = await NamedPipeServerTransport.listen({ path: socketPath });
    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = await NamedPipeClientTransport.connect({ path: socketPath });
    await client.send(sample);
    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received[0]).toEqual(sample);

    await client.close();
    await server.close();
  });

  it("server -> client envelope round-trip", async () => {
    const server = await NamedPipeServerTransport.listen({ path: socketPath });
    const client = await NamedPipeClientTransport.connect({ path: socketPath });

    const onClient: unknown[] = [];
    client.onMessage((env) => onClient.push(env));

    await waitFor(() => (server.connectedClientCount > 0 ? true : undefined));
    await server.broadcast(sample);
    await waitFor(() => (onClient.length > 0 ? onClient : undefined));
    expect(onClient[0]).toEqual(sample);

    await client.close();
    await server.close();
  });
});
