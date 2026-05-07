# @bromso/figma-mcp

> MCP server that lets your AI design in Figma.

[![CI](https://github.com/bromso/bro/actions/workflows/ci.yml/badge.svg)](https://github.com/bromso/bro/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@bromso/figma-mcp)](https://www.npmjs.com/package/@bromso/figma-mcp)
[![License: MIT](https://img.shields.io/github/license/bromso/bro)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A520.10-339933?logo=node.js&logoColor=white)
![Bun](https://img.shields.io/badge/bun-1.3-f9f1e1?logo=bun)

`figma-mcp` is a Model Context Protocol server that bridges any MCP-aware AI client — Claude Code, Claude Desktop, Cursor, Windsurf, VS Code Copilot — to a running Figma instance. Through a bundled Figma plugin it exposes ~25 tools across selection extraction, variable read/write, console capture, and canvas mutation. Designed for developers who use AI coding agents and design in Figma.

## Quick start

```bash
npx @bromso/figma-mcp setup     # detect AI clients, write MCP configs
# Open Figma desktop and drag-import the bundled plugin
figma-mcp doctor                # verify daemon liveness, plugin pairing, configs
```

For a step-by-step walkthrough with screenshots, see the [quickstart guide](https://bromso.github.io/bro/docs/getting-started). For per-client install instructions, see the [client matrix](https://bromso.github.io/bro/docs/clients).

## Supported AI clients

| Client            | Config path                                                              | Setup writes                |
|-------------------|--------------------------------------------------------------------------|-----------------------------|
| Claude Code       | `~/.claude.json`                                                         | `mcpServers.figma`          |
| Claude Desktop    | `~/Library/Application Support/Claude/claude_desktop_config.json`*       | `mcpServers.figma`          |
| Cursor            | `~/.cursor/mcp.json`                                                     | `mcpServers.figma`          |
| Windsurf          | `~/.codeium/windsurf/mcp_config.json`                                    | `mcpServers.figma`          |
| VS Code Copilot   | `~/Library/Application Support/Code/User/mcp.json`*                      | `mcpServers.figma`          |

\* macOS path; Linux uses `~/.config/...`, Windows uses `%APPDATA%`.

`figma-mcp setup --client <id>` configures one client only. `figma-mcp setup --dry-run` previews actions without writing. `figma-mcp setup --cloud` pairs through the optional cloud relay for environments without local IPC.

## What's in the box

- **Stdio shim + per-user daemon.** First invocation forks a daemon; subsequent AI clients reuse it via Unix socket / named pipe.
- **Bundled bridge plugin.** Drag-imported once; pairs over loopback WebSocket. `figma-mcp --print-path` prints the manifest location for `--open-figma` to reveal in Finder/Explorer.
- **Optional cloud relay.** Cloudflare Worker + Durable Objects + WebSocket Hibernation. Used when the AI client and the Figma user aren't on the same machine.
- **Tool packs.** `extract` (selection, components, variables, styles), `variables` (read/write/streamed import), `console` (plugin-sandbox log capture + query), `design` (canvas mutation: shapes, text, fills, components).
- **`figma-mcp doctor`.** Parallel checks: daemon liveness, plugin pairing, AI-client config drift, recent errors, socket conflicts. `--json` for machine consumption.

## Architecture

```
AI client (Claude/Cursor/etc.)
        │
        │ stdio MCP
        ▼
   figma-mcp shim ──────► daemon ◄──── shim ◄── another AI client
                            │
                  WebSocket │ (loopback or cloud relay)
                            ▼
                  Bridge plugin (Figma sandbox)
                            │
                  figma.* API calls
                            ▼
                       Figma file
```

A single daemon multiplexes multiple AI clients onto one bridge-plugin connection. See [Architecture](https://bromso.github.io/bro/docs/architecture) for depth.

## Project layout

The published artifact is `@bromso/figma-mcp` from `apps/mcp-server`. The repo is a Turborepo monorepo with internal packages for protocol, transport, figma-adapter, and tool packs. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full layout.

## Versioning

Releases are managed by [Changesets](https://github.com/changesets/changesets). Every user-facing change adds a changeset; merging to `master` triggers the release workflow which version-bumps and publishes to npm. See [CONTRIBUTING.md](./CONTRIBUTING.md#changesets-policy).

## Links

- [Documentation](https://bromso.github.io/bro)
- [Issues](https://github.com/bromso/bro/issues)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [LICENSE](./LICENSE)

## License

MIT — see [LICENSE](./LICENSE).
