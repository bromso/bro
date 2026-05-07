import { FigmaApiError, FigmaApiFake } from "@repo/figma-api-client";
import { describe, expect, it } from "vitest";
import {
  E_FIGMA_API_KEY_MISSING,
  E_WRITE_TOOLS_DISABLED,
  mapRestError,
  requireApiKey,
  requireWriteEnabled,
} from "../guards";

describe("requireApiKey", () => {
  it("returns the client when present", () => {
    const c = new FigmaApiFake();
    expect(requireApiKey(c, "get_user_me")).toBe(c);
  });

  it("throws E_FIGMA_API_KEY_MISSING on null", () => {
    expect(() => requireApiKey(null, "get_user_me")).toThrow(/E_FIGMA_API_KEY_MISSING/);
  });

  it("throws E_FIGMA_API_KEY_MISSING on undefined", () => {
    expect(() => requireApiKey(undefined, "get_user_me")).toThrow(/E_FIGMA_API_KEY_MISSING/);
  });

  it("includes the tool name in the error message", () => {
    try {
      requireApiKey(null, "get_file_metadata");
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("get_file_metadata");
    }
  });

  it("exposes the code as a module constant", () => {
    expect(E_FIGMA_API_KEY_MISSING).toBe("E_FIGMA_API_KEY_MISSING");
  });
});

describe("requireWriteEnabled", () => {
  it("returns silently when enableWriteTools is true", () => {
    expect(() =>
      requireWriteEnabled({ enableWriteTools: true }, "post_file_comment")
    ).not.toThrow();
  });

  it("throws E_WRITE_TOOLS_DISABLED when enableWriteTools is false", () => {
    expect(() => requireWriteEnabled({ enableWriteTools: false }, "post_file_comment")).toThrow(
      /E_WRITE_TOOLS_DISABLED/
    );
  });

  it("error message names the tool and the flag", () => {
    try {
      requireWriteEnabled({ enableWriteTools: false }, "post_file_comment");
      expect.fail("should have thrown");
    } catch (err) {
      const m = (err as Error).message;
      expect(m).toContain("post_file_comment");
      expect(m).toContain("--enable-write-tools");
    }
  });

  it("exposes the code as a module constant", () => {
    expect(E_WRITE_TOOLS_DISABLED).toBe("E_WRITE_TOOLS_DISABLED");
  });
});

describe("mapRestError", () => {
  it("re-throws FigmaApiError as Error with code: prefix", () => {
    const original = new FigmaApiError({
      status: 404,
      code: "E_FIGMA_REST_404",
      message: "file not found: xyz",
    });
    expect(() => mapRestError(original)).toThrow(/E_FIGMA_REST_404.*file not found: xyz/);
  });

  it("re-throws non-FigmaApiError unchanged", () => {
    const ordinary = new Error("boom");
    expect(() => mapRestError(ordinary)).toThrow("boom");
  });

  it("re-throws non-Error values as Error", () => {
    expect(() => mapRestError("string-rejection")).toThrow("string-rejection");
  });
});
