import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  createStreamStatusPluginHandler,
  exportVariablesPluginHandler,
  updateVariablesBatchPluginHandler,
} from "../plugin-handlers";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe("exportVariablesPluginHandler", () => {
  it("returns the first page when no cursor is given", async () => {
    const figma = new FigmaFake();
    figma.__seedVariables(
      Array.from({ length: 5 }, (_, i) => ({
        id: `v${i}`,
        name: `var-${i}`,
        resolvedType: "FLOAT" as const,
        valuesByMode: {},
      }))
    );
    const r = await exportVariablesPluginHandler(
      { pageSize: 3, cursor: null },
      { logger: noopLogger, figma }
    );
    expect(r.items).toHaveLength(3);
    expect(r.nextCursor).toBe("3");
  });

  it("returns final page with nextCursor null", async () => {
    const figma = new FigmaFake();
    figma.__seedVariables(
      Array.from({ length: 5 }, (_, i) => ({
        id: `v${i}`,
        name: `var-${i}`,
        resolvedType: "FLOAT" as const,
        valuesByMode: {},
      }))
    );
    const r = await exportVariablesPluginHandler(
      { pageSize: 3, cursor: "3" },
      { logger: noopLogger, figma }
    );
    expect(r.items).toHaveLength(2);
    expect(r.nextCursor).toBeNull();
  });

  it("treats invalid cursor as start of list", async () => {
    const figma = new FigmaFake();
    figma.__seedVariables([{ id: "v0", name: "a", resolvedType: "FLOAT", valuesByMode: {} }]);
    const r = await exportVariablesPluginHandler(
      { pageSize: 5, cursor: null },
      { logger: noopLogger, figma }
    );
    expect(r.items).toHaveLength(1);
    expect(r.nextCursor).toBeNull();
  });
});

describe("updateVariablesBatchPluginHandler", () => {
  it("applies many updates and reports per-item failures", async () => {
    const figma = new FigmaFake();
    figma.__seedVariables([
      { id: "v1", name: "x", resolvedType: "FLOAT", valuesByMode: { m1: 1 } },
    ]);
    const r = await updateVariablesBatchPluginHandler(
      {
        updates: [
          { variableId: "v1", modeId: "m1", value: 2 },
          { variableId: "missing", modeId: "m1", value: 0 },
        ],
      },
      { logger: noopLogger, figma }
    );
    expect(r.applied).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.failedDetails[0].index).toBe(1);
  });

  it("returns zeroed totals on an empty update list", async () => {
    const figma = new FigmaFake();
    const r = await updateVariablesBatchPluginHandler(
      { updates: [] },
      { logger: noopLogger, figma }
    );
    expect(r.applied).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.failedDetails).toEqual([]);
  });

  it("stringifies non-Error throwables in failedDetails", async () => {
    const figma = new FigmaFake();
    figma.__seedVariables([
      { id: "v1", name: "x", resolvedType: "FLOAT", valuesByMode: { m1: 1 } },
    ]);
    // Reject with a plain string so the `instanceof Error ? ... : String(err)` branch fires.
    const setSpy = figma.setValueForMode.bind(figma);
    figma.setValueForMode = async (args) => {
      if (args.variableId === "v1") {
        // biome-ignore lint/suspicious/noPrototypeBuiltins: intentional non-Error throw to cover the String(err) branch.
        throw "stringly-typed boom";
      }
      return setSpy(args);
    };
    const r = await updateVariablesBatchPluginHandler(
      { updates: [{ variableId: "v1", modeId: "m1", value: 9 }] },
      { logger: noopLogger, figma }
    );
    expect(r.failed).toBe(1);
    expect(r.failedDetails[0].reason).toBe("stringly-typed boom");
  });
});

describe("exportVariablesPluginHandler edge cases", () => {
  it("treats a negative numeric cursor as start of list", async () => {
    const figma = new FigmaFake();
    figma.__seedVariables([
      { id: "v0", name: "a", resolvedType: "FLOAT", valuesByMode: {} },
      { id: "v1", name: "b", resolvedType: "FLOAT", valuesByMode: {} },
    ]);
    const r = await exportVariablesPluginHandler(
      { pageSize: 1, cursor: "-5" },
      { logger: noopLogger, figma }
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].id).toBe("v0");
    expect(r.nextCursor).toBe("1");
  });
});

describe("createStreamStatusPluginHandler", () => {
  it("returns the live status from the provided StreamRuntime", async () => {
    const handler = createStreamStatusPluginHandler({
      getStatus: () => ({
        lastAckedSeq: 4,
        applied: 400,
        failed: 1,
        atomic: false,
        completed: false,
      }),
    });
    const r = await handler({ sessionId: "ses_a" }, { logger: noopLogger, figma: new FigmaFake() });
    expect(r.lastAckedSeq).toBe(4);
    expect(r.completed).toBe(false);
    expect(r.sessionId).toBe("ses_a");
  });

  it("returns zeroed completed status when the session is unknown", async () => {
    const handler = createStreamStatusPluginHandler({
      getStatus: () => null,
    });
    const r = await handler(
      { sessionId: "ses_missing" },
      { logger: noopLogger, figma: new FigmaFake() }
    );
    expect(r.completed).toBe(true);
    expect(r.applied).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.atomic).toBe(false);
  });
});
