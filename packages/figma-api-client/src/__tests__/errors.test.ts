import { describe, expect, it } from "vitest";
import { FigmaApiError, mapStatusToCode } from "../errors";

describe("FigmaApiError", () => {
  it("carries status + code + message", () => {
    const err = new FigmaApiError({
      status: 404,
      code: "E_FIGMA_REST_404",
      message: "file not found: xyz",
    });
    expect(err.status).toBe(404);
    expect(err.code).toBe("E_FIGMA_REST_404");
    expect(err.message).toBe("file not found: xyz");
    expect(err).toBeInstanceOf(Error);
  });

  it("name is FigmaApiError", () => {
    const err = new FigmaApiError({
      status: 500,
      code: "E_FIGMA_REST_UNKNOWN",
      message: "boom",
    });
    expect(err.name).toBe("FigmaApiError");
  });
});

describe("mapStatusToCode", () => {
  it("maps 401 / 403 to E_FIGMA_REST_AUTH", () => {
    expect(mapStatusToCode(401)).toBe("E_FIGMA_REST_AUTH");
    expect(mapStatusToCode(403)).toBe("E_FIGMA_REST_AUTH");
  });

  it("maps 404 to E_FIGMA_REST_404", () => {
    expect(mapStatusToCode(404)).toBe("E_FIGMA_REST_404");
  });

  it("maps 429 to E_FIGMA_REST_429", () => {
    expect(mapStatusToCode(429)).toBe("E_FIGMA_REST_429");
  });

  it("maps 500/502/503/504 to E_FIGMA_REST_UNKNOWN", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(mapStatusToCode(status)).toBe("E_FIGMA_REST_UNKNOWN");
    }
  });

  it("maps any other non-2xx to E_FIGMA_REST_UNKNOWN", () => {
    expect(mapStatusToCode(418)).toBe("E_FIGMA_REST_UNKNOWN");
    expect(mapStatusToCode(599)).toBe("E_FIGMA_REST_UNKNOWN");
  });
});
