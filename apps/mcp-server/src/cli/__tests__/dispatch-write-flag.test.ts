import { describe, expect, it } from "vitest";
import { dispatch } from "../dispatch";

describe("dispatch: --enable-write-tools flag", () => {
  it("defaults to false on bare runtime invocation", () => {
    const r = dispatch({ argv: ["node", "figma-mcp"] });
    expect(r).toEqual({ kind: "runtime", flags: { enableWriteTools: false } });
  });

  it("captures --enable-write-tools when present", () => {
    const r = dispatch({ argv: ["node", "figma-mcp", "--enable-write-tools"] });
    expect(r).toEqual({ kind: "runtime", flags: { enableWriteTools: true } });
  });

  it("does not affect setup / doctor / help", () => {
    expect(dispatch({ argv: ["node", "figma-mcp", "--help"] }).kind).toBe("help");
    expect(dispatch({ argv: ["node", "figma-mcp", "setup"] }).kind).toBe("setup");
    expect(dispatch({ argv: ["node", "figma-mcp", "doctor"] }).kind).toBe("doctor");
  });
});
