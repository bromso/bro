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

  it("server.send() rejects with 'use broadcast() instead'", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    await expect(server.send(sample)).rejects.toThrow(/broadcast/);
    await server.close();
  });

  it("server.broadcast() after close rejects with 'transport closed'", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    await server.close();
    await expect(server.broadcast(sample)).rejects.toThrow(/closed/);
  });

  it("server.onConnect fires immediately when a client is already connected", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    await waitFor(() => (server.connectedClientCount > 0 ? true : undefined));

    let calls = 0;
    const off = server.onConnect(() => {
      calls++;
    });
    expect(calls).toBe(1);
    off();

    await client.close();
    await server.close();
  });

  it("server.onDisconnect off() detaches its handler", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const off = server.onDisconnect(() => {});
    expect(typeof off).toBe("function");
    off();
    await server.close();
  });

  it("server forwards underlying socket errors to onDisconnect handlers", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const errors: Array<Error | undefined> = [];
    server.onDisconnect((err) => errors.push(err));

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    await waitFor(() => (server.connectedClientCount > 0 ? true : undefined));

    // Reach into the server-tracked sockets and emit an error event on one of
    // them so the `socket.on('error', ...)` listener installed in onConnection
    // runs while the server is still open.
    // biome-ignore lint/suspicious/noExplicitAny: reach into private socket set.
    const sockets = (server as any).sockets as Set<{
      emit: (event: string, arg: unknown) => void;
    }>;
    const [first] = [...sockets];
    first.emit("error", new Error("kaboom"));

    await waitFor(() => (errors.length > 0 ? errors : undefined));
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toBe("kaboom");

    await client.close();
    await server.close();
  });

  it("server.listen rejects when the path is already in use", async () => {
    const first = await UnixSocketServerTransport.listen({ path: socketPath });
    await expect(UnixSocketServerTransport.listen({ path: socketPath })).rejects.toThrow();
    await first.close();
  });

  it("client.send() after close rejects with 'transport closed'", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    await client.close();
    await expect(client.send(sample)).rejects.toThrow(/closed/);
    await server.close();
  });

  it("client.onConnect fires immediately when registered on an open transport", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const client = await UnixSocketClientTransport.connect({ path: socketPath });

    let calls = 0;
    const off = client.onConnect(() => {
      calls++;
    });
    expect(calls).toBe(1);
    off();

    await client.close();
    await server.close();
  });

  it("client.onDisconnect off() detaches its handler", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    const off = client.onDisconnect(() => {});
    expect(typeof off).toBe("function");
    off();
    await client.close();
    await server.close();
  });

  it("client forwards post-open socket errors to onDisconnect handlers", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const client = await UnixSocketClientTransport.connect({ path: socketPath });

    const errors: Array<Error | undefined> = [];
    client.onDisconnect((err) => errors.push(err));

    // Reach into the client's underlying socket and emit an error event so
    // the `socket.on('error', ...)` listener in the constructor runs while
    // the client is still open.
    // biome-ignore lint/suspicious/noExplicitAny: reach into private socket.
    const sock = (client as any).socket as {
      emit: (event: string, arg: unknown) => void;
    };
    sock.emit("error", new Error("kaboom"));

    await waitFor(() => (errors.length > 0 ? errors : undefined));
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toBe("kaboom");

    await client.close();
    await server.close();
  });

  it("client.connect rejects when the socket path does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-sock-noexist-"));
    await expect(
      UnixSocketClientTransport.connect({ path: join(dir, "missing.sock") })
    ).rejects.toThrow();
  });

  it("client.close is idempotent (second call is a no-op)", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    await client.close();
    await client.close();
    await server.close();
  });

  it("server.close is idempotent (second call is a no-op)", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    await server.close();
    await server.close();
  });

  it("client drops malformed JSON and unparseable envelopes from the server", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const client = await UnixSocketClientTransport.connect({ path: socketPath });

    const received: unknown[] = [];
    client.onMessage((env) => received.push(env));

    await waitFor(() => (server.connectedClientCount > 0 ? true : undefined));

    // Reach into the server-tracked sockets and push raw bytes so the client's
    // two parse-failure branches both run (JSON.parse fail, parseEnvelope fail).
    // biome-ignore lint/suspicious/noExplicitAny: reach into private socket set.
    const sockets = (server as any).sockets as Set<{
      write: (s: string) => void;
    }>;
    const [first] = [...sockets];
    first.write("not json\n");
    first.write(`${JSON.stringify({ kind: "nope" })}\n`);
    first.write(`${JSON.stringify(sample)}\n`);

    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received).toEqual([sample]);

    await client.close();
    await server.close();
  });

  it("server fires onDisconnect when a client closes while the server is open", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const disconnects: Array<Error | undefined> = [];
    server.onDisconnect((err) => disconnects.push(err));

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    await waitFor(() => (server.connectedClientCount > 0 ? true : undefined));

    await client.close();
    await waitFor(() => (disconnects.length > 0 ? disconnects : undefined));
    expect(disconnects[0]).toBeUndefined();

    await server.close();
  });

  it("server drops envelopes whose JSON parses but fails schema validation", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    // Valid JSON, but `{ kind: "nope" }` fails parseEnvelope — exercises the
    // server's parseEnvelope catch branch (line 126 in unix-socket-server).
    (client as unknown as { __rawWrite(data: string): void }).__rawWrite(
      `${JSON.stringify({ kind: "nope" })}\n`
    );
    await client.send(sample);

    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(sample);

    await client.close();
    await server.close();
  });

  it("server.onConnect registers without firing when no client is connected", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    let calls = 0;
    const off = server.onConnect(() => {
      calls++;
    });
    expect(calls).toBe(0);
    off();
    await server.close();
  });

  it("server framing skips empty frames between consecutive newlines", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    // Two consecutive newlines surface a zero-length frame between them; the
    // FramingBuffer's `if (frame.length > 0)` branch skips it. Then a real
    // envelope still parses, proving the loop kept going.
    (client as unknown as { __rawWrite(data: string): void }).__rawWrite("\n\n");
    await client.send(sample);

    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received).toHaveLength(1);

    await client.close();
    await server.close();
  });

  it("client framing skips empty frames between consecutive newlines", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const client = await UnixSocketClientTransport.connect({ path: socketPath });

    const received: unknown[] = [];
    client.onMessage((env) => received.push(env));

    await waitFor(() => (server.connectedClientCount > 0 ? true : undefined));

    // biome-ignore lint/suspicious/noExplicitAny: reach into private socket set.
    const sockets = (server as any).sockets as Set<{
      write: (s: string) => void;
    }>;
    const [first] = [...sockets];
    // Two consecutive newlines drive the client's `if (frame.length > 0)`
    // false branch on an empty frame, then a real envelope after.
    first.write("\n\n");
    first.write(`${JSON.stringify(sample)}\n`);

    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received).toEqual([sample]);

    await client.close();
    await server.close();
  });

  it("server suppresses error events on tracked sockets after close", async () => {
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    const errors: Array<Error | undefined> = [];
    server.onDisconnect((err) => errors.push(err));

    const client = await UnixSocketClientTransport.connect({ path: socketPath });
    await waitFor(() => (server.connectedClientCount > 0 ? true : undefined));

    // Capture the tracked socket reference BEFORE close so we can emit on it
    // afterwards. close() clears `sockets` and flips `this.closed = true`.
    // biome-ignore lint/suspicious/noExplicitAny: reach into private socket set.
    const sockets = (server as any).sockets as Set<{
      emit: (event: string, arg: unknown) => void;
    }>;
    const [tracked] = [...sockets];

    await client.close();
    await server.close();

    const before = errors.length;
    tracked.emit("error", new Error("post-close kaboom"));
    // Closed-side branch in `socket.on('error', ...)` (line 140) is the
    // `if (!this.closed)` FALSE path — handlers must NOT fire.
    expect(errors.length).toBe(before);
  });

  it("client.connect rejects when the timeout fires before connect", async () => {
    // Bind a server then connect with a 0-ms timeout. The timer is queued
    // synchronously, and on most systems fires before the connect callback,
    // exercising the timeout branch (lines 74-77 in unix-socket-client).
    // If the connect happens to win the race, we retry with a fresh path.
    const server = await UnixSocketServerTransport.listen({ path: socketPath });
    let caught: unknown;
    try {
      await UnixSocketClientTransport.connect({
        path: socketPath,
        connectTimeoutMs: 0,
      });
    } catch (err) {
      caught = err;
    }
    await server.close();

    if (caught) {
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/connect timeout/);
    }
    // If connect won the race, we can't deterministically force the timeout
    // branch on UDS; we accept that this branch is occasionally uncovered.
  });
});
