---
"@repo/docs": patch
---

Phase 15: docs site redesign.

`apps/docs` (the Fumadocs site at <https://bromso.github.io/bro/>) is rewritten to reflect v1.4 — 8 tool packs, ~85 tools, cloud-mode-without-plugin, the editor-type discriminator, the figma-api-key doctor check.

Render fix: 9 source files hardcoded `figma-plugin-template` (the original template name) for the basePath / repo URL — the deployed site at `bromso.github.io/bro/` rendered blank because every asset 404'd. Renamed everywhere; the root `/` now meta-refreshes to `/bro/docs/` (works under Next's `output: "export"`, where server-side `redirect()` doesn't).

New IA: five top-level sections (Get Started / Clients / Tools / Recipes / Reference) plus an auto-generated `tools-reference` tree. Generator at `apps/docs/scripts/generate-tool-reference.mjs` imports every pack's `defineTool` exports, walks the Zod schemas via `zod-to-json-schema`, and emits one MDX per tool. Output is committed to git so preview-builds work without re-running.

Hand-written content:

- 8 pack overview pages (`tools/{extract,variables,console,design,figjam,slides,a11y,rest}.mdx`).
- 7 recipe pages (`recipes/*.mdx`) — extract design tokens, audit a11y, slides from outline, UI from description, audit via cloud, debug plugin console, document components.
- 3 reference pages (`reference/architecture.mdx` refresh, `reference/troubleshooting.mdx` refresh with 6 doctor checks, new `reference/error-codes.mdx`).
- Refreshed landing (`index.mdx`), refreshed quickstart (renamed `getting-started/` → `get-started/`), new cloud-mode page (`get-started/cloud.mdx`).
- Refreshed 5 client install pages with cloud-mode hint and reference-path fix.

Out of scope: PR preview workflow, auto-PR for generator drift, multi-version docs trees, custom logo / Figma palette, real-Figma golden tests for docs links.
