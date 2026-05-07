import { describe, expect, it } from "vitest";
import { ConsoleStore } from "../store";

describe("ConsoleStore.append", () => {
  it("retains entries in append order", () => {
    const store = new ConsoleStore({ capacity: 100 });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "warn", message: "b", timestamp: 2 });
    expect(store.getRecent({ limit: 10 }).map((e) => e.message)).toEqual(["a", "b"]);
  });

  it("drops oldest entries when over capacity", () => {
    const store = new ConsoleStore({ capacity: 3 });
    for (let i = 0; i < 5; i++) {
      store.append({ level: "log", message: `m${i}`, timestamp: i });
    }
    expect(store.getRecent({ limit: 10 }).map((e) => e.message)).toEqual(["m2", "m3", "m4"]);
  });

  it("counts dropped entries", () => {
    const store = new ConsoleStore({ capacity: 2 });
    for (let i = 0; i < 5; i++) {
      store.append({ level: "log", message: `m${i}`, timestamp: i });
    }
    expect(store.getStatus().droppedCount).toBe(3);
  });
});

describe("ConsoleStore.getRecent", () => {
  it("filters by levels when provided", () => {
    const store = new ConsoleStore({ capacity: 100 });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "error", message: "b", timestamp: 2 });
    store.append({ level: "warn", message: "c", timestamp: 3 });
    const result = store.getRecent({ levels: ["error", "warn"], limit: 10 });
    expect(result.map((e) => e.message)).toEqual(["b", "c"]);
  });

  it("limit truncates to the most recent N", () => {
    const store = new ConsoleStore({ capacity: 100 });
    for (let i = 0; i < 5; i++) store.append({ level: "log", message: `m${i}`, timestamp: i });
    const result = store.getRecent({ limit: 2 });
    expect(result.map((e) => e.message)).toEqual(["m3", "m4"]);
  });
});

describe("ConsoleStore.clear", () => {
  it("empties the buffer and resets droppedCount", () => {
    const store = new ConsoleStore({ capacity: 2 });
    for (let i = 0; i < 5; i++) store.append({ level: "log", message: `m${i}`, timestamp: i });
    store.clear();
    expect(store.getRecent({ limit: 10 })).toEqual([]);
    expect(store.getStatus()).toEqual({
      total: 0,
      byLevel: { log: 0, warn: 0, error: 0, info: 0 },
      droppedCount: 0,
    });
  });
});

describe("ConsoleStore.getStatus", () => {
  it("counts entries by level", () => {
    const store = new ConsoleStore({ capacity: 100 });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "log", message: "b", timestamp: 2 });
    store.append({ level: "warn", message: "c", timestamp: 3 });
    store.append({ level: "error", message: "d", timestamp: 4 });
    expect(store.getStatus()).toEqual({
      total: 4,
      byLevel: { log: 2, warn: 1, error: 1, info: 0 },
      droppedCount: 0,
    });
  });
});

describe("ConsoleStore.getSinceCursor", () => {
  it("returns entries appended after the cursor + nextCursor", () => {
    const store = new ConsoleStore({ capacity: 100 });
    store.append({ level: "log", message: "a", timestamp: 1 });
    store.append({ level: "log", message: "b", timestamp: 2 });
    const first = store.getSinceCursor({ cursor: null });
    expect(first.entries.map((e) => e.message)).toEqual(["a", "b"]);
    store.append({ level: "log", message: "c", timestamp: 3 });
    const second = store.getSinceCursor({ cursor: first.nextCursor });
    expect(second.entries.map((e) => e.message)).toEqual(["c"]);
  });

  it("returns nextCursor='-1' for an empty buffer with null cursor", () => {
    const store = new ConsoleStore();
    const result = store.getSinceCursor({ cursor: null });
    expect(result.entries).toEqual([]);
    expect(result.nextCursor).toBe("-1");
  });

  it("preserves the supplied cursor when buffer is empty", () => {
    const store = new ConsoleStore();
    const result = store.getSinceCursor({ cursor: "42" });
    expect(result.entries).toEqual([]);
    expect(result.nextCursor).toBe("42");
  });
});
