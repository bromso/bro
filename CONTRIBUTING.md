# Contributing to figma-mcp

Welcome — bug fixes, new tools, doc improvements, and architectural ideas are all on the table.

## Prerequisites

- [Bun](https://bun.sh) **1.3.11** — `bun.lock` is the source of truth for dependency resolution.
- [Node](https://nodejs.org) **≥ 20.10** — matches the published binary's `engines` constraint.
- **Figma desktop** — required to test the bridge plugin.
- _Optional_: [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/) — if touching `apps/relay`.

## Getting started

```bash
git clone https://github.com/bromso/bro.git
cd bro
bun install
bun run test                                     # run all tests across packages
bun run --filter @repo/docs dev                  # docs site at http://localhost:3000
```

## Repo layout

The repo is a Turborepo monorepo. The published artifact is `@bromso/figma-mcp` (everything else is internal).

```
apps/
  mcp-server/      The published binary (@bromso/figma-mcp). CLI + shim + daemon.
  bridge-plugin/   The Figma plugin runtime. Drag-imported into Figma desktop.
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

## Development workflow

| Command                                       | What it does                                   |
|-----------------------------------------------|------------------------------------------------|
| `bun run dev`                                 | Watch mode (parallel via Turborepo).           |
| `bun run test`                                | Run all tests via Vitest.                      |
| `bun run lint`                                | Biome lint + format check.                     |
| `bun run types`                               | `tsc --noEmit` per package.                    |
| `bun run --filter @bromso/figma-mcp test`     | Scoped run for the published package.          |
| `bun run --filter @repo/docs dev`             | Local docs site preview.                       |
| `bun run storybook`                           | Storybook for the bridge plugin's UI.          |

## Branching policy

| Prefix    | Use for                                            |
|-----------|----------------------------------------------------|
| `feat/`   | New features, new tools, new tool packs.           |
| `fix/`    | Bug fixes.                                         |
| `chore/`  | Lockfile bumps, CI tweaks, internal refactors.     |
| `docs/`   | Docs-only changes (README, CONTRIBUTING, site).    |

**Phase branches** — `feat/phase-N-<slug>` — track multi-task plans checked into `docs/plans/`. The plan is the source of truth; the executor follows it task-by-task and commits per task.

## Commit messages

Conventional Commits with a scope:

```
feat(mcp-server): wire CLI dispatcher into main.ts
fix(transport): drop messages received before first onMessage handler
chore(changeset): record Phase 8 tools-console + tools-design
```

The scope is the package or app. Use `!` after the scope (`feat(mcp-server)!:`) for breaking changes.

## Changesets policy

Every change to a **publishable** package requires a changeset:

```bash
bun changeset
# pick affected packages, choose patch/minor/major, write a one-paragraph summary
```

- **Internal-only refactors** (no published surface change): no changeset needed.
- **Phase-completion changesets** land in the same PR as the phase.
- **Major bumps** must have a `!` in the matching commit.

The release workflow consumes pending changesets on every merge to `master` and either opens a "Version Packages" PR or publishes to npm — see `.github/workflows/release.yml`.

### Don't add a changeset that only references ignored packages

The `.changeset/config.json` `ignore` list contains packages that never publish to npm: `@repo/docs`, `@repo/storybook`, `@repo/relay`, `@repo/bridge-plugin`, `@repo/ui`, `@repo/common`. These deploy to other surfaces (GitHub Pages, Cloudflare, Figma Community).

A changeset that touches **only** ignored packages is a footgun: `changesets/action@v1` checks for the file's existence, not its contents. With at least one changeset present, the action takes the version+PR path. The version step then produces no diff (every referenced package is ignored), and the action force-pushes an empty branch and tries to open a PR — which fails with `"No commits between master and changeset-release/master"`.

This blocks **all subsequent merges** from triggering a real publish until the offending file is deleted. We've hit this twice (PR #13, PR #25); fix the trap by simply not adding a changeset for changes that only affect ignored packages.

**Quick rule**: if every package your PR touches has `"private": true` AND appears in the `ignore` list, do NOT add a changeset. The work is documented in commit messages and any plan docs in `docs/plans/`.

If you're unsure, run `bun changeset status` after creating the file — if it reports nothing to bump (or only ignored entries), delete the changeset before merging.

## Coverage gates

Each package's `vitest.config.ts` enforces its own threshold:

| Package                                | Lines | Branches | Functions | Statements |
|----------------------------------------|-------|----------|-----------|------------|
| `@repo/protocol`, `@repo/transport`    | 90    | 85       | 90        | 90         |
| `@repo/figma-adapter`                  | 90    | 85       | 90        | 90         |
| `@repo/tools-*`                        | 90    | 85       | 90        | 90         |
| `@bromso/figma-mcp`                    | 80    | 75       | 80        | 80         |
| `@repo/relay`                          | 80    | 75       | 80        | 80         |

CI fails if a threshold drops. Run `bun run --filter <pkg> test --coverage` locally to see the report.

## Adding a new tool pack

The canonical example is `packages/tools-extract/`. To add a new pack `tools-foo`:

1. Scaffold the package at `packages/tools-foo/` mirroring `tools-extract`'s shape (`package.json`, `tsconfig.json`, `vitest.config.ts`, `src/{tools,plugin-handlers,index}.ts`).
2. Define schemas in `src/tools.ts` using `defineTool({name, description, streaming, input, output})` from `@repo/protocol`.
3. Implement plugin handlers in `src/plugin-handlers.ts` against `@repo/figma-adapter`'s `FigmaAdapter` interface.
4. (Optional) Implement server handlers in `src/server-handlers.ts` for REST-API-backed tools.
5. Test against `FigmaFake` from `@repo/figma-adapter/testing`. Hit ≥90/85 coverage.
6. Wire the pack into `apps/mcp-server/src/main.ts` (registry + shim catalog) and `apps/bridge-plugin/src/plugin.ts` (runtime handler registration).
7. Add a changeset and a Phase plan if the pack ships >5 tools.

## Shipping the bridge plugin to Figma Community

The bundled bridge plugin in `apps/bridge-plugin/` is built into the published `@bromso/figma-mcp` artifact. To list it on the [Figma Plugin Community](https://www.figma.com/community):

1. Build: `bun run --filter @repo/bridge-plugin build` produces `apps/bridge-plugin/dist/`.
2. Sign in to the [Figma developer portal](https://www.figma.com/developers/plugins).
3. Submit the built `dist/` for review.

The submission process is manual and outside this repo's CI. Submission only matters if you want to ship the plugin separately from the npm package.

## Reporting bugs

When opening an issue, include:

- The output of `figma-mcp doctor --json` (run after the bug repros).
- The AI client and version (e.g. Claude Code 1.0.x).
- The relevant section of `~/.figma-mcp/daemon.log` (last 50 lines).
- Steps to reproduce.

## License

By contributing, you agree your contributions are MIT-licensed.
