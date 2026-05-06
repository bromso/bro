import { FigmaFake } from "@repo/figma-adapter/testing";
import fc from "fast-check";
import { describe, it } from "vitest";
import { StreamRuntime } from "../../../../apps/bridge-plugin/src/streaming/stream-runtime";
import { chunkify } from "../../../../apps/mcp-server/src/streaming/session-manager";

const itemArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  collection: fc.constant("Brand"),
  resolvedType: fc.constant("FLOAT" as const),
  valuesByMode: fc.constant({ Default: 1 }),
});

describe("streaming invariants (property)", () => {
  it("chunkify covers every item exactly once, in order, no gaps", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        fc.integer({ min: 1, max: 100 }),
        (items, size) => {
          const batches = chunkify(items, size);
          const flat = batches.flat();
          if (flat.length !== items.length) return false;
          for (let i = 0; i < items.length; i++) {
            if (flat[i] !== items[i]) return false;
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it("chunkify lengths sum to input length", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 500 }),
        fc.integer({ min: 1, max: 50 }),
        (items, size) => {
          const total = chunkify(items, size).reduce((acc, b) => acc + b.length, 0);
          return total === items.length;
        }
      ),
      { numRuns: 50 }
    );
  });

  it("StreamRuntime: applying the same chunk twice yields the same final state", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(itemArb, { minLength: 1, maxLength: 20 }).filter((arr) => {
          const names = new Set(arr.map((i) => i.name));
          return names.size === arr.length; // unique names
        }),
        async (items) => {
          const figma = new FigmaFake();
          figma.__seedCollections([
            { id: "vc1", name: "Brand", modes: [{ id: "m1", name: "Default" }] },
          ]);
          const runtime = new StreamRuntime({ figma });
          runtime.openSession({ sessionId: "ses_p", total: items.length, atomic: false });
          const chunk = {
            kind: "chunk" as const,
            id: "req",
            sessionId: "ses_p",
            seq: 0,
            total: items.length,
            items,
            idempotencyKey: "ses_p:0",
          };
          const ack1 = await runtime.applyChunk(chunk);
          const ack2 = await runtime.applyChunk(chunk);
          // Idempotency: identical applied count.
          if (ack1.applied !== ack2.applied) return false;
          // No double-creation: variable count equals applied count.
          const vars = await figma.getLocalVariablesAsync();
          return vars.length === ack1.applied;
        }
      ),
      { numRuns: 20 }
    );
  });
});
