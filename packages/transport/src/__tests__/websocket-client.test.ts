import type { RequestEnvelope } from "@repo/protocol";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { WebSocketClientTransport } from "../websocket-client";
import { WebSocketServerTransport } from "../websocket-server";

const sample: RequestEnvelope = {
  kind: "request",
  id: "req_1",
  sourceClientId: "client",
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

describe("WebSocketClientTransport", () => {
  it("connects to a server and sends an envelope", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const received: unknown[] = [];
    server.onMessage((env) => received.push(env));

    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${server.port}`,
      WebSocketCtor: WebSocket,
    });

    await client.send(sample);
    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received[0]).toEqual(sample);

    await client.close();
    await server.close();
  });

  it("receives envelopes from the server", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });

    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${server.port}`,
      WebSocketCtor: WebSocket,
    });

    const received: unknown[] = [];
    client.onMessage((env) => received.push(env));

    await waitFor(() => (server.isConnected ? true : undefined));
    await server.send(sample);
    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received[0]).toEqual(sample);

    await client.close();
    await server.close();
  });

  it("rejects connect() when the server is unreachable", async () => {
    await expect(
      WebSocketClientTransport.connect({
        url: "ws://127.0.0.1:1",
        WebSocketCtor: WebSocket,
        connectTimeoutMs: 100,
      })
    ).rejects.toThrow();
  });

  it("rejects send after close", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${server.port}`,
      WebSocketCtor: WebSocket,
    });
    await client.close();
    await expect(client.send(sample)).rejects.toThrow(/closed/i);
    await server.close();
  });
});
