import { describe, expect, it } from "vitest";
import { formatDoctorJson, formatDoctorText, runDoctor } from "../doctor";

describe("runDoctor", () => {
  it("runs all checks in parallel and aggregates results", async () => {
    const checks = [
      { name: "a", run: async () => ({ status: "ok" as const, detail: "fine" }) },
      { name: "b", run: async () => ({ status: "warn" as const, detail: "meh" }) },
      { name: "c", run: async () => ({ status: "error" as const, detail: "bad" }) },
    ];
    const report = await runDoctor({ checks });
    expect(report.results).toHaveLength(3);
    expect(report.summary).toEqual({ ok: 1, warn: 1, error: 1 });
  });

  it("captures thrown errors as error status", async () => {
    const checks = [
      {
        name: "boom",
        run: async () => {
          throw new Error("kaboom");
        },
      },
    ];
    const report = await runDoctor({ checks });
    expect(report.results[0].status).toBe("error");
    expect(report.results[0].detail).toMatch(/kaboom/);
  });
});

describe("formatDoctorJson", () => {
  it("emits a stable JSON shape", () => {
    const report = {
      summary: { ok: 1, warn: 0, error: 0 },
      results: [{ name: "x", status: "ok" as const, detail: "ok" }],
    };
    const json = JSON.parse(formatDoctorJson(report));
    expect(json).toEqual(report);
  });
});

describe("formatDoctorText", () => {
  it("includes a status glyph per check", () => {
    const text = formatDoctorText({
      summary: { ok: 1, warn: 1, error: 1 },
      results: [
        { name: "a", status: "ok", detail: "fine" },
        { name: "b", status: "warn", detail: "meh" },
        { name: "c", status: "error", detail: "bad" },
      ],
    });
    expect(text).toMatch(/✓.*a/);
    expect(text).toMatch(/!.*b/);
    expect(text).toMatch(/✗.*c/);
  });
});
