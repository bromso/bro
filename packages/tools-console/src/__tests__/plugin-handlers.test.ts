import { FigmaFake } from "@repo/figma-adapter/testing";
import { afterEach, describe, expect, it } from "vitest";
import { installConsoleCapture } from "../console-patch";
import {
  clearConsolePluginHandler,
  getConsoleErrorsPluginHandler,
  getConsoleLogsPluginHandler,
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
