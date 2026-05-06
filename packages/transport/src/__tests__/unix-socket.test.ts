import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestEnvelope } from "@repo/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { UnixSocketClientTransport } from "../unix-socket-client";
import { UnixSocketServerTransport } from "../unix-socket-server";

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
  const dir = await mkdtemp(join(tmpdir(), "mcp-sock-"));
  socketPath = join(dir, "daemon.sock");
});

describe("UnixSocketServerTransport <-> UnixSocketClientTransport", () => {
  it("client -> server envelope round-trip", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    await client.send(sample);
    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received[0]).toEqual(sample);

    await client.close();
    await server.close();
  });

  it("server -> client envelope round-trip", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const client = await UnixSocketClientTransport.connect({ path: socketPath });

    const onClient: unknown[] = [];
    client.onMessage((env) => onClient.push(env));

    await waitFor(() => (server.connectedClientCount > 0 ? true : undefined));
    await server.broadcast(sample);
    await waitFor(() => (onClient.length > 0 ? onClient : undefined));
    expect(onClient[0]).toEqual(sample);

    await client.close();
    await server.close();
  });

  it("server accepts multiple clients (multiplexed)", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const a = await UnixSocketClientTransport.connect({ path: socketPath });
    const b = await UnixSocketClientTransport.connect({ path: socketPath });

    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    await a.send(sample);
    await b.send({ ...sample, id: "req_2" });

    await waitFor(() => (received.length === 2 ? received : undefined));
    expect(received).toHaveLength(2);

    await a.close();
    await b.close();
    await server.close();
  });

  it("client handles server close gracefully", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const client = await UnixSocketClientTransport.connect({ path: socketPath });

    let disconnected = false;
    client.onDisconnect(() => {
      disconnected = true;
    });

    await server.close();
    await waitFor(() => (disconnected ? true : undefined));
    expect(disconnected).toBe(true);
  });

  it("drops malformed messages without dropping the connection", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    // Reach into the underlying socket and write a junk frame, then a valid one.
    // (Implementation detail: `client.__rawWrite` is exposed for tests only.)
    (client as unknown as { __rawWrite(data: string): void }).__rawWrite("not json\n");
    await client.send(sample);

    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received).toHaveLength(1);

    await client.close();
    await server.close();
  });
});
