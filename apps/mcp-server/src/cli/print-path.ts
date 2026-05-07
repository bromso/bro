import { fileURLToPath } from "node:url";

// TODO(Phase 9): wire bundled asset copy of apps/bridge-plugin/dist/manifest.json
// into ./plugin/manifest.json adjacent to the compiled mcp-server bundle, so that
// `--print-path` resolves to a real file in production. Today this is deferred
// because @bromso/figma-mcp has no tsc/Vite emit pipeline yet (it is invoked via
// `bun src/main.ts`), so there is no `dist/` to land the asset alongside.
// The pure resolver below stays correct regardless of the eventual layout.

export interface ResolveManifestPathOptions {
  readonly metaUrl: string;
}

export function resolveManifestPath(options: ResolveManifestPathOptions): string {
  return fileURLToPath(new URL("./plugin/manifest.json", options.metaUrl));
}
