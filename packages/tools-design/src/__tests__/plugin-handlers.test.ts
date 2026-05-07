import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  createEllipsePluginHandler,
  createFramePluginHandler,
  createLinePluginHandler,
  createRectanglePluginHandler,
  createTextPluginHandler,
  setTextContentPluginHandler,
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

describe("createTextPluginHandler", () => {
  it("creates a text node with default fontSize 16", async () => {
    const figma = new FigmaFake();
    const out = await createTextPluginHandler(
      { content: "hi", fontSize: 16 },
      { logger: noopLogger, figma }
    );
    expect(out.type).toBe("TEXT");
    const node = (await figma.getNodeById({ nodeId: out.nodeId })) as { characters: string };
    expect(node.characters).toBe("hi");
  });

  it("uses an explicit fontSize", async () => {
    const figma = new FigmaFake();
    const out = await createTextPluginHandler(
      { content: "hi", fontSize: 24 },
      { logger: noopLogger, figma }
    );
    const node = (await figma.getNodeById({ nodeId: out.nodeId })) as { fontSize: number };
    expect(node.fontSize).toBe(24);
  });
});

describe("setTextContentPluginHandler", () => {
  it("rewrites the text characters", async () => {
    const figma = new FigmaFake();
    const t = await figma.createText({ content: "old" });
    await setTextContentPluginHandler(
      { nodeId: t.id, characters: "new" },
      { logger: noopLogger, figma }
    );
    const after = (await figma.getNodeById({ nodeId: t.id })) as { characters: string };
    expect(after.characters).toBe("new");
  });

  it("rejects non-text nodes", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    await expect(
      setTextContentPluginHandler({ nodeId: r.id, characters: "x" }, { logger: noopLogger, figma })
    ).rejects.toThrow(/text/i);
  });
});
