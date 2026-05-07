import type { FigmaApiClient } from "./client";
import type { FigmaApiFake } from "./fake";

export type { FigmaApiClientOptions } from "./client";
export { FigmaApiClient } from "./client";
export type { FigmaApiErrorCode } from "./errors";
export { FigmaApiError, mapStatusToCode } from "./errors";
export { FigmaApiFake } from "./fake";
export type * from "./types";

/**
 * Structural alias used by handler signatures so either the production
 * client or the in-memory fake can be passed. Both share the same surface
 * by construction; this type encodes the contract the handlers depend on.
 */
export type FigmaApi = FigmaApiClient | FigmaApiFake;
