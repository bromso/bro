# figma-plugin-template

[![CI](https://github.com/bromso/figma-plugin-template/actions/workflows/ci.yml/badge.svg)](https://github.com/bromso/figma-plugin-template/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/bromso/figma-plugin-template)](LICENSE)
![Bun](https://img.shields.io/badge/bun-1.3-f9f1e1?logo=bun)
![TypeScript](https://img.shields.io/badge/typescript-6-3178c6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/react-19-61dafb?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/vite-8-646cff?logo=vite&logoColor=white)
![Turborepo](https://img.shields.io/badge/turborepo-2-ef4444?logo=turborepo&logoColor=white)
![Biome](https://img.shields.io/badge/biome-2-60a5fa?logo=biome&logoColor=white)
![Storybook](https://img.shields.io/badge/storybook-10-ff4785?logo=storybook&logoColor=white)
![Figma](https://img.shields.io/badge/figma-plugin-a259ff?logo=figma&logoColor=white)

Figma/FigJam plugin boilerplate with React, Vite, TypeScript, and Turborepo monorepo.

## Features

- **Turborepo monorepo** with Bun package manager — fast installs, cached builds
- **React + TypeScript + Vite** build pipeline
- **Single-file HTML output** — required by the Figma plugin API (all assets inlined)
- **14+ UI components** via shadcn/ui + custom Figma components (Button, Input, Select, Accordion, Icon, and more)
- **Storybook 10** for interactive component documentation with play tests
- **Vitest** for testing (happy-dom for UI, node for common packages)
- **Biome** for linting and formatting
- **Type-safe message passing** between plugin and UI via monorepo-networker

## Quick Start

```bash
# Clone the template
git clone https://github.com/bromso/figma-plugin-template.git
cd figma-plugin-template

# Install dependencies
bun install

# Start development
bun run dev
```

## Project Structure

```
apps/
  design-plugin/  — Figma plugin app (Vite builds to dist/)
  storybook/      — Storybook component documentation
packages/
  common/         — Shared types and network events (@repo/common)
  ui/             — UI components, styles, and app shell (@repo/ui)
```

Packages are **JIT source-only** — they export raw TypeScript with no build step. Use `@repo/*` workspace imports for cross-package references.

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Watch mode (plugin + UI via Turborepo) |
| `bun run build` | Production build |
| `bun run test` | Run all tests |
| `bun run test:watch` | Watch mode for tests |
| `bun run lint` | Lint with Biome |
| `bun run storybook` | Start Storybook dev server |
| `turbo run build-storybook` | Build static Storybook (cached) |

## Architecture

The plugin runs as **two separate processes** that communicate via message passing:

- **Plugin side** (`apps/design-plugin/src/plugin/`) — Runs in Figma's sandbox with access to the Figma API (`figma.*`). No DOM access. Entry: `plugin.ts`.
- **UI side** (`packages/ui/src/`) — Runs in an iframe. React app with shadcn/ui components. Entry: `main.tsx` → `app.tsx`.
- **Common** (`packages/common/src/`) — Shared between both sides. Contains network event type definitions.

### Messaging

Communication uses [monorepo-networker](https://github.com/CoconutGoodie/monorepo-networker):

1. **Define events** in `packages/common/src/networkSides.ts` — each side declares the events it listens to with typed signatures.
2. **Build channels** in `*.network.ts` files — set up postMessage transport and register handlers.
3. **Use channels** — `PLUGIN_CHANNEL.emit(UI, "event", [args])` for fire-and-forget, `.request(...)` for request/response (returns a Promise).

## UI Components

`packages/ui` provides 14+ components via [shadcn/ui](https://ui.shadcn.com) and custom Figma-specific components:

**shadcn/ui:** `Accordion`, `Alert`, `Button`, `Checkbox`, `Input`, `Label`, `RadioGroup`, `Select`, `Switch`, `Textarea`

**Custom Figma:** `Icon`, `IconButton`, `SectionTitle`, `Type`

Run `bun run storybook` to browse all components interactively with live examples.

## Plugin Configuration

Edit `apps/design-plugin/figma.manifest.ts` to set your plugin name, ID, and permissions:

```ts
export default {
  name: "My Plugin",
  id: "your-plugin-id-from-figma",
  // ...
};
```

Get your plugin ID from Figma: **Plugins > Manage plugins > Create new plugin**.

## Testing in Figma

1. Run `bun run build`
2. Open the Figma desktop app
3. Go to **Plugins > Development > Import plugin from manifest**
4. Select `apps/design-plugin/dist/manifest.json`

For active development, use `bun run dev` to keep the build updated automatically.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and development workflow.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
