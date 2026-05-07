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
});
