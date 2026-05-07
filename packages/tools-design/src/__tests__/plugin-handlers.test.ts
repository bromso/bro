import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  createEllipsePluginHandler,
  createFramePluginHandler,
  createLinePluginHandler,
  createRectanglePluginHandler,
} from "../plugin-handlers";

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

describe("createRectanglePluginHandler", () => {
  it("creates a rectangle via the adapter and returns nodeId/type", async () => {
    const figma = new FigmaFake();
    const out = await createRectanglePluginHandler(
      { width: 100, height: 100 },
      { logger: noopLogger, figma }
    );
    expect(out.type).toBe("RECTANGLE");
    expect(out.nodeId).toMatch(/^r/);
    const node = await figma.getNodeById({ nodeId: out.nodeId });
    expect(node?.type).toBe("RECTANGLE");
  });
});

describe("createFramePluginHandler", () => {
  it("creates a FRAME with width/height/name", async () => {
    const figma = new FigmaFake();
    const out = await createFramePluginHandler(
      { width: 200, height: 120, name: "Hero" },
      { logger: noopLogger, figma }
    );
    expect(out.type).toBe("FRAME");
    const node = await figma.getNodeById({ nodeId: out.nodeId });
    expect(node?.width).toBe(200);
    expect(node?.height).toBe(120);
  });
});

describe("createEllipsePluginHandler", () => {
  it("creates an ELLIPSE", async () => {
    const figma = new FigmaFake();
    const out = await createEllipsePluginHandler(
      { width: 80, height: 80 },
      { logger: noopLogger, figma }
    );
    expect(out.type).toBe("ELLIPSE");
  });
});

describe("createLinePluginHandler", () => {
  it("creates a LINE", async () => {
    const figma = new FigmaFake();
    const out = await createLinePluginHandler(
      { x1: 0, y1: 0, x2: 100, y2: 0 },
      { logger: noopLogger, figma }
    );
    expect(out.type).toBe("LINE");
  });
});
