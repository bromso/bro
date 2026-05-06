import { describe, expect, it } from "vitest";
import { createImportVariablesServerHandler } from "../import-handler";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe("createImportVariablesServerHandler", () => {
  it("runs the chunk loop with the inline source's items", async () => {
    const acks: number[] = [];
    const transport = {
      async send() {},
      async request<T>(env: unknown): Promise<T> {
        const e = env as { seq: number; items: unknown[] };
        acks.push(e.seq);
        return { applied: e.items.length, failed: 0, failedDetails: [] } as T;
      },
    };
    const handler = createImportVariablesServerHandler({
      buildTransport: () => transport,
    });
    const result = await handler(
      {
        source: {
          kind: "inline",
          items: [
            { name: "a", collection: "Brand", resolvedType: "FLOAT", valuesByMode: { Default: 1 } },
            { name: "b", collection: "Brand", resolvedType: "FLOAT", valuesByMode: { Default: 2 } },
            { name: "c", collection: "Brand", resolvedType: "FLOAT", valuesByMode: { Default: 3 } },
          ],
        },
        atomic: false,
        chunkSize: 2,
      },
      { logger: noopLogger }
    );
    expect(result.total).toBe(3);
    expect(result.applied).toBe(3);
    expect(acks).toEqual([0, 1]);
  });
});
