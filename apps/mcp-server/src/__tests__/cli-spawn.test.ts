import { spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const main = join(here, "..", "main.ts");

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "cli-spawn-"));
});

describe("cli spawn", () => {
  it("--help prints usage and exits 0", () => {
    const r = spawnSync("bun", ["run", main, "--help"], { encoding: "utf-8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage:/);
    expect(r.stdout).toMatch(/setup/);
    expect(r.stdout).toMatch(/doctor/);
  });

  it("setup --dry-run prints a table without writing", () => {
    const r = spawnSync("bun", ["run", main, "setup", "--dry-run"], {
      encoding: "utf-8",
      env: { ...process.env, HOME: tmp },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Client/);
    expect(r.stdout).toMatch(/would-write/);
  });

  it("doctor --json against a stopped daemon emits a JSON shape with daemon-down", () => {
    const r = spawnSync("bun", ["run", main, "doctor", "--json"], {
      encoding: "utf-8",
      env: { ...process.env, HOME: tmp },
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toHaveProperty("results");
    const daemon = parsed.results.find((c: { name: string }) => c.name === "daemon-liveness");
    expect(daemon.status).not.toBe("ok");
  });

  it("--print-path prints a path string and exits 0", () => {
    const r = spawnSync("bun", ["run", main, "--print-path"], { encoding: "utf-8" });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().length).toBeGreaterThan(0);
    // In dev (running via bun run main.ts) the resolved path may not yet exist
    // because the bridge plugin isn't built. Assert format only.
    expect(r.stdout.trim()).toMatch(/manifest\.json$/);
  });
});
