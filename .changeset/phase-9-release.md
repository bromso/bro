---
"@bromso/figma-mcp": major
"@repo/figma-adapter": patch
"@repo/protocol": patch
"@repo/transport": patch
"@repo/tools-console": patch
"@repo/tools-design": patch
"@repo/tools-extract": patch
"@repo/tools-variables": patch
---

Phase 9: polish + release.

`@bromso/figma-mcp` (formerly the workspace package `@repo/mcp-server`)
ships its first public release on npm:

- Renamed published artifact: `@bromso/figma-mcp`. The CLI binary is
  unscoped: `figma-mcp`. Install via `npx @bromso/figma-mcp setup`.
- `bin: { "figma-mcp": "./dist/main.js" }` so post-install the binary
  is on PATH.
- New `build` script that bundles `src/main.ts` to `dist/main.js`
  (Node target, deps externalized) and copies the bridge plugin's
  built assets into `dist/plugin/`.
- Publish metadata: `homepage`, `repository`, `license`, `bugs`,
  `keywords`, `engines: { node: ">=20.10.0" }`,
  `publishConfig: { access: "public" }`.
- Internal libs (`@repo/protocol`, `@repo/transport`,
  `@repo/figma-adapter`, the four `@repo/tools-*` packs) remain
  `private: true` for v1; the only npm artifact is
  `@bromso/figma-mcp`. They get patch bumps from this changeset
  via `updateInternalDependencies: "patch"` so version traceability
  is preserved in the CHANGELOG.

Pipeline:

- `.github/workflows/release.yml` now runs `bun changeset publish`
  (was `tag`) with `setup-node` for `~/.npmrc` auth and a fresh
  build before publish.
- `.github/workflows/real-figma.yml` (new, `workflow_dispatch`) runs
  the gated golden suite against a public test file with the
  `FIGMA_API_KEY` secret. `RECORD=1` refreshes fixtures.

Docs:

- `README.md` and `CONTRIBUTING.md` rewritten for the product.
- `apps/docs/content/docs/` reset: new `index`, quickstart,
  per-AI-client install pages (claude-code, claude-desktop, cursor,
  windsurf, copilot), architecture overview, troubleshooting.
- Template-flavored pages removed.

Out of scope: Figma Community plugin submission (manual external
action), publishing internal libs to npm (deferred to v1.1+),
cutting the actual `git tag v1.0.0` (manual after Changesets PR
merge).
