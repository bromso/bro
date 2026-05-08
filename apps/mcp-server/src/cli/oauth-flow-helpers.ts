/// <reference types="node" />
/**
 * Default save-tokens helper extracted into its own module so the OAuth
 * flow can be unit-tested without pulling in `@repo/figma-api-client`'s
 * filesystem side-effects. The production path uses `saveOAuthTokens`
 * from Phase 21; tests inject a fake.
 */

import type { OAuthTokenSet } from "@repo/figma-api-client";
import { saveOAuthTokens } from "@repo/figma-api-client";

export type SaveOAuthTokens = (path: string, tokens: OAuthTokenSet) => Promise<void>;

export const defaultSaveOAuthTokens: SaveOAuthTokens = (path, tokens) =>
  saveOAuthTokens(path, tokens);
