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
    expect(closeReason).toBeGreaterThan(0);

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
});
