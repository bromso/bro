import { describe, expect, it } from "vitest";
import * as Protocol from "../index";

describe("public API surface (index.ts)", () => {
  it("re-exports the four sub-modules' value-bearing symbols", () => {
    expect(Protocol.ErrorCode).toBeDefined();
    expect(Protocol.RequestEnvelope).toBeDefined();
    expect(Protocol.StreamingEnvelope).toBeDefined();
    expect(Protocol.defineTool).toBeDefined();
    expect(typeof Protocol.parseEnvelope).toBe("function");
    expect(typeof Protocol.parseStreamingEnvelope).toBe("function");
    expect(typeof Protocol.errorCategoryFor).toBe("function");
    expect(typeof Protocol.isMonotonic).toBe("function");
  });
});
