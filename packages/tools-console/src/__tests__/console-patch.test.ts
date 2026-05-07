import { describe, expect, it } from "vitest";
import { getActiveStore, installConsoleCapture } from "../console-patch";
import { ConsoleStore } from "../store";

interface ConsoleLike {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
}

describe("installConsoleCapture", () => {
  it("forwards console.log → store.append('log')", () => {
    const store = new ConsoleStore({ capacity: 10 });
    const fakeConsole: ConsoleLike = {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {},
    };
    installConsoleCapture({ store, target: fakeConsole, now: () => 1234 });
    fakeConsole.log("hello");
    expect(store.getRecent({ limit: 10 })).toEqual([
      { level: "log", message: "hello", timestamp: 1234 },
    ]);
  });

  it("preserves the original console behavior (no swallowing)", () => {
    let original = "";
    const store = new ConsoleStore();
    const target = {
      log: (m: string) => {
        original = m;
      },
      warn: () => {},
      error: () => {},
      info: () => {},
    };
    installConsoleCapture({ store, target, now: () => 0 });
    target.log("hi");
    expect(original).toBe("hi");
  });

  it("getActiveStore returns the most recently installed store", () => {
    const a = new ConsoleStore();
    const target: ConsoleLike = {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {},
    };
    installConsoleCapture({ store: a, target, now: () => 0 });
    expect(getActiveStore()).toBe(a);
  });

  it("serializes object args via util-style join", () => {
    const store = new ConsoleStore();
    const target: ConsoleLike = {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {},
    };
    installConsoleCapture({ store, target, now: () => 0 });
    target.log("user", { id: 1 });
    expect(store.getRecent({ limit: 1 })[0].message).toBe('user {"id":1}');
  });

  it("falls back to globalThis.console when target is omitted", () => {
    const store = new ConsoleStore();
    const captured: string[] = [];
    const original = globalThis.console;
    const fake: ConsoleLike = {
      log: (m: string) => captured.push(m),
      warn: () => {},
      error: () => {},
      info: () => {},
    };
    (globalThis as { console: ConsoleLike }).console = fake;
    try {
      installConsoleCapture({ store, now: () => 7 });
      fake.log("hi");
      expect(store.getRecent({ limit: 1 })).toEqual([
        { level: "log", message: "hi", timestamp: 7 },
      ]);
    } finally {
      (globalThis as { console: typeof original }).console = original;
    }
  });

  it("returns early when no target is available", () => {
    const store = new ConsoleStore();
    const original = globalThis.console;
    (globalThis as unknown as { console: undefined }).console = undefined;
    try {
      // Should not throw, should not append
      installConsoleCapture({ store });
      expect(store.getRecent({})).toEqual([]);
    } finally {
      (globalThis as { console: typeof original }).console = original;
    }
  });

  it("uses Date.now when now is omitted", () => {
    const store = new ConsoleStore();
    const target: ConsoleLike = {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {},
    };
    const before = Date.now();
    installConsoleCapture({ store, target });
    target.log("ping");
    const ts = store.getRecent({ limit: 1 })[0].timestamp;
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  it("safeStringify falls back to String() on circular references", () => {
    const store = new ConsoleStore();
    const target: ConsoleLike = {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {},
    };
    installConsoleCapture({ store, target, now: () => 0 });
    const circular: { self?: unknown } = {};
    circular.self = circular;
    target.log(circular);
    // String({ self: [Circular] }) → "[object Object]"
    expect(store.getRecent({ limit: 1 })[0].message).toBe("[object Object]");
  });
});
