# Contributing

Thank you for your interest in contributing to figma-plugin-template! We welcome all contributions — bug fixes, improvements, and new features.

## Prerequisites

- Node.js >= 18
- [Bun](https://bun.sh) >= 1.0
- Figma desktop app (for plugin testing)

## Getting Started

```bash
git clone https://github.com/bromso/figma-plugin-template.git
cd figma-plugin-template
bun install
bun run build
```

## Development Workflow

| Command | Description |
|---------|-------------|
| `bun run dev` | Watch mode (plugin + UI via Turborepo) |
| `bun run build` | Production build to `apps/figma-plugin/dist/` |
| `bun run test` | Run all tests (Vitest) |
| `bun run test:watch` | Watch mode for tests |
| `bun run lint` | Lint with Biome |
| `bun run storybook` | Start Storybook dev server |

## Project Structure

This is a Turborepo monorepo:

```
apps/
  design-plugin/  — The Figma plugin application
  storybook/      — Storybook for component documentation
packages/
  common/         — Shared types and network events (@repo/common)
  ui/             — UI components and styles (@repo/ui)
```

Packages are **JIT source-only** — they export raw TypeScript with no build step. Use `@repo/*` workspace imports for cross-package references (e.g., `import { Button } from '@repo/ui'`).

## Testing in Figma

1. Run `bun run build` (or `bun run dev` for watch mode)
2. Open the Figma desktop app
3. Go to **Plugins > Development > Import plugin from manifest**
4. Select `apps/figma-plugin/dist/manifest.json`

## Submitting a Pull Request

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes and ensure all checks pass:
   ```bash
   bun run build
   bun run test
   bun run lint
   ```
4. Commit with a descriptive message
5. Push and open a PR against `master`
6. Describe what changed and why in the PR description

## Branch Naming

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feat/` | New features | `feat/color-picker-plugin` |
| `fix/` | Bug fixes | `fix/icon-render-crash` |
| `chore/` | Maintenance, deps | `chore/update-react-19` |
| `docs/` | Documentation | `docs/add-api-guide` |

## Commit Messages

Use [conventional commits](https://www.conventionalcommits.org/):

```
feat: add color picker component
fix: resolve icon rendering in dark mode
chore: update dependencies
docs: add plugin testing guide
```

## Versioning

This project uses [changesets](https://github.com/changesets/changesets) for versioning.

**After making changes**, run:

```bash
bun changeset
```

This creates a changeset file describing your changes. Commit it with your PR.

A GitHub Action will automatically create a "Version Packages" PR that bumps the version and updates CHANGELOG.md. Merging that PR creates a new release.

**Version types:**
- **Major** (2.0.0): Breaking changes to template structure
- **Minor** (1.4.0): New features, components, or skills
- **Patch** (1.3.1): Bug fixes, dependency updates

## Code Style

- **Biome** handles linting and formatting — pre-commit hooks run automatically
- Use **TypeScript strict mode**
- Use `@repo/*` imports for cross-package references (not relative paths)
