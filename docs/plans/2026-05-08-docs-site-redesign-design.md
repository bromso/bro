# Docs Site Redesign — Design Doc

**Date:** 2026-05-08
**Status:** Approved (brainstormed with user 2026-05-08)
**Implementation phase:** Phase 15

## Context

`bromso.github.io/bro/` renders blank. Two compounding issues:

1. **Broken render**: 9 source files in `apps/docs/` hardcode `figma-plugin-template` (the original template name) for the basePath / repo URL. The repo is now `bromso/bro`, deployed to GitHub Pages at `/bro/`. Every asset 404s.
2. **Stale content**: existing MDX was written in Phase 9 (v1.0.0). The product has since shipped 4 minor releases (Phase 10 figjam, Phase 11 REST/cloud-mode, Phase 12 slides, Phase 13 a11y) and one patch hardening (Phase 14). Docs reflect 5 tools / 4 packs; product ships ~81 tools across 8 packs.

Compounded effect: even after fixing the render bug, docs would be obsolete to the point of being misleading.

## Goal

Ship a v1 docs site that:
- Renders correctly at `bromso.github.io/bro/`.
- Reflects v1.4's full surface — 8 packs, ~81 tools, cloud mode, the editor-type discriminator.
- Stays in sync with future tool additions automatically.
- Is browsable across multiple entry points: by use case (recipes), by pack (overview pages), by tool (auto-generated reference), and by topic (architecture / troubleshooting).

## Decisions (locked during brainstorming)

1. **Scope**: Full redesign — render fix + content refresh + IA expansion (Tools section + Recipes section + auto-generated tool reference + error codes page). Not just a render fix.
2. **Tool reference**: Auto-generated from `defineTool` Zod schemas at build time. Generator emits one MDX per tool; pack overviews + recipes are hand-written.
3. **Information architecture**: Five top-level sections — Get Started, Clients, Tools, Recipes, Reference.
4. **Recipes**: 7 hand-written recipes (extract design tokens / audit a11y / slides from outline / UI from description / cloud-mode audit / debug plugin console / document components).
5. **Branding**: Default Fumadocs theme + wordmark only ("Figma Plugin Template" → "figma-mcp"). No custom logo, no palette overrides for v1.

## Architecture

### Render fix (single pass, low risk)

Search-and-replace `figma-plugin-template` → `bro` in 9 files:
- `apps/docs/next.config.mjs` — basePath
- `apps/docs/src/app/layout.tsx` — SITE_URL + BASE
- `apps/docs/src/app/manifest.ts` — start_url + icon paths (×2)
- `apps/docs/src/app/robots.ts` — sitemap URL
- `apps/docs/src/app/sitemap.ts` — BASE_URL
- `apps/docs/src/app/docs/[[...slug]]/page.tsx` — SITE_URL + REPO_URL + GitHub edit-link config
- `apps/docs/src/lib/layout.shared.tsx` — BASE + githubUrl + Storybook URL

Plus replace `apps/docs/src/app/page.tsx`'s `redirect("/docs")` (server-only, doesn't work in static export) with a static `<meta http-equiv="refresh" content="0; url=/bro/docs">` page so the root URL resolves.

### Information architecture

```
content/docs/
├── index.mdx                          (landing — rewrite for v1.4)
├── meta.json                          (top-level nav)
├── get-started/
│   ├── meta.json
│   ├── index.mdx                      (local-mode quickstart — refresh)
│   └── cloud.mdx                      (NEW — relay + FIGMA_API_KEY mode)
├── clients/                           (refresh — verify install commands; add doctor verify step)
│   ├── meta.json
│   ├── claude-code.mdx
│   ├── claude-desktop.mdx
│   ├── cursor.mdx
│   ├── windsurf.mdx
│   └── copilot.mdx
├── tools/                             (NEW — pack overviews)
│   ├── meta.json
│   ├── index.mdx                      (8-pack table)
│   ├── extract.mdx
│   ├── variables.mdx
│   ├── console.mdx
│   ├── design.mdx
│   ├── figjam.mdx
│   ├── slides.mdx
│   ├── a11y.mdx
│   └── rest.mdx
├── tools-reference/                   (NEW — auto-generated)
│   ├── meta.json
│   └── <pack>/<tool>.mdx              (~81 files)
├── recipes/                           (NEW — 7 recipes)
│   ├── meta.json
│   ├── index.mdx
│   ├── extract-design-tokens.mdx
│   ├── audit-accessibility.mdx
│   ├── slides-from-outline.mdx
│   ├── ui-from-description.mdx
│   ├── audit-via-cloud.mdx
│   ├── debug-plugin-console.mdx
│   └── document-components.mdx
└── reference/
    ├── meta.json
    ├── architecture.mdx               (refresh — 8-pack table, REST flow, slides flow)
    ├── troubleshooting.mdx            (refresh — 6 doctor checks now)
    └── error-codes.mdx                (NEW — alphabetical E_* reference)
```

Renames vs current state: `getting-started/` → `get-started/`. `architecture.mdx` and `troubleshooting.mdx` move into `reference/`.

### Tool reference auto-generation

Build-time script at `apps/docs/scripts/generate-tool-reference.mjs`:

1. Imports every pack's tool exports.
2. For each `defineTool({...})` object, walks the Zod input/output schemas via `zodToJsonSchema` (already in the dep tree).
3. Emits one MDX per tool at `apps/docs/content/docs/tools-reference/<pack>/<tool-name>.mdx`.
4. Emits `meta.json` files listing every tool.

Each generated MDX contains an `<ToolReference>` component (new, at `apps/docs/src/components/tool-reference.tsx`) that renders the JSON-schema as a typed table — field name, type, required/optional, constraints (min/max/enum/regex), description.

Wired via `apps/docs/package.json`: `build` becomes `bun run scripts/generate-tool-reference.mjs && next build`. Generated MDX is committed to git so preview-builds work without re-running. The script is idempotent — running twice produces identical output.

For v1: generated MDX is committed manually as part of Phase 15. CI auto-PR for drift is a follow-up.

### Per-pack page template

Same structure across 8 pages:
- What it does (2-3 sentences)
- When to use (bullets)
- Editor types (universal / figma / figjam / slides)
- Tools table (name | one-liner | link to reference)
- Quick example (5-line code block)
- Recipes using this pack (links)

### Recipe page template

Same structure across 7 recipes:
- The prompt (literal text the user types)
- What happens (2-3 sentences on tool flow)
- Tools used (links to reference)
- Variations (2-3 prompt adaptations)
- Troubleshooting (link to reference)

### Reference: error-codes.mdx (new)

Alphabetical list of every `E_*` code surfaced by the daemon, the relay, and tool packs. Per entry: symptom → cause → fix.

Codes to enumerate:
- `E_FIGMA_EDITOR_TYPE_MISMATCH` (figjam, slides)
- `E_FIGMA_API_KEY_MISSING` (rest)
- `E_FIGMA_REST_404` / `E_FIGMA_REST_429` / `E_FIGMA_REST_AUTH` / `E_FIGMA_REST_UNKNOWN` (rest)
- `E_WRITE_TOOLS_DISABLED` (rest)
- `E_RELAY_*` (relay — Phase 6)
- `E_DAEMON_PORT_BOUND` (daemon)
- `E_PORT_CONFLICT` (doctor)
- `E_VERSION_DRIFT` (daemon — Phase 1 design)
- Plus the implementation-detail codes documented in respective changelogs.

## Local development & deployment

- **Local dev**: `bun run --filter @repo/docs dev` → Next dev server, basePath empty (no `/bro` prefix).
- **Build**: `GITHUB_PAGES=true bun run --filter @repo/docs build` → static export to `apps/docs/out/`.
- **Deploy**: `.github/workflows/docs.yml` already wired; runs on push to master + paths matching `apps/docs/**`. Storybook bundle is copied into `out/storybook/` separately and unaffected.
- **Search**: Fumadocs's built-in API at `apps/docs/src/app/api/search/route.ts` pre-renders a static JSON index at build time. Walks `content/docs/**` automatically.
- **PR previews**: out of scope for this design; documented as a follow-up.

## Testing & acceptance

**Per-task gates during implementation**:
- Every task ends with `GITHUB_PAGES=true bun run --filter @repo/docs build` succeeding.
- The generator has Vitest unit tests — covers recursive Zod schemas, optional+default, enums, refs.

**Final acceptance gates**:
- Full repo: `bun run lint && bun run types && bun run test` — all 18 packages green.
- Local smoke: `bunx serve apps/docs/out`, visit `http://localhost:3000/bro/docs`, click every nav entry, verify search.
- After merge: `bromso.github.io/bro/` renders, root meta-refreshes to `/bro/docs/`, architecture page shows the 8-pack table.

**No new test packages.** No Playwright, no visual regression — overkill for a docs site at this scale.

## Out of scope

- PR preview workflow (separate Pages or Cloudflare deployment).
- Auto-PR for generated MDX drift (CI step that opens a PR when the generator output diverges from committed files).
- Multi-version docs (separate v1.4 / v1.5 trees).
- Search analytics / page-view tracking / telemetry.
- Custom logo or Figma palette.
- Real-Figma golden tests for the docs site (broken external links are caught manually).
- Recipe walkthroughs with screenshots.
- Per-tool examples beyond the reference table (deferred until tool surface stabilizes).

## References

- Phase 9 plan (original docs scaffold): `docs/plans/2026-05-06-figma-mcp-phase-9.md`
- Existing docs deploy workflow: `.github/workflows/docs.yml`
- Fumadocs docs: <https://fumadocs.dev>
- `defineTool` schema source: `packages/protocol/src/tools.ts`
- All 8 pack sources: `packages/tools-{extract,variables,console,design,figjam,slides,a11y,rest}/src/`
