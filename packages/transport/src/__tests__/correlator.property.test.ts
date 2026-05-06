import {
  ErrorCode,
  type ErrorEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
} from "@repo/protocol";
import fc from "fast-check";
import { describe, it } from "vitest";
import { Correlator } from "../correlator";
import { createInMemoryTransportPair } from "../testing";

const arbId = fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0);

describe("Correlator (property)", () => {
  it("each request resolves exactly once even with duplicate responses", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uniqueArray(arbId, { minLength: 1, maxLength: 20 }), async (ids) => {
        const [client, server] = createInMemoryTransportPair();
        const correlator = new Correlator(client, { timeoutMs: 5_000 });

        server.onMessage(async (env) => {
          if (env.kind !== "request") return;
          const response: ResponseEnvelope = {
            kind: "response",
            id: env.id,
            ok: true,
            result: env.id,
          };
          // Send the same response twice — the Correlator must ignore the dup.
          await server.send(response);
          await server.send(response);
        });

        const results = await Promise.all(
          ids.map((id) =>
            correlator.request<string>({
              kind: "request",
              id,
              sourceClientId: "test",
              tool: "echo",
              args: {},
            } satisfies RequestEnvelope)
          )
        );

        if (results.length !== ids.length) return false;
        for (let i = 0; i < ids.length; i++) {
          if (results[i] !== ids[i]) return false;
        }
        return true;
      }),
      { numRuns: 30 }
    );
  });

  it("interleaved success + error responses route correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(arbId, { minLength: 2, maxLength: 12 }),
        fc.array(fc.boolean(), { minLength: 2, maxLength: 12 }),
        async (ids, errorMask) => {
          const [client, server] = createInMemoryTransportPair();
          const correlator = new Correlator(client, { timeoutMs: 5_000 });

          server.onMessage(async (env) => {
            if (env.kind !== "request") return;
            const idx = ids.indexOf(env.id);
            const isError = errorMask[idx % errorMask.length];
            if (isError) {
              const err: ErrorEnvelope = {
                kind: "error",
                id: env.id,
                ok: false,
                code: ErrorCode.E_FIGMA_UNKNOWN,
                category: "figma",
                message: "fail",
              };
              await server.send(err);
            } else {
              const response: ResponseEnvelope = {
                kind: "response",
                id: env.id,
                ok: true,
                result: env.id,
              };
              await server.send(response);
            }
          });

          const settled = await Promise.allSettled(
            ids.map((id) =>
              correlator.request<string>({
                kind: "request",
                id,
                sourceClientId: "test",
                tool: "echo",
                args: {},
              })
            )
          );

          for (let i = 0; i < ids.length; i++) {
            const isError = errorMask[i % errorMask.length];
            const r = settled[i];
            if (isError && r.status !== "rejected") return false;
            if (!isError && r.status !== "fulfilled") return false;
            if (!isError && r.status === "fulfilled" && r.value !== ids[i]) return false;
          }
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});
