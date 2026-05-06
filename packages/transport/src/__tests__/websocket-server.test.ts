import type { RequestEnvelope } from "@repo/protocol";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { WebSocketServerTransport } from "../websocket-server";

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

describe("WebSocketServerTransport", () => {
  it("accepts a single client and round-trips an envelope", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const port = server.port;

    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.send(JSON.stringify(sample));

    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received[0]).toEqual(sample);

    client.close();
    await server.close();
  });

  it("delivers an envelope from server to client", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const port = server.port;

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => client.once("open", () => r()));
    const clientReceived: unknown[] = [];
    client.on("message", (raw) => clientReceived.push(JSON.parse(String(raw))));

    // Wait for the server-side connection to register.
    await waitFor(() => (server.isConnected ? true : undefined));
    await server.send(sample);

    await waitFor(() => (clientReceived.length > 0 ? clientReceived : undefined));
    expect(clientReceived[0]).toEqual(sample);

    client.close();
    await server.close();
  });

  it("rejects a second connection while one is active", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const port = server.port;

    const a = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => a.once("open", () => r()));

    const b = new WebSocket(`ws://127.0.0.1:${port}`);
    const closeReason = await new Promise<number>((r) => b.once("close", (code) => r(code)));
    expect(closeReason).toBe(4000);

    a.close();
    await server.close();
  });

  it("drops malformed messages and stays connected", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const port = server.port;

    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.send("not json");
    client.send(JSON.stringify({ kind: "nope" }));
    client.send(JSON.stringify(sample));

    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(sample);

    client.close();
    await server.close();
  });

  it("fires onDisconnect when the client closes", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const port = server.port;

    let disconnected = false;
    server.onDisconnect(() => {
      disconnected = true;
    });

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.close();

    await waitFor(() => (disconnected ? true : undefined));
    expect(disconnected).toBe(true);

    await server.close();
  });

  it("rejects listen when the port is already bound", async () => {
    const first = await WebSocketServerTransport.listen({ port: 0 });
    // Attempt to bind a second server on the same port — `wss.once('error')`
    // fires and rejects with an EADDRINUSE-style error.
    await expect(WebSocketServerTransport.listen({ port: first.port })).rejects.toThrow();
    await first.close();
  });

  it("fires onConnect immediately when a client is already connected", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const port = server.port;

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => client.once("open", () => r()));
    await waitFor(() => (server.isConnected ? true : undefined));

    let calls = 0;
    const off = server.onConnect(() => {
      calls++;
    });
    expect(calls).toBe(1);
    off();

    client.close();
    await server.close();
  });

  it("rejects send when no client is connected", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    await expect(
      server.send({
        kind: "request",
        id: "no_client",
        sourceClientId: "test",
        tool: "ping",
        args: {},
      })
    ).rejects.toThrow(/no client/);
    await server.close();
  });

  it("rejects send after close", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    await server.close();
    await expect(
      server.send({
        kind: "request",
        id: "closed",
        sourceClientId: "test",
        tool: "ping",
        args: {},
      })
    ).rejects.toThrow(/closed/i);
  });

  it("forwards underlying ws errors to onDisconnect handlers", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const port = server.port;

    const errors: Array<Error | undefined> = [];
    server.onDisconnect((err) => errors.push(err));

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => client.once("open", () => r()));
    await waitFor(() => (server.isConnected ? true : undefined));

    // Reach into the server-held socket and emit an error event so the
    // `ws.on('error', ...)` listener registered by onConnection runs.
    // biome-ignore lint/suspicious/noExplicitAny: reach into private socket.
    const wsRef = (server as any).socket as { emit: (event: string, arg: unknown) => void };
    wsRef.emit("error", new Error("kaboom"));

    await waitFor(() => (errors.length > 0 ? errors : undefined));
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toBe("kaboom");

    client.close();
    await server.close();
  });
});
