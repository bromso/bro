import { describe, expect, it } from "vitest";
import { type Check, type Fixer, formatDoctorJson, formatDoctorText, runDoctor } from "../doctor";

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

describe("runDoctor with fixers", () => {
  it("does not invoke fixers when applyFixes is false", async () => {
    let fixerCalls = 0;
    const check: Check = {
      name: "x",
      run: async () => ({ status: "error" as const, detail: "broken" }),
    };
    const fixer: Fixer = {
      run: async () => {
        fixerCalls++;
        return { detail: "fixed" };
      },
    };
    const report = await runDoctor({
      checks: [check],
      fixers: new Map([["x", fixer]]),
      applyFixes: false,
    });
    expect(fixerCalls).toBe(0);
    expect(report.results[0].fix).toBeUndefined();
  });

  it("does not invoke fixer when check is ok", async () => {
    let fixerCalls = 0;
    const check: Check = {
      name: "x",
      run: async () => ({ status: "ok" as const, detail: "fine" }),
    };
    const fixer: Fixer = {
      run: async () => {
        fixerCalls++;
        return { detail: "fixed" };
      },
    };
    const report = await runDoctor({
      checks: [check],
      fixers: new Map([["x", fixer]]),
      applyFixes: true,
    });
    expect(fixerCalls).toBe(0);
    expect(report.results[0].fix).toBeUndefined();
  });

  it("does not attach fix when no fixer is registered for a failing check", async () => {
    const check: Check = {
      name: "x",
      run: async () => ({ status: "error" as const, detail: "broken" }),
    };
    const report = await runDoctor({
      checks: [check],
      fixers: new Map(),
      applyFixes: true,
    });
    expect(report.results[0].fix).toBeUndefined();
  });

  it("invokes fixer and re-runs the check, attaching fix outcome", async () => {
    let runCount = 0;
    const check: Check = {
      name: "x",
      run: async () => {
        runCount++;
        return runCount === 1
          ? { status: "error" as const, detail: "broken" }
          : { status: "ok" as const, detail: "fine" };
      },
    };
    const fixer: Fixer = {
      run: async () => ({ detail: "fixed broken thing" }),
    };
    const report = await runDoctor({
      checks: [check],
      fixers: new Map([["x", fixer]]),
      applyFixes: true,
    });
    expect(runCount).toBe(2);
    const fix = report.results[0].fix;
    expect(fix?.attempted).toBe(true);
    if (fix?.attempted) {
      expect(fix.detail).toBe("fixed broken thing");
      expect(fix.recheckStatus).toBe("ok");
      expect(fix.recheckDetail).toBe("fine");
    }
    // Initial result still reflects pre-fix state.
    expect(report.results[0].status).toBe("error");
    expect(report.results[0].detail).toBe("broken");
  });

  it("captures fixer failures as attempted=false with reason", async () => {
    const check: Check = {
      name: "x",
      run: async () => ({ status: "error" as const, detail: "broken" }),
    };
    const fixer: Fixer = {
      run: async () => {
        throw new Error("fixer crashed");
      },
    };
    const report = await runDoctor({
      checks: [check],
      fixers: new Map([["x", fixer]]),
      applyFixes: true,
    });
    const fix = report.results[0].fix;
    expect(fix?.attempted).toBe(false);
    if (fix && !fix.attempted) {
      expect(fix.reason).toMatch(/fixer crashed/);
    }
  });

  it("re-checked status that remains non-ok still surfaces in fix outcome", async () => {
    const check: Check = {
      name: "x",
      run: async () => ({ status: "warn" as const, detail: "still warn" }),
    };
    const fixer: Fixer = {
      run: async () => ({ detail: "tried" }),
    };
    const report = await runDoctor({
      checks: [check],
      fixers: new Map([["x", fixer]]),
      applyFixes: true,
    });
    const fix = report.results[0].fix;
    expect(fix?.attempted).toBe(true);
    if (fix?.attempted) {
      expect(fix.recheckStatus).toBe("warn");
    }
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

  it("includes fix outcome in JSON when present", () => {
    const report = {
      summary: { ok: 1, warn: 0, error: 0 },
      results: [
        {
          name: "x",
          status: "error" as const,
          detail: "broken",
          fix: {
            attempted: true as const,
            detail: "fixed",
            recheckStatus: "ok" as const,
            recheckDetail: "fine",
          },
        },
      ],
    };
    const json = JSON.parse(formatDoctorJson(report));
    expect(json.results[0].fix.attempted).toBe(true);
    expect(json.results[0].fix.recheckStatus).toBe("ok");
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

  it("renders an applied fix outcome", () => {
    const text = formatDoctorText({
      summary: { ok: 1, warn: 0, error: 0 },
      results: [
        {
          name: "daemon-liveness",
          status: "error",
          detail: "stale lockfile",
          fix: {
            attempted: true,
            detail: "stale lockfile cleared",
            recheckStatus: "warn",
            recheckDetail: "no daemon running",
          },
        },
      ],
    });
    expect(text).toMatch(/fix: stale lockfile cleared/);
    expect(text).toMatch(/after fix:.*warn.*no daemon running/);
  });

  it("renders a skipped fix outcome", () => {
    const text = formatDoctorText({
      summary: { ok: 0, warn: 0, error: 1 },
      results: [
        {
          name: "x",
          status: "error",
          detail: "broken",
          fix: { attempted: false, reason: "fixer crashed" },
        },
      ],
    });
    expect(text).toMatch(/fix skipped: fixer crashed/);
  });
});
