import { FigmaFake } from "@repo/figma-adapter/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installConsoleCapture } from "../console-patch";
import {
  clearConsolePluginHandler,
  consoleStatusPluginHandler,
  getConsoleErrorsPluginHandler,
  getConsoleLogsPluginHandler,
  getConsoleWarningsPluginHandler,
  queryConsolePluginHandler,
} from "../plugin-handlers";
import { ConsoleStore } from "../store";

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const ctx = () => ({ logger: noopLogger, figma: new FigmaFake() });

afterEach(() => {
  // reset the module-level store ref between tests
  installConsoleCapture({
    store: new ConsoleStore(),
    target: { log() {}, warn() {}, error() {}, info() {} },
  });
});

describe("getConsoleLogsPluginHandler", () => {
  it("returns recent entries via the active store", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "warn", message: "b", timestamp: 2 });
    const out = await getConsoleLogsPluginHandler({}, ctx());
    expect(out.entries).toHaveLength(2);
  });

  it("respects limit", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    for (let i = 0; i < 5; i++) {
      store.append({ level: "log", message: `m${i}`, timestamp: i });
    }
    const out = await getConsoleLogsPluginHandler({ limit: 2 }, ctx());
    expect(out.entries.map((e) => e.message)).toEqual(["m3", "m4"]);
  });
});

describe("clearConsolePluginHandler", () => {
  it("empties the active store and reports cleared count", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    for (let i = 0; i < 3; i++) {
      store.append({ level: "log", message: `m${i}`, timestamp: i });
    }
    const out = await clearConsolePluginHandler({}, ctx());
    expect(out.cleared).toBe(3);
    expect(store.getStatus().total).toBe(0);
  });
});

describe("getConsoleErrorsPluginHandler", () => {
  it("returns only error-level entries", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "error", message: "b", timestamp: 2 });
    store.append({ level: "warn", message: "c", timestamp: 3 });
    const out = await getConsoleErrorsPluginHandler({}, ctx());
    expect(out.entries.map((e) => e.message)).toEqual(["b"]);
  });
});

describe("getConsoleWarningsPluginHandler", () => {
  it("returns only warn-level entries", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    store.append({ level: "warn", message: "a", timestamp: 1 });
    store.append({ level: "log", message: "b", timestamp: 2 });
    const out = await getConsoleWarningsPluginHandler({}, ctx());
    expect(out.entries.map((e) => e.message)).toEqual(["a"]);
  });
});

describe("queryConsolePluginHandler", () => {
  it("filters entries by regex pattern", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    store.append({ level: "log", message: "user 42 logged in", timestamp: 1 });
    store.append({ level: "log", message: "boot done", timestamp: 2 });
    store.append({ level: "log", message: "user 7 logged in", timestamp: 3 });
    const out = await queryConsolePluginHandler({ pattern: "^user \\d+ logged in$" }, ctx());
    expect(out.entries.map((e) => e.message)).toEqual(["user 42 logged in", "user 7 logged in"]);
  });

  it("respects limit", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    for (let i = 0; i < 5; i++) {
      store.append({ level: "log", message: `match ${i}`, timestamp: i });
    }
    const out = await queryConsolePluginHandler({ pattern: "match", limit: 2 }, ctx());
    expect(out.entries).toHaveLength(2);
  });

  it("rejects invalid regex with E_PROTOCOL_INVALID-style throw", async () => {
    const store = new ConsoleStore();
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    await expect(queryConsolePluginHandler({ pattern: "[unclosed" }, ctx())).rejects.toThrow(
      /regex/i
    );
  });
});

describe("consoleStatusPluginHandler", () => {
  it("returns total/byLevel/droppedCount from the store", async () => {
    const store = new ConsoleStore({ capacity: 2 });
    installConsoleCapture({ store, target: { log() {}, warn() {}, error() {}, info() {} } });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "log", message: "b", timestamp: 2 });
    store.append({ level: "warn", message: "c", timestamp: 3 });
    store.append({ level: "error", message: "d", timestamp: 4 });
    const out = await consoleStatusPluginHandler({}, ctx());
    expect(out.total).toBe(2);
    expect(out.byLevel.warn).toBe(1);
    expect(out.byLevel.error).toBe(1);
    expect(out.droppedCount).toBe(2);
  });
});

describe("requireStore guard", () => {
  it("throws E_CONSOLE_STORE_UNINSTALLED when no store is active", async () => {
    vi.resetModules();
    const fresh = await import("../plugin-handlers");
    await expect(fresh.getConsoleLogsPluginHandler({}, ctx())).rejects.toThrow(
      "E_CONSOLE_STORE_UNINSTALLED"
    );
  });
});
