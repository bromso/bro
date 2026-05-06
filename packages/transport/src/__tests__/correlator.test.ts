import {
  ErrorCode,
  type ErrorEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
} from "@repo/protocol";
import { describe, expect, it, vi } from "vitest";
import { Correlator } from "../correlator";
import { createInMemoryTransportPair } from "../testing";

const baseRequest = (id: string): RequestEnvelope => ({
  kind: "request",
  id,
  sourceClientId: "test",
  tool: "ping",
  args: {},
});

describe("Correlator", () => {
  it("resolves when the matching response arrives", async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new Correlator(client);

    server.onMessage(async (env) => {
      if (env.kind !== "request") return;
      const response: ResponseEnvelope = {
        kind: "response",
        id: env.id,
        ok: true,
        result: { pong: true },
      };
      await server.send(response);
    });

    const result = await correlator.request(baseRequest("req_1"));
    expect(result).toEqual({ pong: true });
  });

  it("rejects with a typed error when an error envelope arrives", async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new Correlator(client);

    server.onMessage(async (env) => {
      if (env.kind !== "request") return;
      const err: ErrorEnvelope = {
        kind: "error",
        id: env.id,
        ok: false,
        code: ErrorCode.E_FIGMA_NODE_NOT_FOUND,
        category: "figma",
        message: "Node 1:23 was deleted",
      };
      await server.send(err);
    });

    await expect(correlator.request(baseRequest("req_2"))).rejects.toMatchObject({
      code: ErrorCode.E_FIGMA_NODE_NOT_FOUND,
      category: "figma",
    });
  });

  it("times out after the configured deadline", async () => {
    vi.useFakeTimers();
    const [client] = createInMemoryTransportPair();
    const correlator = new Correlator(client, { timeoutMs: 50 });

    const promise = correlator.request(baseRequest("req_3"));
    vi.advanceTimersByTime(51);

    await expect(promise).rejects.toMatchObject({
      code: ErrorCode.E_TRANSPORT_TIMEOUT,
    });
    vi.useRealTimers();
  });

  it("cancels via AbortSignal", async () => {
    const [client] = createInMemoryTransportPair();
    const correlator = new Correlator(client);
    const ac = new AbortController();

    const promise = correlator.request(baseRequest("req_4"), { signal: ac.signal });
    ac.abort();

    await expect(promise).rejects.toThrow(/abort/i);
  });

  it("does not resolve a request twice if a duplicate response arrives", async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new Correlator(client);

    let serverSent = 0;
    server.onMessage(async (env) => {
      if (env.kind !== "request") return;
      const response: ResponseEnvelope = {
        kind: "response",
        id: env.id,
        ok: true,
        result: serverSent++,
      };
      await server.send(response);
      // Send a second time on purpose — duplicate.
      await server.send(response);
    });

    const result = await correlator.request(baseRequest("req_5"));
    expect(result).toBe(0);
    // No throw, no second resolution.
  });

  it("delivers the right response when many requests are in flight", async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new Correlator(client);

    server.onMessage(async (env) => {
      if (env.kind !== "request") return;
      const response: ResponseEnvelope = {
        kind: "response",
        id: env.id,
        ok: true,
        result: env.id,
      };
      await server.send(response);
    });

    const results = await Promise.all([
      correlator.request(baseRequest("req_a")),
      correlator.request(baseRequest("req_b")),
      correlator.request(baseRequest("req_c")),
    ]);
    expect(results).toEqual(["req_a", "req_b", "req_c"]);
  });

  it("ignores responses for unknown ids without crashing", async () => {
    const [client, server] = createInMemoryTransportPair();
    new Correlator(client);

    await server.send({
      kind: "response",
      id: "ghost",
      ok: true,
      result: null,
    });

    // No assertion needed — the test passes if no error is thrown.
  });

  it("does not send the envelope when the signal is already aborted", async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new Correlator(client);
    const seenByServer: unknown[] = [];
    server.onMessage((env) => seenByServer.push(env));

    const ac = new AbortController();
    ac.abort();

    const promise = correlator.request(baseRequest("req_pre"), { signal: ac.signal });
    await expect(promise).rejects.toThrow(/abort/i);
    // Allow the in-memory pair's microtask to flush.
    await Promise.resolve();
    await Promise.resolve();
    expect(seenByServer).toEqual([]);
  });

  it("removes the abort listener once the request settles", async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new Correlator(client);

    server.onMessage(async (env) => {
      if (env.kind !== "request") return;
      const response: ResponseEnvelope = {
        kind: "response",
        id: env.id,
        ok: true,
        result: 1,
      };
      await server.send(response);
    });

    const ac = new AbortController();
    // Spy on removeEventListener to verify cleanup detaches.
    const removeSpy = vi.spyOn(ac.signal, "removeEventListener");

    await correlator.request(baseRequest("req_settle"), { signal: ac.signal });

    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("throws synchronously on a duplicate request id", async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new Correlator(client);
    // Hold the first request open by never replying.
    server.onMessage(() => {});

    // Don't await — the first request stays pending so the id is in the map.
    void correlator.request(baseRequest("dup_id"));
    await Promise.resolve();

    await expect(correlator.request(baseRequest("dup_id"))).rejects.toThrow(/duplicate request id/);
  });

  it("rejects when the underlying transport.send fails after registration", async () => {
    const [client] = createInMemoryTransportPair();
    // After the request is registered in `pending`, force `transport.send`
    // to reject — exercises the `.catch` cleanup branch at the bottom of
    // `request`.
    const sendErr = new Error("send blew up");
    vi.spyOn(client, "send").mockRejectedValueOnce(sendErr);
    const correlator = new Correlator(client);

    await expect(correlator.request(baseRequest("send_fail"))).rejects.toBe(sendErr);
  });

  it("does not arm a timer when timeoutMs is zero", async () => {
    const [client, server] = createInMemoryTransportPair();
    const correlator = new Correlator(client, { timeoutMs: 0 });

    server.onMessage(async (env) => {
      if (env.kind !== "request") return;
      await server.send({
        kind: "response",
        id: env.id,
        ok: true,
        result: "ok",
      });
    });

    await expect(correlator.request(baseRequest("no_timer"), { timeoutMs: 0 })).resolves.toBe("ok");
  });
});
