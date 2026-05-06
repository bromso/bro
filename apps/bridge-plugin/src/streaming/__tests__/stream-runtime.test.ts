import { FigmaFake } from "@repo/figma-adapter/testing";
import type { ChunkEnvelope } from "@repo/protocol";
import { describe, expect, it, vi } from "vitest";
import { StreamRuntime } from "../stream-runtime";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const itemFor = (name: string, collection = "Brand") => ({
  name,
  collection,
  resolvedType: "FLOAT" as const,
  valuesByMode: { Default: 1 },
});

const seedBrand = (figma: FigmaFake) => {
  figma.__seedCollections([{ id: "vc1", name: "Brand", modes: [{ id: "m1", name: "Default" }] }]);
};

describe("StreamRuntime", () => {
  it("opens a session and applies a chunk", async () => {
    const figma = new FigmaFake();
    seedBrand(figma);
    const runtime = new StreamRuntime({ figma, logger: noopLogger });

    runtime.openSession({ sessionId: "ses_a", total: 2, atomic: false });
    const ack = await runtime.applyChunk({
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 2,
      items: [itemFor("a"), itemFor("b")],
      idempotencyKey: "ses_a:0",
    });
    expect(ack.applied).toBe(2);
    expect(ack.failed).toBe(0);
  });

  it("returns the cached ack for a duplicate chunk (idempotency)", async () => {
    const figma = new FigmaFake();
    seedBrand(figma);
    const runtime = new StreamRuntime({ figma, logger: noopLogger });
    runtime.openSession({ sessionId: "ses_a", total: 1, atomic: false });

    const chunk: ChunkEnvelope = {
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 1,
      items: [itemFor("a")],
      idempotencyKey: "ses_a:0",
    };
    const ack1 = await runtime.applyChunk(chunk);
    const ack2 = await runtime.applyChunk(chunk);
    expect(ack1.applied).toBe(1);
    expect(ack2.applied).toBe(1);
    const status = runtime.getStatus("ses_a");
    expect(status?.applied).toBe(1);
  });

  it("captures per-item failures in the ack", async () => {
    const figma = new FigmaFake();
    seedBrand(figma);
    // setValueForMode would otherwise reject because the spy returns variables
    // that the FigmaFake's internal map doesn't know about.
    vi.spyOn(figma, "setValueForMode").mockResolvedValue();
    const createSpy = vi.spyOn(figma, "createVariable");
    createSpy.mockImplementationOnce(async (args) => ({
      id: "v1",
      name: args.name,
      resolvedType: args.resolvedType,
      valuesByMode: {},
    }));
    createSpy.mockRejectedValueOnce(new Error("name conflict"));
    createSpy.mockImplementationOnce(async (args) => ({
      id: "v3",
      name: args.name,
      resolvedType: args.resolvedType,
      valuesByMode: {},
    }));

    const runtime = new StreamRuntime({ figma, logger: noopLogger });
    runtime.openSession({ sessionId: "ses_a", total: 3, atomic: false });
    const ack = await runtime.applyChunk({
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 3,
      items: [itemFor("a"), itemFor("dup"), itemFor("c")],
      idempotencyKey: "ses_a:0",
    });
    expect(ack.applied).toBe(2);
    expect(ack.failed).toBe(1);
    expect(ack.failedDetails[0]).toMatchObject({
      index: 1,
      reason: expect.stringMatching(/conflict/),
    });
  });

  it("atomic mode rolls back created variables on failure", async () => {
    const figma = new FigmaFake();
    seedBrand(figma);
    vi.spyOn(figma, "setValueForMode").mockResolvedValue();
    const deleteSpy = vi.spyOn(figma, "deleteVariableAsync").mockResolvedValue();
    const runtime = new StreamRuntime({ figma, logger: noopLogger });
    runtime.openSession({ sessionId: "ses_a", total: 3, atomic: true });

    let count = 0;
    vi.spyOn(figma, "createVariable").mockImplementation(async (args) => {
      if (++count === 2) throw new Error("conflict");
      return {
        id: `v${count}`,
        name: args.name,
        resolvedType: args.resolvedType,
        valuesByMode: {},
      };
    });

    const ack = await runtime.applyChunk({
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 3,
      items: [itemFor("a"), itemFor("b"), itemFor("c")],
      idempotencyKey: "ses_a:0",
    });
    expect(ack.failed).toBeGreaterThanOrEqual(1);
    expect(deleteSpy).toHaveBeenCalledWith("v1");
  });

  it("rejects out-of-order chunks with E_STREAM_OUT_OF_ORDER", async () => {
    const figma = new FigmaFake();
    seedBrand(figma);
    const runtime = new StreamRuntime({ figma, logger: noopLogger });
    runtime.openSession({ sessionId: "ses_a", total: 5, atomic: false });
    await runtime.applyChunk({
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 5,
      items: [itemFor("a")],
      idempotencyKey: "ses_a:0",
    });
    await expect(
      runtime.applyChunk({
        kind: "chunk",
        id: "req_1",
        sessionId: "ses_a",
        seq: 2,
        total: 5,
        items: [itemFor("c")],
        idempotencyKey: "ses_a:2",
      })
    ).rejects.toThrow(/out of order/i);
  });

  it("throws E_STREAM_SESSION_NOT_FOUND for an unknown session", async () => {
    const figma = new FigmaFake();
    const runtime = new StreamRuntime({ figma, logger: noopLogger });
    await expect(
      runtime.applyChunk({
        kind: "chunk",
        id: "req_1",
        sessionId: "ses_missing",
        seq: 0,
        total: 1,
        items: [itemFor("a")],
        idempotencyKey: "ses_missing:0",
      })
    ).rejects.toThrow(/session not found/i);
  });

  it("rejects chunks after a rollback with E_STREAM_OUT_OF_ORDER", async () => {
    const figma = new FigmaFake();
    seedBrand(figma);
    vi.spyOn(figma, "setValueForMode").mockResolvedValue();
    vi.spyOn(figma, "deleteVariableAsync").mockResolvedValue();
    const runtime = new StreamRuntime({ figma, logger: noopLogger });
    runtime.openSession({ sessionId: "ses_a", total: 4, atomic: true });

    let count = 0;
    vi.spyOn(figma, "createVariable").mockImplementation(async (args) => {
      if (++count === 1) throw new Error("first failure");
      return {
        id: `v${count}`,
        name: args.name,
        resolvedType: args.resolvedType,
        valuesByMode: {},
      };
    });

    await runtime.applyChunk({
      kind: "chunk",
      id: "req_1",
      sessionId: "ses_a",
      seq: 0,
      total: 4,
      items: [itemFor("a"), itemFor("b")],
      idempotencyKey: "ses_a:0",
    });
    await expect(
      runtime.applyChunk({
        kind: "chunk",
        id: "req_2",
        sessionId: "ses_a",
        seq: 1,
        total: 4,
        items: [itemFor("c")],
        idempotencyKey: "ses_a:1",
      })
    ).rejects.toThrow(/rolled back/i);
  });

  it("getStatus returns null for an unknown session and tracks closeSession", () => {
    const figma = new FigmaFake();
    const runtime = new StreamRuntime({ figma, logger: noopLogger });
    expect(runtime.getStatus("nope")).toBeNull();
    runtime.openSession({ sessionId: "ses_a", total: 1, atomic: false });
    runtime.closeSession("ses_a");
    expect(runtime.getStatus("ses_a")?.completed).toBe(true);
  });
});
