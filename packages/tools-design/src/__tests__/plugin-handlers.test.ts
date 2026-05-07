import { FigmaFake } from "@repo/figma-adapter/testing";
import { describe, expect, it } from "vitest";
import {
  cloneNodePluginHandler,
  createComponentPluginHandler,
  createEllipsePluginHandler,
  createFramePluginHandler,
  createLinePluginHandler,
  createRectanglePluginHandler,
  createTextPluginHandler,
  deleteNodePluginHandler,
  resizeNodePluginHandler,
  setFillPluginHandler,
  setStrokePluginHandler,
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

describe("setFillPluginHandler", () => {
  it("writes the SOLID paint to the node's fills", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    await setFillPluginHandler(
      {
        nodeId: r.id,
        paint: { type: "SOLID", color: { r: 1, g: 0, b: 0 } },
      },
      { logger: noopLogger, figma }
    );
    const node = await figma.getNodeById({ nodeId: r.id });
    expect(node?.fills?.[0]).toEqual({
      type: "SOLID",
      color: { r: 1, g: 0, b: 0 },
    });
  });

  it("rejects on a missing node", async () => {
    const figma = new FigmaFake();
    await expect(
      setFillPluginHandler(
        {
          nodeId: "missing",
          paint: { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
        },
        { logger: noopLogger, figma }
      )
    ).rejects.toThrow(/not found/i);
  });
});

describe("setStrokePluginHandler", () => {
  it("writes paint and weight", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    await setStrokePluginHandler(
      {
        nodeId: r.id,
        paint: { type: "SOLID", color: { r: 0, g: 0, b: 1 } },
        weight: 4,
      },
      { logger: noopLogger, figma }
    );
    const node = await figma.getNodeById({ nodeId: r.id });
    expect(node?.strokes?.[0]?.color).toEqual({ r: 0, g: 0, b: 1 });
    expect(node?.strokeWeight).toBe(4);
  });
});

describe("resizeNodePluginHandler", () => {
  it("resizes a node via the adapter", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    await resizeNodePluginHandler(
      { nodeId: r.id, width: 300, height: 250 },
      { logger: noopLogger, figma }
    );
    const node = await figma.getNodeById({ nodeId: r.id });
    expect(node?.width).toBe(300);
    expect(node?.height).toBe(250);
  });
});

describe("cloneNodePluginHandler", () => {
  it("returns the new node id of the clone", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    const out = await cloneNodePluginHandler({ nodeId: r.id }, { logger: noopLogger, figma });
    expect(out.nodeId).not.toBe(r.id);
    expect((await figma.getNodeById({ nodeId: out.nodeId }))?.type).toBe("RECTANGLE");
  });
});

describe("deleteNodePluginHandler", () => {
  it("deletes the node and reports its id", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    const out = await deleteNodePluginHandler({ nodeId: r.id }, { logger: noopLogger, figma });
    expect(out.nodeId).toBe(r.id);
    expect(await figma.getNodeById({ nodeId: r.id })).toBeNull();
  });
});

describe("createComponentPluginHandler", () => {
  it("returns componentId/key and registers the component", async () => {
    const figma = new FigmaFake();
    const r = figma.createRectangle();
    const out = await createComponentPluginHandler({ nodeId: r.id }, { logger: noopLogger, figma });
    expect(out.componentId).toMatch(/^cmp/);
    const components = await figma.getLocalComponentsAsync();
    expect(components.find((c) => c.id === out.componentId)?.key).toBe(out.key);
  });
});
