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

export interface Fixer {
  /** Best-effort attempt; throws on unrecoverable failure. */
  readonly run: () => Promise<{ detail: string }>;
}

export type FixOutcome =
  | {
      readonly attempted: true;
      readonly detail: string;
      /** Status of the check AFTER the fix ran. */
      readonly recheckStatus: CheckStatus;
      readonly recheckDetail: string;
    }
  | { readonly attempted: false; readonly reason: string };

export interface CheckResultWithFix extends CheckResult {
  /** Present only when --fix was on AND the check was non-ok AND a fixer was registered. */
  readonly fix?: FixOutcome;
}

export interface DoctorReport {
  readonly summary: { ok: number; warn: number; error: number };
  readonly results: ReadonlyArray<CheckResultWithFix>;
}

export interface RunDoctorOptions {
  readonly checks: ReadonlyArray<Check>;
  readonly fixers?: ReadonlyMap<string, Fixer>;
  readonly applyFixes?: boolean;
}

async function runOne(check: Check): Promise<CheckResult> {
  try {
    const r = await check.run();
    return { name: check.name, status: r.status, detail: r.detail };
  } catch (err) {
    return {
      name: check.name,
      status: "error",
      detail: String(err instanceof Error ? err.message : err),
    };
  }
}

export async function runDoctor(options: RunDoctorOptions): Promise<DoctorReport> {
  const initial: CheckResult[] = await Promise.all(options.checks.map((c) => runOne(c)));

  const results: CheckResultWithFix[] = await Promise.all(
    initial.map(async (result, idx): Promise<CheckResultWithFix> => {
      if (!options.applyFixes || result.status === "ok") return result;
      const fixer = options.fixers?.get(result.name);
      if (!fixer) return result;
      try {
        const { detail } = await fixer.run();
        const recheck = await runOne(options.checks[idx]);
        return {
          ...result,
          fix: {
            attempted: true,
            detail,
            recheckStatus: recheck.status,
            recheckDetail: recheck.detail,
          },
        };
      } catch (err) {
        return {
          ...result,
          fix: {
            attempted: false,
            reason: String(err instanceof Error ? err.message : err),
          },
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
  const lines = report.results.map((r) => {
    const head = `  ${glyph(r.status)} ${r.name.padEnd(24)} ${r.detail}`;
    if (!r.fix) return head;
    if (r.fix.attempted) {
      const recheckGlyph = glyph(r.fix.recheckStatus);
      return `${head}\n      → fix: ${r.fix.detail}\n      → after fix: ${recheckGlyph} ${r.fix.recheckStatus} ${r.fix.recheckDetail}`;
    }
    return `${head}\n      → fix skipped: ${r.fix.reason}`;
  });
  const summary = `\nSummary: ${report.summary.ok} ok, ${report.summary.warn} warn, ${report.summary.error} error`;
  return `${lines.join("\n")}${summary}`;
}
