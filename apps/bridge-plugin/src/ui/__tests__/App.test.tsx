// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";

describe("App status panel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders 'disconnected' by default", () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId("status-panel").textContent).toContain("disconnected");
  });
  it("updates to 'connected' on a postMessage", () => {
    const { getByTestId } = render(<App />);
    fireEvent(
      window,
      new MessageEvent("message", {
        data: { pluginMessage: { kind: "connection-state", state: "connected" } },
      })
    );
    expect(getByTestId("status-panel").textContent).toContain("connected");
  });

  it("ignores unrelated postMessages (wrong kind, missing state, null data)", () => {
    const { getByTestId } = render(<App />);
    // Wrong kind.
    fireEvent(
      window,
      new MessageEvent("message", {
        data: { pluginMessage: { kind: "other", state: "connected" } },
      })
    );
    // Missing state.
    fireEvent(
      window,
      new MessageEvent("message", {
        data: { pluginMessage: { kind: "connection-state" } },
      })
    );
    // Null data.
    fireEvent(window, new MessageEvent("message", { data: null }));
    // Empty data.
    fireEvent(window, new MessageEvent("message", { data: {} }));
    // State remains 'disconnected'.
    expect(getByTestId("status-panel").textContent).toContain("disconnected");
  });
});
