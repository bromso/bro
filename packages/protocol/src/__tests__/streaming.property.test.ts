import fc from "fast-check";
import { describe, it } from "vitest";
import { ChunkEnvelope, isMonotonic } from "../streaming";

describe("streaming chunk invariants (property)", () => {
  it("any sequence of chunks with correct seqs is monotonic", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), (count) => {
        const seqs = Array.from({ length: count }, (_, i) => i);
        return isMonotonic(seqs);
      })
    );
  });

  it("inserting duplicate seq breaks monotonicity", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 99 }),
        (count, dupAt) => {
          if (dupAt >= count) return true;
          const seqs = Array.from({ length: count }, (_, i) => i);
          seqs.splice(dupAt + 1, 0, dupAt);
          return !isMonotonic(seqs);
        }
      )
    );
  });

  it("any well-formed chunk passes schema validation", () => {
    fc.assert(
      fc.property(
        fc.record({
          kind: fc.constant("chunk" as const),
          id: fc.string({ minLength: 1 }),
          sessionId: fc.string({ minLength: 1 }),
          seq: fc.nat(),
          total: fc.integer({ min: 1, max: 100000 }),
          items: fc.array(fc.record({ name: fc.string(), value: fc.string() })),
          idempotencyKey: fc.string({ minLength: 1 }),
        }),
        (chunk) => {
          const r = ChunkEnvelope.safeParse(chunk);
          return r.success === true;
        }
      )
    );
  });
});
