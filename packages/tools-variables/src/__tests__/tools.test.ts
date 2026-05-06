import { describe, expect, it } from "vitest";
import { ExportVariables, ImportVariables, StreamStatus, UpdateVariablesBatch } from "../tools";

describe("tools-variables tool definitions", () => {
  it("ImportVariables is streaming and accepts an inline source", () => {
    expect(ImportVariables.name).toBe("import_variables");
    expect(ImportVariables.streaming).toBe(true);
    const r = ImportVariables.input.safeParse({
      source: {
        kind: "inline",
        items: [
          {
            name: "color/red",
            collection: "Brand",
            resolvedType: "COLOR",
            valuesByMode: { Default: { r: 1, g: 0, b: 0 } },
          },
        ],
      },
      atomic: false,
      chunkSize: 100,
    });
    expect(r.success).toBe(true);
  });

  it("ImportVariables defaults atomic=false and chunkSize=100", () => {
    const r = ImportVariables.input.safeParse({
      source: { kind: "inline", items: [] },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.atomic).toBe(false);
      expect(r.data.chunkSize).toBe(100);
    }
  });

  it("ImportVariables rejects an unknown source kind", () => {
    const r = ImportVariables.input.safeParse({
      source: { kind: "csv", items: [] },
    });
    expect(r.success).toBe(false);
  });

  it("ExportVariables accepts pageSize + cursor", () => {
    expect(ExportVariables.streaming).toBe(false);
    const r = ExportVariables.input.safeParse({ pageSize: 100, cursor: null });
    expect(r.success).toBe(true);
  });

  it("UpdateVariablesBatch accepts an array of updates", () => {
    expect(UpdateVariablesBatch.streaming).toBe(false);
    const r = UpdateVariablesBatch.input.safeParse({
      updates: [{ variableId: "v1", modeId: "m1", value: "#f00" }],
    });
    expect(r.success).toBe(true);
  });

  it("StreamStatus accepts a sessionId", () => {
    const r = StreamStatus.input.safeParse({ sessionId: "ses_a" });
    expect(r.success).toBe(true);
  });

  it("ImportVariables output reports applied/failed totals + sessionId", () => {
    const r = ImportVariables.output.safeParse({
      sessionId: "ses_a",
      total: 10,
      applied: 9,
      failed: 1,
      failedDetails: [{ index: 0, reason: "name conflict" }],
    });
    expect(r.success).toBe(true);
  });

  it("ExportVariables output exposes items + nextCursor", () => {
    const r = ExportVariables.output.safeParse({
      items: [{ id: "v1", name: "x", resolvedType: "FLOAT", valuesByMode: {} }],
      nextCursor: "1",
    });
    expect(r.success).toBe(true);
  });

  it("StreamStatus output reports session progress", () => {
    const r = StreamStatus.output.safeParse({
      sessionId: "ses_a",
      lastAckedSeq: 4,
      applied: 400,
      failed: 1,
      atomic: false,
      completed: false,
    });
    expect(r.success).toBe(true);
  });
});
