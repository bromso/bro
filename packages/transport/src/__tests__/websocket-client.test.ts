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

  it("drops malformed JSON and unparseable envelopes", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${server.port}`,
      WebSocketCtor: WebSocket,
    });

    const received: unknown[] = [];
    client.onMessage((env) => received.push(env));

    // Send invalid JSON and a structurally-invalid envelope from the server's
    // raw socket so the client's two parse-failure branches both execute.
    await waitFor(() => (server.isConnected ? true : undefined));
    // biome-ignore lint/suspicious/noExplicitAny: reach into private socket for raw send.
    const rawServerSocket = (server as any).socket as { send: (s: string) => void };
    rawServerSocket.send("not json");
    rawServerSocket.send(JSON.stringify({ kind: "nope" }));
    rawServerSocket.send(JSON.stringify(sample));

    await waitFor(() => (received.length > 0 ? received : undefined));
    expect(received).toEqual([sample]);

    await client.close();
    await server.close();
  });

  it("fires onDisconnect when the underlying socket closes", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${server.port}`,
      WebSocketCtor: WebSocket,
    });

    let disconnected = false;
    const off = client.onDisconnect(() => {
      disconnected = true;
    });
    expect(typeof off).toBe("function");

    // Closing the server forces the client socket to close from the remote
    // side, exercising the close-event path that fires onDisconnect.
    await server.close();
    await waitFor(() => (disconnected ? true : undefined));
    expect(disconnected).toBe(true);

    off();
    await client.close();
  });

  it("fires onConnect immediately when registered on a connected transport", async () => {
    const server = await WebSocketServerTransport.listen({ port: 0 });
    const client = await WebSocketClientTransport.connect({
      url: `ws://127.0.0.1:${server.port}`,
      WebSocketCtor: WebSocket,
    });

    let calls = 0;
    const off = client.onConnect(() => {
      calls++;
    });
    expect(calls).toBe(1);
    off();

    await client.close();
    await server.close();
  });

  it("rejects connect when the socket emits error before open", async () => {
    // A fake WebSocket whose constructor emits an `error` event before any
    // `open` event. This drives the static `connect` error branch.
    type Listener = (arg: unknown) => void;
    class FakeWS {
      readyState = 0;
      private readonly handlers: Record<string, Listener[]> = {};
      constructor(_url: string) {
        // Fire the error asynchronously so listeners attach first.
        queueMicrotask(() => {
          for (const h of this.handlers.error ?? []) h(new Error("boom"));
        });
      }
      send(_data: string): void {}
      close(): void {}
      addEventListener(event: string, handler: Listener): void {
        const list = this.handlers[event] ?? [];
        list.push(handler);
        this.handlers[event] = list;
      }
    }

    await expect(
      WebSocketClientTransport.connect({
        url: "ws://example.invalid",
        WebSocketCtor: FakeWS as unknown as typeof WebSocket,
        connectTimeoutMs: 5_000,
      })
    ).rejects.toThrow(/boom/);
  });

  it("forwards post-open socket errors to onDisconnect handlers", async () => {
    // Fake socket where we can manually fire `open`, then `error`. Drives
    // the post-connect error branch in the constructor (lines 68-69).
    type Listener = (arg: unknown) => void;
    const handlers: Record<string, Listener[]> = {};
    const fire = (event: string, arg?: unknown) => {
      for (const h of handlers[event] ?? []) h(arg);
    };
    const register = (event: string, handler: Listener) => {
      const list = handlers[event] ?? [];
      list.push(handler);
      handlers[event] = list;
    };
    class FakeWS {
      readyState = 0;
      constructor(_url: string) {
        queueMicrotask(() => fire("open"));
      }
      send(_data: string): void {}
      close(): void {
        fire("close");
      }
      addEventListener(event: string, handler: Listener): void {
        register(event, handler);
      }
    }

    const client = await WebSocketClientTransport.connect({
      url: "ws://example.invalid",
      WebSocketCtor: FakeWS as unknown as typeof WebSocket,
      connectTimeoutMs: 1_000,
    });

    const errors: Array<Error | undefined> = [];
    client.onDisconnect((err) => errors.push(err));

    fire("error", new Error("post-open boom"));
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toBe("post-open boom");

    await client.close();
  });

  it("rejects connect when the timeout fires before open", async () => {
    // Fake constructor that never opens, never errors — just sits there
    // until the connect timer expires and rejects.
    let closeCalls = 0;
    class FakeWS {
      readyState = 0;
      send(_data: string): void {}
      close(): void {
        closeCalls++;
      }
      addEventListener(_event: string, _handler: (arg: unknown) => void): void {}
    }

    await expect(
      WebSocketClientTransport.connect({
        url: "ws://example.invalid",
        WebSocketCtor: FakeWS as unknown as typeof WebSocket,
        connectTimeoutMs: 5,
      })
    ).rejects.toThrow(/connect timeout/);
    expect(closeCalls).toBeGreaterThan(0);
  });
});
