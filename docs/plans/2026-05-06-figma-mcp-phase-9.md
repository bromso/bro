# Phase 9: Polish + release

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ship the Figma MCP project as `@scope/figma-mcp` v1.0.0. Repurpose docs site for the product. Wire npm publish into the release pipeline. Add a manual-trigger workflow that exercises a real Figma file end-to-end.

**Architecture:** Docs are content-only Markdown/MDX in `apps/docs`. Release pipeline already runs Changesets/Action; we add `npm publish` and flip access. Real-Figma tests are a gated Vitest suite skipped by default (only run on the dedicated workflow with `FIGMA_API_KEY` secret).

**Tech Stack:** Existing — Bun, Vitest, Changesets, Fumadocs (in `apps/docs`), GitHub Actions.

---

## Out of scope (call-out so the executor doesn't drift)

- **Figma Community submission.** The plugin manifest goes through Figma's manual review workflow — that's a human action, not a CI step. The CONTRIBUTING guide and the docs site reference the process; the actual upload happens outside this phase.
- **Publishing the internal libs (`@repo/protocol`, `@repo/transport`, `@repo/figma-adapter`, the four `@repo/tools-*` packs) to npm.** Decision: v1 ships ONE published artifact — `@bromso/figma-mcp` (the binary). The internal packs stay `private: true` and `@repo/*`-scoped. Publishing the libs as standalone modules is a v1.1+ surface decision; until external consumers ask, the npm publish surface is one package.
- **Multi-shim coordination over a single relay session.** Phase 8+ feature; the docs reference it but the architecture page does not promise it for v1.
- **Changelog generation polish (per-package versioning UX).** Changesets default output is fine for v1; bespoke release notes are a v1.1 task.
- **Doctor remediation actions.** Phase 7 already declared this out; Phase 9 keeps it out — `figma-mcp doctor` reports, it does not auto-fix.
- **Telemetry, analytics, error reporting, auto-update.** Same posture as Phase 7. v1 ships zero telemetry.
- **Real-Figma tests beyond a single fixture roundtrip.** The harness is a smoke layer — one fixture, one assertion, gated behind the secret. Broader golden coverage is continuous post-launch.
- **A `--strict` exit-code mode for `doctor`.** Out of v1; raised as a follow-up in the troubleshooting page.
- **Auto-bumping the bridge plugin's `allowedDomains` to the production relay URL.** That plumbing already lives in Phase 7 (`--relay-url`) and Phase 6 (CORS). Phase 9 only references the production URL in docs; the plugin manifest stays generic.
- **Dependent doc cleanup beyond what the published surface needs.** The current `apps/docs/content/docs/ai/*.mdx` and `guides/*.mdx` template-flavored pages get DELETED outright in Task 9.5; we do not migrate them, we reset.
- **The actual `git tag v1.0.0` + GitHub Release press-button.** Once the Changesets PR merges, that's a manual `git tag` (or, equivalently, the GitHub Release UI). Phase 9 wires everything UP TO that button; a human pushes it.
- **Updating the four deferred tool packs (`-figjam`, `-slides`, `-a11y`, `-rest`).** Roadmap Phase 8+ items; v1 ships the four packs already in-tree.

---

## Acceptance Criteria

- The `@bromso/figma-mcp` package (formerly `@repo/mcp-server`) is published-name-correct, has `publishConfig.access: "public"`, valid `homepage`/`repository`/`license`/`bugs` fields, and a working `bin` entry that resolves the CLI from a built `dist/main.js`.
- `.github/workflows/release.yml` invokes `bun changeset publish` (not `tag`), authenticates with `NPM_TOKEN`, and runs the build before publish.
- A `.github/workflows/real-figma.yml` workflow exists, triggers on `workflow_dispatch` only, and runs the gated golden-test suite with the `FIGMA_API_KEY` secret.
- The golden test (`apps/mcp-server/src/__tests__/real-figma.golden.test.ts`) is skipped when `FIGMA_API_KEY` is unset; with the env set, it round-trips a recorded fixture or, with `RECORD=1`, refreshes it.
- `README.md` no longer mentions "figma-plugin-template"; it sells `@bromso/figma-mcp` to the user-AI-client audience.
- `CONTRIBUTING.md` reflects the actual repo (mcp-server / relay / bridge-plugin / protocol / transport / figma-adapter / tools-* / docs) and the contribution loop (changeset-per-PR, phase branches, coverage gates).
- `apps/docs/content/docs/index.mdx`, `getting-started/index.mdx`, `clients/{claude-code,claude-desktop,cursor,windsurf,copilot}.mdx`, `architecture.mdx`, and `troubleshooting.mdx` exist and are figma-mcp-flavored.
- `apps/docs/content/docs/meta.json` no longer references the deleted template pages.
- The docs site builds (`bun run docs:build`) without 404s on the navigation.
- `bun run lint`, `bun run types`, `bun run test` all green.
- Phase 9 changeset under `.changeset/phase-9-release.md` declares the rename + access flip + binary publish wiring.
- Commit hygiene: each task lands as ONE conventional commit. No multi-task commits. No `git add -A`.

---

## Task Map

| #     | Task                                                                | Package / App        | Type       |
| ----- | ------------------------------------------------------------------- | -------------------- | ---------- |
| 9.1   | Audit publishable packages + add `publishConfig` + metadata fields  | mcp-server / repo    | infra      |
| 9.2   | Rename `@repo/mcp-server` → `@bromso/figma-mcp` + `bin` + consumers | mcp-server / consumers | infra/code |
| 9.3   | Rewrite `README.md` for the figma-mcp product                       | repo                 | content    |
| 9.4   | Rewrite `CONTRIBUTING.md` for the figma-mcp product                 | repo                 | content    |
| 9.5   | Rewrite `apps/docs/content/docs/index.mdx` + reset `meta.json`      | docs                 | content    |
| 9.6   | Rewrite `getting-started/index.mdx` (quickstart for end users)      | docs                 | content    |
| 9.7   | Per-AI-client install pages + `clients/meta.json`                   | docs                 | content    |
| 9.8   | Architecture page (`docs/architecture.mdx`)                         | docs                 | content    |
| 9.9   | Troubleshooting page (`docs/troubleshooting.mdx`)                   | docs                 | content    |
| 9.10  | Real-Figma golden test harness + workflow                           | mcp-server / CI      | code/infra |
| 9.11  | npm publish wiring in `release.yml` (build + `changeset publish`)   | CI                   | infra      |
| 9.12  | Phase 9 changeset + acceptance                                      | repo                 | infra      |

---

## Task 9.1: Audit publishable packages + add `publishConfig` + metadata fields

**Goal:** Decide ONCE per package whether it ships to npm; for the one(s) that do, add the metadata that npm/registry consumers expect. The judgment call here is documented inline so the executor doesn't re-litigate it.

**Decision matrix (locked for v1):**

| Workspace name              | Publish to npm? | Why                                                                                                  |
| --------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `@repo/mcp-server`          | YES (renamed in 9.2) | The user-facing binary `figma-mcp`. Without this, the install story doesn't work.              |
| `@repo/protocol`            | NO              | Internal lib; useful to community-built tools but adds publish surface. Defer to v1.1.               |
| `@repo/transport`           | NO              | Internal lib; same logic as protocol. Defer to v1.1.                                                 |
| `@repo/figma-adapter`       | NO              | Internal contract between mcp-server and bridge-plugin. Not a public API.                            |
| `@repo/tools-*` (4 packs)   | NO              | Wired into the mcp-server registry; not standalone-consumable. Defer to v1.1+.                       |
| `@repo/bridge-plugin`       | NO              | Bundled into `dist/plugin/manifest.json` and shipped INSIDE the mcp-server package; never npm.       |
| `@repo/relay`               | NO              | Cloudflare Worker, deployed via `wrangler deploy`. Not an npm artifact.                              |
| `@repo/common`              | NO              | Storybook/docs scaffolding leftover; internal.                                                       |
| `@repo/ui`                  | NO              | Storybook/docs scaffolding leftover; internal.                                                       |
| `@repo/docs`                | NO              | Next.js site; deployed via Pages.                                                                    |
| `@repo/storybook`           | NO              | Already in `.changeset/config.json` `ignore` list.                                                   |

> **Documented rationale:** v1 ships ONE artifact to npm. Internal seams (`protocol`/`transport`) become publishable when (a) someone outside the repo asks, and (b) we're ready to commit to a stable wire-level API for them. Until then, the only stable API surface is the MCP wire format and the published `figma-mcp` binary CLI.

**Files:**

- Modify: `apps/mcp-server/package.json` — add `publishConfig`, `homepage`, `repository`, `license`, `bugs`, `description`, `keywords`, `author`, `engines`, `files`. Keep `private` field but flip to `false` (or remove it).
- Verify: every other workspace package has `"private": true`. If any are missing it, ADD it (defensive — prevents accidental publishes).

**Step 1: Audit private flags** — quick inventory before changes:

```bash
grep -l '"name":' apps/*/package.json packages/*/package.json | \
  xargs -I {} sh -c 'echo "=== {} ==="; grep -E "\"name\"|\"private\"|\"version\"" {} | head -3'
```

The command should reveal that `apps/mcp-server/package.json` currently has `"private": true` and version `0.0.0`. Every other package likewise. If any package lacks `"private": true`, add it in the SAME commit as Task 9.1 (defensive); call out which ones in the commit body.

**Step 2: Update `apps/mcp-server/package.json`** — add publish metadata. The intermediate state (still `@repo/mcp-server`, but with publish metadata) is a valid commit; Task 9.2 then renames in a follow-up. This split keeps the diff reviewable.

```jsonc
{
  "name": "@repo/mcp-server",                   // renamed in 9.2
  "version": "0.0.0",                           // bumped to 1.0.0 by Changesets at release
  "description": "Bridge between AI MCP clients and Figma. Stdio shim + daemon + bundled bridge plugin.",
  "homepage": "https://bromso.github.io/bro",
  "repository": {
    "type": "git",
    "url": "https://github.com/bromso/bro.git",
    "directory": "apps/mcp-server"
  },
  "bugs": {
    "url": "https://github.com/bromso/bro/issues"
  },
  "license": "MIT",
  "author": "bromso",
  "keywords": [
    "figma",
    "mcp",
    "model-context-protocol",
    "ai",
    "claude",
    "cursor",
    "windsurf"
  ],
  "engines": {
    "node": ">=20.10.0"
  },
  "type": "module",
  // ...existing scripts, deps, devDeps...
  "publishConfig": {
    "access": "public"
  }
}
```

`bin` field, `files` field, and `main` field arrive in Task 9.2 (when the published name is locked) — kept out of 9.1 to avoid mid-task fix-ups.

**Step 3: Verify changeset config doesn't fight us.** `.changeset/config.json` currently has `"access": "restricted"` at the root. Per Changesets docs, the per-package `publishConfig.access` IN package.json takes precedence at publish time, but the changeset CLI itself reads the root config when it warns the user about access. Set the root to `"restricted"` (default for safety); rely on per-package `publishConfig.access: "public"` as the explicit opt-in. Also drop the `"fixed"` array entry referencing `@repo/ui`/`@repo/common` — those are now internal-only and shouldn't be coupled at version time. Replace with empty `"fixed": []`.

```diff
 {
   "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
   "changelog": ["@changesets/changelog-github", { "repo": "bromso/bro" }],
   "commit": false,
-  "fixed": [["@repo/ui", "@repo/common"]],
+  "fixed": [],
   "linked": [],
   "access": "restricted",
   "baseBranch": "master",
   "updateInternalDependencies": "patch",
-  "ignore": ["@repo/storybook"]
+  "ignore": ["@repo/storybook", "@repo/docs", "@repo/relay", "@repo/bridge-plugin", "@repo/ui", "@repo/common"]
 }
```

The expanded `ignore` list pins which internal-only packages Changesets should skip when computing version bumps. Since none of them publish, they don't need version bumps from changesets at all. The `@repo/figma-adapter`, `@repo/protocol`, `@repo/transport`, and the four `tools-*` packs DO get version bumps — they're internal deps of `@bromso/figma-mcp`, and Changesets uses `updateInternalDependencies: "patch"` to keep them in sync.

> **Why not `ignore` the internal libs too?** They ARE upstream of the published binary; if their internal version drifts, Changesets-generated CHANGELOG would lose track of which mcp-server version corresponds to which protocol shape. Keeping them in the changeset graph (as private packages with bumping versions) preserves that traceability, even though they never reach npm.

**Step 4: Verify**

```bash
bun install                              # picks up package.json changes
bun run --filter @repo/mcp-server lint   # biome doesn't choke on the new fields
bun run --filter @repo/mcp-server types  # tsconfig still resolves
bun run --filter @repo/mcp-server test   # nothing should regress; metadata fields are inert
```

**Step 5: Commit**

```bash
git add apps/mcp-server/package.json .changeset/config.json
git commit -m "chore(mcp-server): publish metadata + flip changeset access posture"
```

**Commit body should explain:**
- Decision: only `@bromso/figma-mcp` ships to npm in v1 (internal libs deferred to v1.1).
- `publishConfig.access: "public"` is the per-package opt-in; root changeset access stays `"restricted"` as a safety default.
- Internal-only packages added to the `ignore` array so they don't muddy version-bump computation.

---

## Task 9.2: Rename `@repo/mcp-server` → `@bromso/figma-mcp` + `bin` + consumers

**Goal:** Lock the published name, add the binary entry, update every workspace consumer that imports it. The published name is `@bromso/figma-mcp` matching the `bromso` GitHub org. The CLI binary is `figma-mcp` (already what the Phase 7 plan promised).

> **Judgment call (documented):** The published name uses the `@bromso` scope to match the GitHub org. The binary is unscoped (`figma-mcp`) so users can run `npx @bromso/figma-mcp setup` and afterwards `figma-mcp doctor` from PATH. If the user wants a different scope (e.g. `@bro/figma-mcp`), this is the place to swap; everything downstream — the README, docs pages, install commands — reads the package name from this single decision.

**Files:**

- Modify: `apps/mcp-server/package.json` — `name`, add `bin`, add `main`, add `files`, add `build` script.
- Modify: `apps/bridge-plugin/package.json` — devDependency `@repo/mcp-server` → `@bromso/figma-mcp` (workspace link).
- Modify: any test fixture, README snippet, or doc that references `@repo/mcp-server` by name. (Search-and-replace; expect ~5–15 hits across the repo.)
- Modify: `bun.lock` — regenerated by `bun install`.

**Step 1: Search the repo** for the old workspace name to scope the rename:

```bash
rg -l "@repo/mcp-server" apps/ packages/ docs/plans/ .changeset/ tsconfig*.json turbo.json
```

Expected hits (from the current code — the executor must verify):
- `apps/mcp-server/package.json` (self-reference)
- `apps/bridge-plugin/package.json` (devDependency only — the bridge plugin imports the mcp-server's *types*, not its runtime, but the workspace link keeps `bun run` ergonomics simple)
- `package.json` filter scripts at the root (if any reference `@repo/mcp-server` by name)
- Phase plan docs (`docs/plans/2026-05-06-figma-mcp-phase-{2..8}.md`) — historical references; DO NOT rewrite history. The plans are immutable artifacts.

> **Important:** Phase plans are historical artifacts — leave them as-is. The new name `@bromso/figma-mcp` is what Phase 9 introduces; previous plans referenced the workspace identifier of the time. A note in this Phase 9 plan (Notes on Execution) calls out the mapping for future readers.

**Step 2: Update `apps/mcp-server/package.json`** — name, bin, files, main, build script:

```jsonc
{
  "name": "@bromso/figma-mcp",
  "version": "0.0.0",
  "description": "Bridge between AI MCP clients and Figma. Stdio shim + daemon + bundled bridge plugin.",
  "homepage": "https://bromso.github.io/bro",
  "repository": { /* …from 9.1… */ },
  "bugs": { /* …from 9.1… */ },
  "license": "MIT",
  "author": "bromso",
  "keywords": [ /* …from 9.1… */ ],
  "engines": { "node": ">=20.10.0" },
  "type": "module",
  "main": "./dist/main.js",
  "bin": {
    "figma-mcp": "./dist/main.js"
  },
  "files": [
    "dist/**",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "bun build src/main.ts --target=node --outdir=dist --external:* && bun build:plugin",
    "build:plugin": "cd ../bridge-plugin && bun run build && cp -r dist/. ../mcp-server/dist/plugin/",
    "test": "vitest run",
    "test:watch": "vitest",
    "types": "tsc --noEmit",
    "lint": "biome check .",
    "start": "bun src/main.ts"
  },
  "dependencies": { /* unchanged */ },
  "devDependencies": { /* unchanged */ },
  "publishConfig": { "access": "public" }
}
```

> **Build script note.** The current `start` script is `bun src/main.ts` — fine for development, but the published artifact needs a Node-target ESM bundle in `dist/main.js`. The simplest path: `bun build src/main.ts --target=node --outdir=dist --external:*` (mark every dep as external so npm resolves them at install time). The bridge plugin's compiled assets are then copied into `dist/plugin/` so the existing Phase 7 `--print-path` resolver finds them. If the executor finds the `--external:*` form drops too many deps the consumer needs (e.g. the MCP SDK shouldn't be external), narrow it to a per-dep list. The acceptance check is: `node dist/main.js --help` works post-build.

**Step 3: Update `apps/bridge-plugin/package.json`** — flip the devDependency:

```diff
   "devDependencies": {
-    "@repo/mcp-server": "workspace:*",
+    "@bromso/figma-mcp": "workspace:*",
     ...
   }
```

If no `apps/bridge-plugin/package.json` reference exists (Phase 7 may have removed it), skip — `bun install` will warn loudly if anything else still depends on the old workspace identifier.

**Step 4: Update internal references** — Phase plan docs are historical and stay as-is. `.changeset/*.md` files that already exist reference `@repo/mcp-server`; those changesets MAY have already been consumed (`bun changeset version` rolls them into CHANGELOG). If they haven't, leave them — the changeset CLI will fail to resolve `@repo/mcp-server` after the rename. Run:

```bash
bun changeset status
```

If any unconsumed changeset still references `@repo/mcp-server`, edit those changeset files in this same task to use the new name. If none — move on.

**Step 5: Update root scripts (if applicable).** Check `package.json` at the repo root:

```bash
grep -n "@repo/mcp-server" package.json || echo "(no root references)"
```

Most likely the root only declares the workspace pattern (`apps/*`, `packages/*`); no rename needed there. But verify before commit.

**Step 6: Re-run install and tests**

```bash
bun install
bun run --filter @bromso/figma-mcp lint
bun run --filter @bromso/figma-mcp types
bun run --filter @bromso/figma-mcp test
bun run lint
bun run types
bun run test
```

All green. The build script is NOT run here (no dist needed for tests; Task 9.10 verifies `dist/main.js` works under the real-figma harness).

**Step 7: Commit**

```bash
git add apps/mcp-server/package.json apps/bridge-plugin/package.json bun.lock
# include any other files touched by the rename:
# git add ./changeset/some-file.md (if needed)
git commit -m "feat(mcp-server)!: rename to @bromso/figma-mcp + add bin/build"
```

**Commit body should mention:**
- Workspace identifier `@repo/mcp-server` → published name `@bromso/figma-mcp`.
- New `bin: { "figma-mcp": "./dist/main.js" }` so the binary is invocable post-install.
- New `build` script that bundles `src/main.ts` and copies the bridge plugin into `dist/plugin/`.
- Breaking change marker (`!`) — published name is new; first publish is `1.0.0`.

---

## Task 9.3: Rewrite `README.md` for the figma-mcp product

**Goal:** Replace the figma-plugin-template README with a product README that helps an AI-client user decide to install in 30 seconds. Audience: Claude Code/Cursor/Windsurf users; secondary audience: contributors who land on the repo from npm.

**File:** `README.md` (full replacement).

**Structure (the writer fills the prose; sections are mandatory):**

1. **Title + tagline.** `# @bromso/figma-mcp` + a one-line strapline like "MCP server that lets your AI design in Figma."

2. **Badges row.** Mirror the current set but anchored to the published package:
   - CI: `https://github.com/bromso/bro/actions/workflows/ci.yml/badge.svg`
   - npm version: `https://img.shields.io/npm/v/@bromso/figma-mcp`
   - License: `https://img.shields.io/github/license/bromso/bro`
   - Node ≥ 20.10
   - Bun 1.3 (dev-only badge)

3. **One-paragraph pitch.** Two-three sentences. What it is: an MCP server that bridges any MCP-aware AI client (Claude Code, Claude Desktop, Cursor, Windsurf, VS Code Copilot) to a running Figma instance via a bundled bridge plugin. What it gives you: ~25 tools that read selection, extract variables, log console output, manipulate the canvas. Who it's for: developers who use AI coding agents and design in Figma.

4. **Install (Quick start).** Make the happy path one paragraph + one code block:
   ```bash
   npx @bromso/figma-mcp setup
   # Open Figma, drag-import the bundled bridge plugin
   figma-mcp doctor
   ```
   With links to the docs site for "longer flows" and "specific clients."

5. **Supported AI clients matrix.** Table with columns `{Client, Config path, Verified on}`:
   - Claude Code — `~/.claude.json`
   - Claude Desktop — `~/Library/Application Support/Claude/claude_desktop_config.json` (etc.)
   - Cursor — `~/.cursor/mcp.json`
   - Windsurf — `~/.codeium/windsurf/mcp_config.json`
   - VS Code Copilot — `~/Library/Application Support/Code/User/mcp.json`
   - Each row links to the per-client doc page from Task 9.7.

6. **What's in the box.** Bullet list:
   - Stdio shim + per-user daemon (auto-spawned).
   - Bundled bridge plugin (drag-import once; pairs over loopback WebSocket).
   - Optional cloud relay (Phase 6) for environments without local IPC.
   - Tool packs: `extract`, `variables`, `console`, `design` — currently ~25 tools, more in roadmap.
   - `figma-mcp doctor` for diagnostics.

7. **Architecture overview.** Either a single ASCII diagram OR three short bullets. Either way, it should mention: shim → daemon → bridge-plugin via WebSocket; relay-mediated Streamable HTTP for cloud mode. Link to the docs `architecture` page (Task 9.8) for depth.

8. **Project layout.** Minimal — name the published artifact and link to `CONTRIBUTING.md` for the deeper layout. NOT the full template-y monorepo tree from the current README.

9. **Versioning.** "Changesets-managed; releases happen on merges to `master` via Action." One sentence + link to CONTRIBUTING.

10. **Links.** Docs site, GitHub Issues, CONTRIBUTING.md, LICENSE.

11. **License.** MIT one-liner referencing `LICENSE`.

**Anti-goals (DO NOT include):**
- A list of every UI component shipped.
- Storybook references (storybook is internal to the design-system scaffold; not user-facing).
- The template's "AI skills" pitch (`build-figma-plugin`, `frontend-design`, etc.) — those are dev-time tools for THIS repo's contributors, not user features.
- Any mention of the plugin-template upstream repo.

**Step 1: Replace the file**

```bash
# write the new README.md from the structure above
$EDITOR README.md
```

**Step 2: Verify**

```bash
bun run lint   # biome ignores README.md but cspell may not
# Manually skim the rendered Markdown in your editor or with `glow README.md`.
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): rewrite for @bromso/figma-mcp product"
```

---

## Task 9.4: Rewrite `CONTRIBUTING.md` for the figma-mcp product

**Goal:** A contributors' guide that reflects the actual repo as of Phase 8. Audience: a developer landing on a GitHub issue who wants to fix it / land a feature.

**File:** `CONTRIBUTING.md` (full replacement).

**Structure (mandatory headings):**

1. **Welcome.** One sentence.

2. **Prerequisites.**
   - Bun 1.3.11 (`bun.lock` is the source of truth).
   - Node ≥ 20.10 (for the published binary's `engines`).
   - Figma desktop (for plugin testing).
   - Optionally: Cloudflare Wrangler if touching `apps/relay`.

3. **Getting started.**
   ```bash
   git clone https://github.com/bromso/bro.git
   cd bro
   bun install
   bun run test
   bun run docs:dev   # open the docs site locally
   ```

4. **Repo layout — the actual phases.** Mirror the structure planned across phases. ONE sentence per package:
   ```
   apps/
     mcp-server/      The published binary (@bromso/figma-mcp). CLI + shim + daemon.
     bridge-plugin/   The Figma plugin runtime. Drag-imported into Figma Desktop.
     relay/           Optional Cloudflare Worker for cloud-mode pairing.
     docs/            Fumadocs site. Deployed to GitHub Pages.
     storybook/       UI scaffolding for the bridge plugin's UI components.
   packages/
     protocol/        Tool/envelope/streaming wire types. Internal.
     transport/       WebSocket + Unix-socket + named-pipe transports. Internal.
     figma-adapter/   Plugin-runtime adapter contract + FigmaFake test double. Internal.
     tools-extract/   Selection/page extraction tool pack. Internal.
     tools-variables/ Variable read/write tool pack. Internal.
     tools-console/   Console capture + query tool pack. Internal.
     tools-design/    Canvas mutation tool pack. Internal.
     ui/              Storybook components.
     common/          Shared types for the storybook scaffold.
   ```

5. **Development workflow.**
   - `bun run dev` (parallel watch).
   - `bun run test` (Vitest, per-package via Turborepo).
   - `bun run lint`, `bun run types`.
   - `bun run docs:dev` (Next.js docs site).
   - `bun run --filter @bromso/figma-mcp test` for scoped runs.

6. **Branching policy.** Mirror the `feat/`, `fix/`, `chore/`, `docs/` prefix table — but explicitly call out **phase branches**: `feat/phase-N-<slug>`. Phase plans are checked into `docs/plans/`; the executor follows the plan task-by-task.

7. **Commit messages.** Conventional commits, scoped (`feat(mcp-server): …`, `fix(transport): …`).

8. **Changesets policy.**
   - Every user-facing change requires a changeset.
   - `bun changeset` — pick affected packages + bump type.
   - Internal-only refactor that doesn't change a published surface: NO changeset needed.
   - Phase-completion changesets land in the SAME PR as the phase.

9. **Coverage gates.** Mirror the per-package thresholds (existing in each package's `vitest.config.ts`). Tool packs ≥90/85; mcp-server ≥80/75/80/80. CI fails below threshold.

10. **How to add a new tool pack.** Brief checklist that points at `packages/tools-extract/` as the canonical reference (the Phase 3 plan):
    - `src/tools.ts` — Zod schemas + `defineTool`.
    - `src/plugin-handlers.ts` — bridge plugin handlers against `figma-adapter`.
    - `src/server-handlers.ts` — server-side handlers if applicable (REST-API-backed).
    - `src/index.ts` — pack registration.
    - Wire into `apps/mcp-server/src/main.ts` registry AND `apps/bridge-plugin/src/runtime.ts` registry.
    - Tests at ≥90/85 coverage.

11. **How to ship to Figma Community.** Two-paragraph placeholder: build the plugin, log into the Figma plugin developer portal, submit `apps/bridge-plugin/dist/` for review. The actual submission is manual; this section is informational only. Link to Figma's plugin publishing docs.

12. **Reporting bugs.** Issues template, the doctor JSON output expectation, what info to include.

13. **License contribution.** "By contributing, you agree your contributions are MIT."

**Anti-goals:**
- Don't echo the README's product pitch.
- Don't re-explain MCP — link to the docs.
- Don't include the storybook scaffold's full component matrix.

**Step 1: Replace the file.**

```bash
$EDITOR CONTRIBUTING.md
```

**Step 2: Verify** — same as 9.3.

**Step 3: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs(contributing): rewrite for figma-mcp project"
```

---

## Task 9.5: Rewrite `apps/docs/content/docs/index.mdx` + reset `meta.json`

**Goal:** The docs site landing page becomes the user-facing home for the product. Tightly cohesive with the README but tailored for someone scanning a docs site (deeper navigation, no badges, code-block-heavy quick start).

**Files:**

- Replace: `apps/docs/content/docs/index.mdx`
- Replace: `apps/docs/content/docs/meta.json` (the navigation tree)
- Delete: `apps/docs/content/docs/getting-started/testing-in-figma.mdx` (template-flavored — replaced by clients/* in Task 9.7).
- Delete: `apps/docs/content/docs/guides/{architecture,messaging,plugin-config,ui-components}.mdx` — `architecture.mdx` is reborn at `docs/architecture.mdx` in Task 9.8; the others are template-flavored and don't have product equivalents.
- Delete: `apps/docs/content/docs/ai/{agents,extending-claude,mcp-servers,plugins,skills,using-claude}.mdx` — these described the template's bundled "AI skills"; not product-relevant.
- Delete: `apps/docs/content/docs/project/{contributing,versioning}.mdx` — replaced by repo-root `CONTRIBUTING.md` linked from the docs site footer.

> **Why delete instead of edit.** The template pages cover concepts (testing the template plugin, plugin config in `figma.manifest.ts`, AI skills) that don't exist in the product. Editing would require fabricating equivalent content; deletion is cleaner. The new structure is a flat user-facing tree.

**Step 1: Replace `index.mdx`** — structure:

```
---
title: figma-mcp
description: MCP server that bridges AI clients to Figma. One command to install.
---

## What is figma-mcp?

[Two paragraphs covering: it's an MCP server; it pairs your AI client to Figma via a bundled plugin; it ships ~25 tools today.]

## Install

```bash
npx @bromso/figma-mcp setup
```

[One paragraph explaining what `setup` does — detects clients, writes configs, prints next steps. Link to /docs/getting-started.]

## Verify

```bash
figma-mcp doctor
```

[One sentence on what doctor reports.]

## Quick links

- [Quickstart](/docs/getting-started) — full first-run flow.
- [Per-client install](/docs/clients) — config paths, verification commands.
- [Architecture](/docs/architecture) — how it works.
- [Troubleshooting](/docs/troubleshooting) — what doctor catches and how to fix it.
```

(Frontmatter `title` + `description` are the two MDX requirements; the rest is body.)

**Step 2: Replace `meta.json`** — the new navigation tree:

```json
{
  "title": "Documentation",
  "pages": [
    "---Get Started---",
    "getting-started/index",
    "---Per-client install---",
    "clients/claude-code",
    "clients/claude-desktop",
    "clients/cursor",
    "clients/windsurf",
    "clients/copilot",
    "---Reference---",
    "architecture",
    "troubleshooting"
  ]
}
```

(Tasks 9.7 will create the `clients/` files; Tasks 9.8 and 9.9 create `architecture.mdx` and `troubleshooting.mdx`. They live as siblings to `index.mdx`.)

**Step 3: Delete obsolete pages**

```bash
git rm apps/docs/content/docs/getting-started/testing-in-figma.mdx
git rm apps/docs/content/docs/guides/architecture.mdx
git rm apps/docs/content/docs/guides/messaging.mdx
git rm apps/docs/content/docs/guides/plugin-config.mdx
git rm apps/docs/content/docs/guides/ui-components.mdx
git rm apps/docs/content/docs/ai/agents.mdx
git rm apps/docs/content/docs/ai/extending-claude.mdx
git rm apps/docs/content/docs/ai/mcp-servers.mdx
git rm apps/docs/content/docs/ai/plugins.mdx
git rm apps/docs/content/docs/ai/skills.mdx
git rm apps/docs/content/docs/ai/using-claude.mdx
git rm apps/docs/content/docs/project/contributing.mdx
git rm apps/docs/content/docs/project/versioning.mdx
```

If any of those files are missing, skip — the `git rm` will error harmlessly; the executor adapts.

**Step 4: Verify the docs site still builds**

```bash
bun run --filter @repo/docs build
```

Fumadocs scans the `content/docs/` tree at build time; `meta.json` references must resolve. Expect a clean build — note that `getting-started/index`, `clients/*`, `architecture`, and `troubleshooting` references will be DEAD until tasks 9.6–9.9. Either:

- (a) Land 9.5 with a temporary smaller `meta.json` that only includes `index`, then expand in 9.7/9.8/9.9.
- (b) Land 9.5 with the full `meta.json` AND stub the missing files (empty MDX with frontmatter only) so the build passes; subsequent tasks fill them in.

> **Pick (a).** Smaller diffs, every commit's docs build is green. The `meta.json` from 9.5 lists ONLY `getting-started/index` and `index`; subsequent tasks expand it.

**Step 4 (revised): smaller meta.json**

```json
{
  "title": "Documentation",
  "pages": [
    "getting-started/index"
  ]
}
```

Subsequent tasks (9.7, 9.8, 9.9) extend this.

**Step 5: Commit**

```bash
git add apps/docs/content/docs/index.mdx apps/docs/content/docs/meta.json
git add -u apps/docs/content/docs   # captures the deletions
git commit -m "docs(site): reset content tree for figma-mcp product"
```

> **Commit hygiene note:** `git add -u` adds tracked-file deletions but does NOT pick up untracked files — safe in this case. The new files (clients pages, architecture, troubleshooting) are added in their own task commits.

---

## Task 9.6: Rewrite `getting-started/index.mdx` — quickstart for end users

**Goal:** A single page that walks an AI-client user from "I just heard about figma-mcp" to "I've issued my first MCP tool call and seen the result in Figma." Five steps. Maximum 80 lines of MDX.

**File:** `apps/docs/content/docs/getting-started/index.mdx` (replace the existing template-flavored content).

**Structure:**

```
---
title: Quickstart
description: Install figma-mcp, pair the bridge plugin, and verify with doctor.
---

## What you need

- Bun OR Node ≥ 20.10 (the binary runs under either).
- Figma desktop (the bridge plugin runs in Figma's plugin sandbox; not in the browser).
- An MCP-aware AI client: Claude Code, Claude Desktop, Cursor, Windsurf, or VS Code Copilot. See [per-client guides](/docs/clients) for the matrix.

## Step 1: Install figma-mcp

```bash
npx @bromso/figma-mcp setup
```

[One paragraph: setup auto-detects installed AI clients, prints a table of what it will write, and writes the configs atomically. `--dry-run` previews. `--client <id>` filters. `--cloud` uses the Phase 6 relay instead of local IPC.]

## Step 2: Open Figma and import the bridge plugin

```bash
figma-mcp setup --open-figma
```

[Three sentences: this opens the OS file picker pre-positioned at the bundled `manifest.json`. Drag the manifest into Figma Desktop's Plugins → Development → Import plugin from manifest. The plugin appears in your dev plugins list.]

## Step 3: Run the bridge plugin in Figma

[Two sentences: open any Figma file, run **Plugins → Development → Bridge** (or whatever the manifest names it). The plugin window opens and pairs over loopback WebSocket. The pairing handshake is silent on success; the plugin shows a "Connected" indicator.]

## Step 4: Verify

```bash
figma-mcp doctor
```

[Two sentences: doctor reports daemon liveness, plugin pairing, AI-client config drift, recent errors, and socket conflicts. A clean run prints all checks as `ok`.]

## Step 5: Issue your first tool call

[Two paragraphs. Open your AI client and prompt: "Using figma-mcp, list the variables on the current page." The AI client invokes the `list_variables` tool; the result streams back as JSON. If your client supports tool transcripts (Claude Code does), inspect the request/response there.]

## Next steps

- Browse the [per-client config notes](/docs/clients).
- Skim the [architecture page](/docs/architecture).
- If anything fails, jump to [troubleshooting](/docs/troubleshooting).
```

**Anti-goals:**
- Don't list every tool. The catalog is dynamic; users discover via the AI client.
- Don't explain MCP. Link out.
- No "advanced topics" — keep this page laser-focused on first-run.

**Step 1: Update `meta.json`** — extend the navigation if needed (5.5 already includes `getting-started/index`).

**Step 2: Replace `getting-started/index.mdx`.**

**Step 3: Verify**

```bash
bun run --filter @repo/docs build
```

**Step 4: Commit**

```bash
git add apps/docs/content/docs/getting-started/index.mdx
git commit -m "docs(site): quickstart page for figma-mcp"
```

---

## Task 9.7: Per-AI-client install pages + `clients/meta.json`

**Goal:** One page per supported AI client. ~30 lines of MDX each — short, copy-pasteable, deterministic. Each page has the same five sections so users can jump between clients without re-orienting.

**Files:**

- Create: `apps/docs/content/docs/clients/claude-code.mdx`
- Create: `apps/docs/content/docs/clients/claude-desktop.mdx`
- Create: `apps/docs/content/docs/clients/cursor.mdx`
- Create: `apps/docs/content/docs/clients/windsurf.mdx`
- Create: `apps/docs/content/docs/clients/copilot.mdx`
- Create: `apps/docs/content/docs/clients/meta.json`
- Modify: `apps/docs/content/docs/meta.json` (extend `pages` to include the clients section).

**Per-page template (mandatory headings):**

```
---
title: <Client name>
description: Install figma-mcp into <Client name> and verify the connection.
---

## Config path

`<absolute path on macOS / Linux / Windows>`

[One sentence: where the AI client reads its MCP server list. The setup CLI writes here.]

## What `setup` writes

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "@bromso/figma-mcp"]
    }
  }
}
```

[One paragraph: setup PRESERVES sibling `mcpServers` entries and PRESERVES other top-level keys. Atomic temp + rename, so a partial write never corrupts the config.]

## Reload behavior

[One sentence per client — what user action picks up the new entry. Specifics:
- Claude Code: takes effect on next tool invocation.
- Claude Desktop: requires a full app restart.
- Cursor: Cmd-Shift-P → Reload Window.
- Windsurf: open the MCP panel, click refresh.
- Copilot: takes effect on next chat session, OR Cmd-Shift-P → Developer: Reload Window.]

## Verify

```bash
figma-mcp doctor --json | jq '.checks[] | select(.id == "ai-client-configs")'
```

[One sentence: confirms the entry is present AND that the binary on PATH matches the configured command.]

## Troubleshooting

[Three bullet points pointing at specific [troubleshooting](/docs/troubleshooting) entries. Same set on every page; the deep diagnosis lives in the troubleshooting page.]
```

**Per-client specifics (the executor fills the path + reload row):**

| Client          | macOS path                                                          | Linux path                                              | Windows path                                                     | Reload                                          |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| claude-code     | `~/.claude.json`                                                    | `~/.claude.json`                                        | `%USERPROFILE%\.claude.json`                                     | Next tool invocation.                            |
| claude-desktop  | `~/Library/Application Support/Claude/claude_desktop_config.json`   | `~/.config/Claude/claude_desktop_config.json`           | `%APPDATA%\Claude\claude_desktop_config.json`                    | Quit and relaunch the app.                       |
| cursor          | `~/.cursor/mcp.json`                                                | `~/.cursor/mcp.json`                                    | `%USERPROFILE%\.cursor\mcp.json`                                 | `Cmd-Shift-P → Reload Window`.                   |
| windsurf        | `~/.codeium/windsurf/mcp_config.json`                               | `~/.codeium/windsurf/mcp_config.json`                   | `%USERPROFILE%\.codeium\windsurf\mcp_config.json`                | Open MCP panel; click refresh.                   |
| copilot         | `~/Library/Application Support/Code/User/mcp.json`                  | `~/.config/Code/User/mcp.json`                          | `%APPDATA%\Code\User\mcp.json`                                   | `Cmd-Shift-P → Developer: Reload Window`.        |

(Source: Phase 7 detector table — same paths.)

**`clients/meta.json`:**

```json
{
  "title": "Per-client install",
  "pages": [
    "claude-code",
    "claude-desktop",
    "cursor",
    "windsurf",
    "copilot"
  ]
}
```

**Update `apps/docs/content/docs/meta.json`** to point at the section:

```json
{
  "title": "Documentation",
  "pages": [
    "---Get Started---",
    "getting-started/index",
    "---Per-client install---",
    "clients"
  ]
}
```

(Fumadocs traverses subdirectory `meta.json` files; pointing at `clients` mounts the section.)

**Step 1: Create the five client pages.** Write them in parallel; the structure is the same for all five.

**Step 2: Create `clients/meta.json`.**

**Step 3: Update root `meta.json`.**

**Step 4: Build the docs site**

```bash
bun run --filter @repo/docs build
```

Verify: navigation shows "Per-client install" with five children; each page renders.

**Step 5: Commit**

```bash
git add apps/docs/content/docs/clients/ apps/docs/content/docs/meta.json
git commit -m "docs(site): per-AI-client install pages"
```

---

## Task 9.8: Architecture page

**Goal:** A single skimmable page covering the four moving parts of the system. Not a deep dive — link to the design doc for that. Target length: ~120 lines of MDX with one ASCII diagram.

**File:** `apps/docs/content/docs/architecture.mdx` (new).

**Structure:**

```
---
title: Architecture
description: Shim, daemon, bridge plugin, and optional cloud relay. How figma-mcp connects your AI client to Figma.
---

## The four moving parts

1. **Stdio shim.** What your AI client launches via `npx @bromso/figma-mcp`. Lightweight; speaks MCP stdio to the AI client, IPC to the daemon.
2. **Per-user daemon.** Auto-spawned by the first shim. Owns the WebSocket pairing slot for the bridge plugin. Multiple shims (one per AI client) connect to the same daemon.
3. **Bridge plugin.** Drag-imported into Figma Desktop. Runs in Figma's plugin sandbox. Connects to the daemon over loopback WebSocket. Owns all `figma.*` API calls.
4. **(Optional) Cloud relay.** Cloudflare Worker that mediates pairing for environments where local IPC is unavailable (corp laptops, sandboxed dev containers). Used only when `setup --cloud` is invoked.

## Local-mode wiring (default)

```
+------------------+      stdio MCP       +-------------------+
|   AI client      | <------------------> |   Stdio shim      |
| (Claude Code,    |                      | (npx ...)         |
|  Cursor, etc.)   |                      +---------+---------+
+------------------+                                | Unix socket /
                                                    | named pipe
                                                    v
                                          +-------------------+
                                          |   Daemon          |
                                          | (per-user, single |
                                          |  WS server slot)  |
                                          +---------+---------+
                                                    | loopback WebSocket
                                                    v
                                          +-------------------+
                                          |   Bridge plugin   |
                                          | (Figma Desktop)   |
                                          +-------------------+
```

[Two sentences explaining the diagram. Link to Phase 7 plan for the daemon decision tree.]

## Cloud-mode wiring

[Same diagram structure, but the AI client speaks Streamable HTTP to the relay; the relay forwards to a paired bridge plugin that initiates a WebSocket UPSTREAM to the relay. Link to Phase 6 plan for the pairing handshake.]

## The MCP protocol surface

[One paragraph: figma-mcp speaks the standard MCP protocol — `tools/list`, `tools/call`, `initialize`. No custom RPC. ~25 tools as of v1, grouped into packs.]

## Tool packs

| Pack                | What it does                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `tools-extract`     | Read selection, page, and node properties.                                                    |
| `tools-variables`   | Read/write Figma variables (color, number, string, boolean).                                  |
| `tools-console`     | Capture and query the bridge plugin's console output. Surfaces the AI's debugging context.    |
| `tools-design`      | Mutate the canvas — create rectangles, frames, text, components; set fills, strokes, layout.  |

[One sentence: each pack is internal to the binary; they share the protocol/transport/figma-adapter layer.]

## Where things run

[Three bullets, restating the boundary:
- Daemon process: `figma-adapter` (placeholder), `transport` server, the four packs' server-handlers (REST-API-backed read tools).
- Bridge plugin process: `figma-adapter` (real), `transport` client, the four packs' plugin-handlers (the canvas-touching tools).
- Stdio shim process: just `transport` client and an MCP server adapter.]

## Decision: why a daemon and not just an in-shim WebSocket server?

[Two paragraphs. Multiple AI clients may run in parallel — Claude Code in one terminal, Cursor in another. Each has its own shim process. They need to share the SAME WebSocket pairing with the SAME bridge plugin (only one Figma instance is paired at a time). Centralizing the WS server in a per-user daemon is the simplest correct solution. Trade-off: the daemon's lifecycle (lockfile, lazy-spawn, auto-shutdown) is its own complexity, addressed in Phase 4 + Phase 7 doctor.]

## Further reading

- [Design doc](https://github.com/bromso/bro/blob/master/docs/plans/2026-05-06-figma-mcp-rewrite-design.md) — full architectural rationale.
- [Phase 7 plan](https://github.com/bromso/bro/blob/master/docs/plans/2026-05-06-figma-mcp-phase-7.md) — setup CLI + diagnostics.
- [Phase 6 plan](https://github.com/bromso/bro/blob/master/docs/plans/2026-05-06-figma-mcp-phase-6.md) — cloud relay.
```

**Step 1: Create the page.**

**Step 2: Update `meta.json`** to include `architecture` in the Reference section:

```json
{
  "title": "Documentation",
  "pages": [
    "---Get Started---",
    "getting-started/index",
    "---Per-client install---",
    "clients",
    "---Reference---",
    "architecture"
  ]
}
```

**Step 3: Build**

```bash
bun run --filter @repo/docs build
```

**Step 4: Commit**

```bash
git add apps/docs/content/docs/architecture.mdx apps/docs/content/docs/meta.json
git commit -m "docs(site): architecture overview page"
```

---

## Task 9.9: Troubleshooting page

**Goal:** A symptom-cause-fix table mirroring the doctor check IDs and the design doc's "Specific gotchas" list. Users land here from doctor's output ("see /docs/troubleshooting#stale-lockfile") or from the per-client pages.

**File:** `apps/docs/content/docs/troubleshooting.mdx` (new).

**Structure:**

```
---
title: Troubleshooting
description: Common failure modes, what they mean, and how to fix them. Mirrors `figma-mcp doctor` check IDs.
---

## Doctor checks

`figma-mcp doctor` runs five parallel health checks. Each entry below maps to one check ID; clicking through from doctor's output lands here.

### `daemon-liveness` (stale lockfile / dead daemon)

**Symptom.** Doctor reports `daemon-liveness: error — pid <N> in lockfile is not running`.
**Cause.** A previous daemon crashed without cleaning up `~/.figma-mcp/daemon.lock`. The next shim still trusts the lockfile and refuses to spawn.
**Fix.** Delete `~/.figma-mcp/daemon.lock` and re-run any tool. The shim auto-spawns a fresh daemon. (Phase 7 doctor reports this; a future `doctor --fix` will auto-clean.)

### `plugin-pairing` (plugin not paired)

**Symptom.** Doctor reports `plugin-pairing: warn — no plugin connected on slot 0`.
**Cause.** Figma Desktop is not running, OR the bridge plugin window is closed, OR the plugin failed to connect over loopback.
**Fix.** Open Figma. Run **Plugins → Development → Bridge**. Re-run doctor — the check should flip to `ok`. If it stays `warn`, check the plugin's console (right-click in Figma's plugin window → Show Console) for the WebSocket error.

### `ai-client-configs` (config drift)

**Symptom.** Doctor reports `ai-client-configs: warn — entry path mismatch for cursor`.
**Cause.** A previous setup run wrote a config; later, the user moved/renamed/uninstalled the binary, or hand-edited the config. The entry now points at a stale path.
**Fix.** Re-run `npx @bromso/figma-mcp setup --client cursor` to overwrite. Or hand-edit the JSON. The setup CLI is idempotent.

### `recent-errors` (daemon log tail)

**Symptom.** Doctor reports `recent-errors: error — 3 errors in the last 60s`.
**Cause.** The daemon is hitting an unhandled error path — usually a transport disconnect, occasionally a tool-handler crash.
**Fix.** Inspect `~/.figma-mcp/daemon.log` (the last 60s window). If the error is `ECONNRESET`, the bridge plugin disconnected — restart it. Otherwise, file an issue with the log excerpt.

### `socket-conflict` (port/socket already taken)

**Symptom.** Doctor reports `socket-conflict: error — /tmp/figma-mcp.sock is in use by pid <N>, not the daemon`.
**Cause.** Another process owns the IPC socket. Could be a leftover from a crashed daemon, or another tool that picked the same path.
**Fix.** Identify the offender (`lsof -nP /tmp/figma-mcp.sock`), kill it, delete the socket file, re-run.

## Specific gotchas (from the design doc)

### Multiple AI clients, one Figma

[Two sentences: only one bridge plugin pairing at a time. Multiple AI clients connect to the same daemon, multiplexed over the daemon's single WS slot. If two AI clients call tools concurrently, the daemon serializes — there is no per-client request queue isolation in v1.]

### Editor-type mismatch

[Two sentences: the bridge plugin manifest declares `["figma", "figjam"]`. If you import it into a Figma Slides file, the plugin runs but tools that depend on `figma.currentPage.type === "PAGE"` may misbehave. Doctor catches this via the daemon's diagnostics.]

### Version drift between shim and daemon

[Two sentences: a long-running daemon predates the shim's last `npx` cache update. Stop the daemon (`pkill -f figma-mcp`); next shim invocation respawns at the new version. Doctor reports the version pair under the daemon-liveness check.]

### Streamable HTTP vs stdio

[Two sentences: Streamable HTTP is the cloud-mode entry; stdio is the local-mode entry. Mixing them per-client is unsupported (would multiplex sessions). Pick one mode per AI client; setup writes the corresponding entry.]

### Cloud-mode pairing code expiration

[One paragraph: pairing codes from `setup --cloud` expire after 5 minutes. If you delay drag-importing the plugin past the TTL, the relay rejects the plugin's pair attempt and returns `PairingExpired`. Re-run `setup --cloud` to mint a fresh code.]

## When all else fails

- Re-run `figma-mcp doctor --json` and attach the output to a GitHub issue.
- Include your AI client name + version, OS, and Figma Desktop version.
- The issue template at https://github.com/bromso/bro/issues prompts for the same.
```

**Step 1: Create the page.**

**Step 2: Update `meta.json`** to add `troubleshooting`:

```json
{
  "title": "Documentation",
  "pages": [
    "---Get Started---",
    "getting-started/index",
    "---Per-client install---",
    "clients",
    "---Reference---",
    "architecture",
    "troubleshooting"
  ]
}
```

**Step 3: Build**

```bash
bun run --filter @repo/docs build
```

**Step 4: Commit**

```bash
git add apps/docs/content/docs/troubleshooting.mdx apps/docs/content/docs/meta.json
git commit -m "docs(site): troubleshooting reference page"
```

---

## Task 9.10: Real-Figma golden test harness + workflow

**Goal:** A vitest suite that, when given a `FIGMA_API_KEY` secret, hits a known public Figma file via the Figma REST API and asserts the file's structure round-trips against a recorded fixture. Skipped by default (no secret = no run). New `workflow_dispatch`-only GitHub workflow runs it manually.

> **Pragmatic scope.** "Real Figma" testing in CI cannot involve the actual bridge plugin (the plugin requires a running Figma Desktop instance — there's no headless mode). The honest interpretation of the rewrite plan's "real-Figma golden tests" is: hit the Figma REST API against a fixed public file, assert the FILE STRUCTURE matches our recorded snapshot. This catches:
> - Figma API contract changes (the response shape we read in tools-extract / tools-variables drifts).
> - Auth/permission regressions (the API key is wired wrong).
> - Fixture rot (a fixture refresh detects when the public test file was edited).
>
> It does NOT catch: bridge plugin runtime regressions (those need manual Figma Desktop runs; documented in CONTRIBUTING).

**Files:**

- Create: `apps/mcp-server/src/__tests__/real-figma.golden.test.ts`
- Create: `apps/mcp-server/src/__tests__/fixtures/real-figma/file-structure.json` (initially recorded via `RECORD=1`)
- Create: `.github/workflows/real-figma.yml`
- Modify: `apps/mcp-server/vitest.config.ts` (if necessary — the golden test must be discovered by vitest's existing glob).

**Test file structure:**

```ts
// apps/mcp-server/src/__tests__/real-figma.golden.test.ts
import { describe, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures", "real-figma");

const FIGMA_API_KEY = process.env.FIGMA_API_KEY;
const RECORD = process.env.RECORD === "1";

// A public, stable test file owned by the project.
// Replace with the actual fileKey on first record.
const TEST_FILE_KEY = "REPLACE_ME_WITH_PUBLIC_TEST_FILE_KEY";

describe.skipIf(!FIGMA_API_KEY)("real-figma golden", () => {
  it("file structure round-trips against the recorded fixture", async () => {
    const response = await fetch(
      `https://api.figma.com/v1/files/${TEST_FILE_KEY}?depth=1`,
      { headers: { "X-Figma-Token": FIGMA_API_KEY! } },
    );
    expect(response.ok).toBe(true);
    const body = await response.json();

    // Reduce the response to the stable shape we care about — the document name,
    // the top-level page IDs, and their types. Drop volatile fields (lastModified,
    // thumbnailUrl, version) so the fixture is meaningful.
    const reduced = {
      name: body.name,
      pages: (body.document?.children ?? []).map((p: any) => ({
        id: p.id,
        type: p.type,
        name: p.name,
      })),
    };

    const fixturePath = join(FIXTURE_DIR, "file-structure.json");

    if (RECORD) {
      await writeFile(fixturePath, `${JSON.stringify(reduced, null, 2)}\n`);
      // Recording mode is intentionally non-asserting — the fixture is the new truth.
      return;
    }

    const fixture = JSON.parse(await readFile(fixturePath, "utf-8"));
    expect(reduced).toEqual(fixture);
  }, 15_000);
});
```

**Why `describe.skipIf` and not `it.skipIf`.** The whole suite has the same gate; one `describe.skipIf` is more readable. Vitest 4 supports both at the suite and test level.

**Why a single test.** The brief says "the smallest possible — even a single tools/list-equivalent assertion." This is exactly that: ONE assertion that the API + fixture path is wired. More fixtures and assertions are continuous post-launch; the v1 acceptance is "the harness runs and detects bit-rot," not "comprehensive Figma coverage."

**Why `?depth=1`.** Reduces payload size; we only need top-level pages for the fixture.

**Why reduce the response.** The full Figma file response includes `lastModified`, `thumbnailUrl`, `version`, `componentSets`, etc. — all of which churn even when nobody's editing the test file. Reducing to `{name, pages: [{id, type, name}]}` makes the fixture stable.

**Workflow file:**

```yaml
# .github/workflows/real-figma.yml
name: Real Figma golden

on:
  workflow_dispatch:
    inputs:
      record:
        description: "Record fresh fixtures (RECORD=1)"
        required: false
        type: boolean
        default: false

permissions:
  contents: read

jobs:
  real-figma:
    name: Real Figma golden tests
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.11"

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run real-figma golden suite
        env:
          FIGMA_API_KEY: ${{ secrets.FIGMA_API_KEY }}
          RECORD: ${{ inputs.record && '1' || '' }}
        run: bun run --filter @bromso/figma-mcp test real-figma.golden
```

**Manual prerequisites (document in the workflow's commit message):**
- `FIGMA_API_KEY` secret added to repo Settings → Secrets and variables → Actions.
- `TEST_FILE_KEY` populated by recording the fixture once locally:
  ```bash
  FIGMA_API_KEY=... RECORD=1 bun run --filter @bromso/figma-mcp test real-figma.golden
  ```
- Commit the recorded `file-structure.json` to the repo.

**Step 1: Write the failing test (TDD).** With `FIGMA_API_KEY` unset locally, the test should be SKIPPED — that's the green state for the default test run. No assertions fail because no test runs.

```bash
bun run --filter @bromso/figma-mcp test real-figma.golden
# Expected: 0 failures, 1 skipped.
```

**Step 2: Record the fixture (developer-only).** With a real key:

```bash
FIGMA_API_KEY=fpat_... RECORD=1 \
  bun run --filter @bromso/figma-mcp test real-figma.golden
```

This writes `apps/mcp-server/src/__tests__/fixtures/real-figma/file-structure.json`. Inspect; redact any sensitive node names if the test file isn't fully public-friendly.

**Step 3: Verify replay.** Without `RECORD`, with the key set:

```bash
FIGMA_API_KEY=fpat_... \
  bun run --filter @bromso/figma-mcp test real-figma.golden
# Expected: 1 passed.
```

**Step 4: Add the workflow.** Verify YAML syntax with `actionlint` or by pushing the branch and observing the workflow appears in the Actions tab (no auto-trigger; manual dispatch only).

**Step 5: Verify the default test run still skips it.** This is the critical regression-check:

```bash
unset FIGMA_API_KEY
bun run test
# Expected: real-figma.golden tests are skipped, all others pass.
```

**Step 6: Coverage gate.** The test file is in `__tests__/` and is excluded from coverage scope (the existing `vitest.config.ts` has `exclude: ["src/__tests__/**", "src/main.ts"]`). No coverage adjustments needed.

**Step 7: Commit**

```bash
git add apps/mcp-server/src/__tests__/real-figma.golden.test.ts \
        apps/mcp-server/src/__tests__/fixtures/real-figma/file-structure.json \
        .github/workflows/real-figma.yml
git commit -m "test(mcp-server): real-figma golden harness + manual workflow"
```

**Commit body should mention:**
- Skipped by default; gated on `FIGMA_API_KEY`.
- `RECORD=1` refreshes the fixture.
- Workflow is `workflow_dispatch`-only; no auto-trigger.
- Prerequisite: `FIGMA_API_KEY` secret in repo settings.

---

## Task 9.11: npm publish wiring in `release.yml`

**Goal:** Flip the existing release pipeline from "version-only" to "version + publish to npm." The current step uses `bun changeset tag` — that ONLY creates git tags, it does NOT publish. We replace with `bun changeset publish` and add `NPM_TOKEN` auth + a build step.

**Files:**

- Modify: `.github/workflows/release.yml`

**Diff:**

```diff
 name: Release

 on:
   push:
     branches: [master]

 concurrency:
   group: ${{ github.workflow }}-${{ github.ref }}

 permissions:
   contents: write
   pull-requests: write

 jobs:
   release:
     name: Version Packages
     runs-on: ubuntu-latest
     timeout-minutes: 5

     steps:
       - uses: actions/checkout@v4

       - uses: oven-sh/setup-bun@v2
         with:
           bun-version: "1.3.11"

+      - uses: actions/setup-node@v4
+        with:
+          node-version: "20"
+          registry-url: "https://registry.npmjs.org"
+
       - name: Install dependencies
         run: bun install --frozen-lockfile

+      - name: Build publishable artifacts
+        run: bun run --filter @bromso/figma-mcp build
+
       - name: Create Release PR or Tag
         uses: changesets/action@v1
         with:
           title: "chore: version packages"
           commit: "chore: version packages"
           version: bun changeset version
-          publish: bun changeset tag
+          publish: bun changeset publish
         env:
           GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
+          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
+          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Why `actions/setup-node` even though we use Bun.** `bun changeset publish` invokes `npm publish` under the hood for each publishable package; npm reads the registry URL + auth token via the standard `~/.npmrc` mechanism. `setup-node` is the canonical way to wire that up. `setup-bun` doesn't write `~/.npmrc`, and `bun publish` ≠ `bun changeset publish` (the latter shells out to `npm publish` per package).

**Why `NODE_AUTH_TOKEN` AND `NPM_TOKEN`.** `setup-node` reads `NODE_AUTH_TOKEN`; the changesets action sometimes reads `NPM_TOKEN` directly. Setting both is a belt-and-suspenders defense — costs nothing.

**Why build BEFORE the changesets/action step.** The `files` array in `apps/mcp-server/package.json` includes `dist/**`. Without a fresh build, `npm publish` packs an empty `dist/` (or yesterday's). Running `bun run --filter @bromso/figma-mcp build` immediately before the publish step ensures `dist/main.js` and `dist/plugin/manifest.json` are current.

**Why the build is unconditional.** The changesets action publishes only on the version-bumping merge (it's a no-op when there's no changeset to publish). A wasted build on no-op runs is acceptable — it's seconds, not minutes.

> **Manual prerequisites — call out in commit body and CONTRIBUTING:**
> - Generate an npm access token with publish permission for the `@bromso` scope (or your scope; see Task 9.2's judgment call).
> - Add it to GitHub repo settings: Settings → Secrets and variables → Actions → `NPM_TOKEN`.
> - First publish: a maintainer manually merges the Changesets-generated "Version Packages" PR. The push to master then triggers the release pipeline; the action sees the consumed changeset and publishes.

**Step 1: Modify `release.yml` per the diff.**

**Step 2: Local sanity check** — verify the YAML still parses and the changesets/action options are valid:

```bash
# yamllint, actionlint, or just observe the next CI run.
yamllint .github/workflows/release.yml || true
```

**Step 3: Manually walk through what would happen on merge to master:**
1. CI runs (lint/types/test/build-storybook) on the PR — green.
2. PR merges to master.
3. Release workflow triggers.
4. `bun install` → `bun build @bromso/figma-mcp` (produces `dist/`).
5. Changesets action sees: any unconsumed `.changeset/*.md` → opens "Version Packages" PR. ELSE: any consumed changesets in master that haven't been published → invokes `bun changeset publish`.
6. `bun changeset publish` reads each publishable package's `publishConfig.access`, resolves the npm registry URL via `~/.npmrc` (configured by `setup-node` + `NODE_AUTH_TOKEN`), and runs `npm publish` per package. For v1, that's exactly one package: `@bromso/figma-mcp`.

**Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): wire npm publish + setup-node auth"
```

**Commit body must include:**
- Replaces `bun changeset tag` with `bun changeset publish`.
- Adds `setup-node` for `~/.npmrc` registry auth.
- Adds `bun run --filter @bromso/figma-mcp build` before publish to ensure `dist/` is fresh.
- Manual prerequisite: `NPM_TOKEN` repo secret.

---

## Task 9.12: Phase 9 changeset + acceptance

**Goal:** A changeset declaring the rename + breaking surface, then the final lint/types/test/docs-build pass.

**Files:**

- Create: `.changeset/phase-9-release.md`

**Step 1: Verify all prior tasks landed cleanly:**

```bash
git log master..HEAD --oneline
# Expect 11 commits from tasks 9.1–9.11.
```

**Step 2: Write the changeset:**

```markdown
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
```

**Why `major` for `@bromso/figma-mcp`.** The published name is new (workspace-only `@repo/mcp-server` was never published), so technically v0.0.0 → v1.0.0 is the first publish. `major` is the safe semver class — it signals "first stable public release" to anyone watching the npm changelog.

**Why patch bumps for the internal libs.** They get `updateInternalDependencies: "patch"` from the changesets config; the explicit `patch` here makes that traceable rather than implicit.

**Step 3: Run the full acceptance suite:**

```bash
bun run lint          # biome — zero diagnostics.
bun run types         # tsc --noEmit across all packages.
bun run test          # vitest — all green; real-figma.golden skipped.
bun run --filter @repo/docs build   # next build — no broken links, all meta.json refs resolve.
bun run --filter @bromso/figma-mcp build   # smoke — dist/main.js exists, dist/plugin/ exists.
node apps/mcp-server/dist/main.js --help   # smoke — usage prints, exit 0.
```

If any check fails, FIX in this commit; do NOT proceed to commit if anything is red.

**Step 4: Commit the changeset**

```bash
git add .changeset/phase-9-release.md
git commit -m "chore(changeset): record Phase 9 release"
```

**Step 5: Final summary**

```bash
git log master..HEAD --oneline
# Expect 12 commits.
```

**Phase 9 done.** The repository is publish-ready. Merging to master triggers a Changesets PR; merging the Changesets PR triggers the publish.

---

## Notes on Execution

**Workspace identifier vs published name.** The workspace identifier (the `name` field used by Bun for `bun run --filter` and the workspace symlinks) and the published npm name are DIFFERENT concepts. Phase 1–8 used `@repo/mcp-server` as the workspace identifier; Phase 9 changes it to `@bromso/figma-mcp` so it doubles as the published name. Other packages keep their `@repo/*` identifiers — they're never published, so the identifier need never match a real npm name. If a future phase publishes (e.g.) `@repo/protocol`, that's the time to rename it to `@bromso/figma-mcp-protocol` (or whatever scope is decided). For v1 we're shipping ONE package.

**Why tests are skipped by default.** The real-figma golden suite hits the live Figma REST API. Running it on every PR would (a) require leaking the `FIGMA_API_KEY` secret to PR runners (security smell — forks could exfil), (b) hit Figma rate limits unnecessarily, (c) generate noisy failures on Figma API blips that have nothing to do with the PR. Manual `workflow_dispatch` is the right gate: a maintainer triggers it on demand (e.g. before cutting a release, or when the design doc says "we changed how we read variables").

**Docs preview workflow.** The existing `.github/workflows/docs.yml` builds and deploys `apps/docs` to GitHub Pages on push to master. Phase 9's docs rewrite goes through that same pipeline; no new workflow needed for docs. Local preview: `bun run --filter @repo/docs dev` opens a Next.js dev server.

**What the v1.0.0 release event actually is.** After this Phase 9 PR merges to master:
1. The changeset in `.changeset/phase-9-release.md` is detected by the release workflow.
2. The action opens a "Version Packages" PR that bumps `@bromso/figma-mcp` to `1.0.0` and consumes the changeset (deletes the `.md`, updates CHANGELOG.md).
3. A maintainer reviews and merges the "Version Packages" PR.
4. The release workflow runs again, sees no pending changesets but a newly-version-bumped package, and runs `bun changeset publish` — which publishes `@bromso/figma-mcp@1.0.0` to npm.
5. (Optional, manual) A maintainer creates a GitHub Release at the auto-generated `@bromso/figma-mcp@1.0.0` git tag (Changesets creates this tag as part of `publish`).

The "manual `git tag`" we keep mentioning is actually only manual at step 5; steps 1–4 are automated by the existing pipeline.

**Phase plan history is immutable.** The phase plans in `docs/plans/2026-05-06-figma-mcp-phase-{1..8}.md` reference `@repo/mcp-server` throughout. We do NOT rewrite them when renaming the package — they're historical artifacts of decisions at the time. Future readers should rely on (a) this Phase 9 plan's note about the rename, (b) git log, (c) the `homepage` and `repository.directory` fields in package.json.

**Order-of-execution dependencies inside Phase 9.** Tasks 9.5–9.9 are docs-content and could in principle land in parallel — BUT each one extends `meta.json`. Landing them sequentially (5 → 6 → 7 → 8 → 9) keeps each commit's diff a clean superset. Tasks 9.1 and 9.2 are sequential (9.2 builds on the metadata from 9.1). Tasks 9.3, 9.4, 9.10, 9.11 are independent of each other but collectively depend on 9.2 (the published name affects the README install command, the workflow's filter argument, etc.). Task 9.12 is last.

**Mapping `@repo/mcp-server` → `@bromso/figma-mcp` in unconsumed changesets.** If `bun changeset status` (Task 9.2 Step 4) reports any pending changesets that reference `@repo/mcp-server`, those must be edited inline within Task 9.2's commit. Don't let them bleed into 9.12 — Changesets will fail at version time if a referenced package doesn't exist.

**Why the changeset config switch (`fixed` removed, `ignore` expanded).** Phase 9's posture: only ONE published package, internal libs get `updateInternalDependencies: "patch"` bumps for traceability, everything else (docs, relay, bridge-plugin, ui, common, storybook) is `ignored` so it never accidentally triggers a version bump. The previous `fixed: [["@repo/ui", "@repo/common"]]` was a Phase-0 template config that no longer reflects the dependency graph.

**The build script's bundling tradeoff.** `bun build src/main.ts --target=node --outdir=dist --external:*` marks every dep as external — npm resolves them at install time. The alternative (a fully-bundled `dist/main.js` with deps inlined) gives a single-file artifact but balloons the published size and makes patching transitive deps impossible. We pick the standard Node-style "external deps + bundle local code" approach. If a runtime dep can't be required from the bundle (e.g. wrong module format), narrow `--external:*` to a per-dep list like `--external:@modelcontextprotocol/sdk --external:zod ...`.

**`@bromso/figma-mcp` is callable as `npx`.** With `bin: { "figma-mcp": "./dist/main.js" }`, three invocations all resolve to the same binary:
- `npx @bromso/figma-mcp setup` (npm fetches latest, runs the bin name `figma-mcp`).
- `npx @bromso/figma-mcp@1.0.0 setup` (pinned).
- `figma-mcp setup` (after a global install, OR after the first npx run cached PATH).

**Why we don't ship a CHANGELOG entry inside the changeset itself.** The `.changeset/*.md` body becomes the CHANGELOG.md entry verbatim. Phase 9's body (above) is intentionally human-readable — it reads as a release note.

**`describe.skipIf` semantics.** `describe.skipIf(condition)` skips the entire suite when `condition` is truthy. Our gate is `!FIGMA_API_KEY` — when the key is unset, the suite is skipped; when set, the suite runs. In CI's default test run (no secret), the suite skips silently (vitest reports "1 skipped"); on the manual workflow (secret present), it runs.

**Build artifacts in CI.** The release workflow builds `@bromso/figma-mcp` BEFORE the changesets/action step. The CI workflow (`.github/workflows/ci.yml`) does NOT need a build step — it runs lint/types/test, which work against source. Only the publish path needs `dist/`.

**`engines.node`.** Set to `>=20.10.0` because (a) MCP SDK requires modern Node, (b) the Phase 7 CLI uses `node:test` and `node:fs/promises` features stable since 20.10. We do NOT set `engines.bun` — the published binary runs under Node, not Bun. Bun is dev-time only.

---

## Out of scope

- **Figma Community plugin submission.** Phase 9 documents the process in CONTRIBUTING but does not submit. The submission requires (a) the bridge plugin manifest finalized with a permanent ID assigned by Figma's plugin developer console, (b) a screenshot/cover-image asset, (c) a manual upload via Figma Desktop's "Manage plugins" → "Submit." Tracked as a launch-checklist item, not a code task.
- **Publishing `@repo/protocol`, `@repo/transport`, `@repo/figma-adapter`, the four `@repo/tools-*` packs.** Deferred to v1.1+. The decision rationale is in Task 9.1's Step 1 audit: v1 ships ONE artifact for surface-area discipline.
- **CHANGELOG generation polish.** Changesets default output is fine. Bespoke release-note formatting (grouped by feature, screenshots, migration guides) is v1.1+.
- **Multi-shim coordination over a single relay session.** Phase 8+ feature; the docs reference it as roadmap, not v1.
- **Bridge plugin's manifest `id`.** The plugin manifest currently uses a placeholder; replacing with the real ID assigned by Figma's developer console happens during Community submission, not in Phase 9 code.
- **The deferred 4 tool packs (`-figjam`, `-slides`, `-a11y`, `-rest`).** Roadmap Phase 8+; not part of v1 acceptance.
- **The actual `git tag v1.0.0` and GitHub Release press-button.** Wired but not pressed; happens after Changesets PR merges.
- **Per-package CHANGELOG.md curation.** Auto-generated by Changesets; we don't hand-edit.
- **Telemetry/analytics on tool usage.** Same posture as Phase 7. Zero telemetry in v1.
- **A `figma-mcp uninstall` command.** Out of v1.
- **Doctor's `--strict` exit-code mode** (mentioned in troubleshooting as a future flag).
- **Cross-OS installer beyond `npx`** (no Homebrew formula, no Scoop bucket, no Windows MSI).
- **Auto-update of the published binary** (npm handles version pinning; users opt in to upgrades).
- **OAuth / interactive login for cloud mode.** Pairing codes only; same as Phase 6.
- **Older VS Code Copilot config layouts** (`settings.json`-embedded MCP). Phase 7 only writes the modern `mcp.json` path.
- **Storybook publishing as a separate npm artifact.** Storybook is a docs-time tool; deployed as part of GitHub Pages, never published to npm.
- **Republishing on every PR merge** (only changeset-bumping merges trigger a publish; no-op merges are no-ops).
- **A monorepo-wide single-version policy.** Each publishable package versions independently; v1 has one publishable, so the question is moot today, deferred when libs go public.

---

## References

- Phase 1 plan (protocol foundations): `docs/plans/2026-05-06-figma-mcp-phase-1.md`
- Phase 2 plan (transport + figma-adapter): `docs/plans/2026-05-06-figma-mcp-phase-2.md`
- Phase 3 plan (canonical pack pattern): `docs/plans/2026-05-06-figma-mcp-phase-3.md`
- Phase 4 plan (daemon): `docs/plans/2026-05-06-figma-mcp-phase-4.md`
- Phase 5 plan (variables + streaming): `docs/plans/2026-05-06-figma-mcp-phase-5.md`
- Phase 6 plan (cloud relay): `docs/plans/2026-05-06-figma-mcp-phase-6.md`
- Phase 7 plan (setup CLI + diagnostics): `docs/plans/2026-05-06-figma-mcp-phase-7.md`
- Phase 8 plan (tool pack expansion): `docs/plans/2026-05-06-figma-mcp-phase-8.md`
- Design doc: `docs/plans/2026-05-06-figma-mcp-rewrite-design.md`
- Roadmap: `docs/plans/2026-05-06-figma-mcp-rewrite-plan.md` (Phase 9 high-level scope, lines 1165–1180)
- Existing release pipeline: `.github/workflows/release.yml`
- Existing CI pipeline: `.github/workflows/ci.yml`
- Existing docs deploy pipeline: `.github/workflows/docs.yml`
- Changesets config: `.changeset/config.json`
- Phase 7 CLI tree (provides the `figma-mcp setup`/`doctor`/`--print-path` surface that the docs document): `apps/mcp-server/src/cli/`
- Phase 7 plan's per-client config table (Task 7.2): `docs/plans/2026-05-06-figma-mcp-phase-7.md`
- [Changesets — publishing packages](https://github.com/changesets/changesets/blob/main/docs/automating-changesets.md)
- [Changesets `publishConfig` precedence](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md#access)
- [npm publish access](https://docs.npmjs.com/cli/v10/commands/npm-publish#access)
- [`actions/setup-node` — registry auth](https://github.com/actions/setup-node#usage)
- [Figma REST API — files endpoint](https://www.figma.com/developers/api#files-endpoints)
- [Fumadocs — meta.json structure](https://fumadocs.vercel.app/docs/headless/page-tree)
- [MCP — Streamable HTTP transport](https://modelcontextprotocol.io/specification/2024-11-05/basic/transports#streamable-http)
- [Figma Plugin Manifest reference](https://developers.figma.com/docs/plugins/manifest/)
- [Figma Plugin Community submission](https://help.figma.com/hc/en-us/articles/360044336873-Get-started-using-plugins-from-the-Figma-Community)
