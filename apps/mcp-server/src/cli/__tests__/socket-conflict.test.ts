import { describe, expect, it, vi } from "vitest";
import { createSocketConflictCheck } from "../checks/socket-conflict";

describe("socket-conflict", () => {
  it("ok when socket connects and lockfile pid matches", async () => {
    const check = createSocketConflictCheck({
      socketPath: "/tmp/x.sock",
      probeConnect: vi.fn().mockResolvedValue({ ok: true }),
      lockfileActive: vi.fn().mockResolvedValue({ pid: 1234 }),
    });
    const r = await check.run();
    expect(r.status).toBe("ok");
  });

  it("error when path accepts but lockfile is missing", async () => {
    const check = createSocketConflictCheck({
      socketPath: "/tmp/x.sock",
      probeConnect: vi.fn().mockResolvedValue({ ok: true }),
      lockfileActive: vi.fn().mockResolvedValue(null),
    });
    const r = await check.run();
    expect(r.status).toBe("error");
    expect(r.detail).toContain("E_PORT_CONFLICT");
  });

  it("ok when path is unbound (no daemon)", async () => {
    const check = createSocketConflictCheck({
      socketPath: "/tmp/x.sock",
      probeConnect: vi.fn().mockResolvedValue({ ok: false, code: "ENOENT" }),
      lockfileActive: vi.fn().mockResolvedValue(null),
    });
    const r = await check.run();
    expect(r.status).toBe("ok");
  });
});
