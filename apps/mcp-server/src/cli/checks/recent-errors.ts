import type { Check } from "../doctor";

export const createRecentErrorsCheck = (
  logPath: string,
  readFile: (path: string) => Promise<string>
): Check => ({
  name: "recent-errors",
  async run() {
    let raw: string;
    try {
      raw = await readFile(logPath);
    } catch {
      return { status: "ok" as const, detail: "no daemon log present" };
    }
    const lines = raw.split("\n").slice(-50);
    const errors = lines.filter((l) => l.includes('"level":"error"'));
    if (errors.length === 0) {
      return { status: "ok" as const, detail: "no recent errors" };
    }
    return {
      status: "warn" as const,
      detail: `${errors.length} recent error(s); last: ${errors[errors.length - 1].slice(0, 200)}`,
    };
  },
});
