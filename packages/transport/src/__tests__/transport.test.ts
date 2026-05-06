import type { RequestEnvelope } from "@repo/protocol";
import { describe, expect, it } from "vitest";
import { createInMemoryTransportPair } from "../testing";
import type { Transport } from "../transport";

const sampleRequest: RequestEnvelope = {
  kind: "request",
  id: "req_1",
  sourceClientId: "test",
  tool: "ping",
  args: {},
};

describe("Transport (contract)", () => {
  it("delivers a sent envelope to the peer's onMessage handler", async () => {
    const [a, b] = createInMemoryTransportPair();
    const received: unknown[] = [];
    b.onMessage((env) => received.push(env));

    await a.send(sampleRequest);

    expect(received).toEqual([sampleRequest]);
  });

  it("delivers in both directions", async () => {
    const [a, b] = createInMemoryTransportPair();
    const onA: unknown[] = [];
    const onB: unknown[] = [];
    a.onMessage((e) => onA.push(e));
    b.onMessage((e) => onB.push(e));

    await a.send(sampleRequest);
    await b.send({ ...sampleRequest, id: "req_2" });

    expect(onB).toHaveLength(1);
    expect(onA).toHaveLength(1);
  });

  it("fires onConnect once per registered listener", () => {
    const [a] = createInMemoryTransportPair();
    let count = 0;
    a.onConnect(() => {
      count++;
    });
    expect(count).toBe(1);
  });

  it("fires onDisconnect on close", async () => {
    const [a, b] = createInMemoryTransportPair();
    let closed = false;
    b.onDisconnect(() => {
      closed = true;
    });
    await a.close();
    expect(closed).toBe(true);
  });

  it("rejects send after close", async () => {
    const [a] = createInMemoryTransportPair();
    await a.close();
    await expect(a.send(sampleRequest)).rejects.toThrow(/closed/i);
  });

  it("supports multiple onMessage subscribers", async () => {
    const [a, b] = createInMemoryTransportPair();
    const r1: unknown[] = [];
    const r2: unknown[] = [];
    b.onMessage((e) => r1.push(e));
    b.onMessage((e) => r2.push(e));

    await a.send(sampleRequest);

    expect(r1).toEqual([sampleRequest]);
    expect(r2).toEqual([sampleRequest]);
  });

  it("returns an unsubscribe function from onMessage", async () => {
    const [a, b] = createInMemoryTransportPair();
    const r1: unknown[] = [];
    const r2: unknown[] = [];
    const unsub1 = b.onMessage((e) => r1.push(e));
    b.onMessage((e) => r2.push(e));

    await a.send(sampleRequest);
    // Allow the queued microtask to flush.
    await Promise.resolve();
    unsub1();
    await a.send({ ...sampleRequest, id: "req_2" });
    await Promise.resolve();

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(2);
  });

  it("does not deliver messages after close", async () => {
    const [a, b] = createInMemoryTransportPair();
    const received: unknown[] = [];
    b.onMessage((e) => received.push(e));

    // Don't await send — we want the queued microtask to still be pending
    // when close runs, so the guard inside deliver() is the thing under test.
    void a.send(sampleRequest);
    await b.close();
    // Flush any pending microtask from the send above.
    await Promise.resolve();

    expect(received).toEqual([]);
  });

  it("typeof Transport interface", () => {
    const _x: Transport = {} as Transport;
    expect(_x).toBeDefined();
  });
});
