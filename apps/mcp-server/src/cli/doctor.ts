export type CheckStatus = "ok" | "warn" | "error";

export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface Check {
  readonly name: string;
  readonly run: () => Promise<{ status: CheckStatus; detail: string }>;
}

export interface DoctorReport {
  readonly summary: { ok: number; warn: number; error: number };
  readonly results: ReadonlyArray<CheckResult>;
}

export interface RunDoctorOptions {
  readonly checks: ReadonlyArray<Check>;
}

export async function runDoctor(options: RunDoctorOptions): Promise<DoctorReport> {
  const results: CheckResult[] = await Promise.all(
    options.checks.map(async (c): Promise<CheckResult> => {
      try {
        const r = await c.run();
        return { name: c.name, status: r.status, detail: r.detail };
      } catch (err) {
        return {
          name: c.name,
          status: "error",
          detail: String(err instanceof Error ? err.message : err),
        };
      }
    })
  );
  return {
    summary: results.reduce((acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }), {
      ok: 0,
      warn: 0,
      error: 0,
    }),
    results,
  };
}

export function formatDoctorJson(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatDoctorText(report: DoctorReport): string {
  const glyph = (s: CheckStatus) => (s === "ok" ? "✓" : s === "warn" ? "!" : "✗");
  const lines = report.results.map((r) => `  ${glyph(r.status)} ${r.name.padEnd(24)} ${r.detail}`);
  const summary = `\nSummary: ${report.summary.ok} ok, ${report.summary.warn} warn, ${report.summary.error} error`;
  return `${lines.join("\n")}${summary}`;
}
