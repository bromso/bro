---
"@bromso/figma-mcp": minor
"@repo/transport": minor
---

Phase 7: Setup CLI + diagnostics.

`@bromso/figma-mcp` (apps/mcp-server) gains a CLI dispatch layer:

- `figma-mcp setup` detects installed AI clients (Claude Code,
  Claude Desktop, Cursor, Windsurf, VS Code Copilot) and writes
  their MCP config entries atomically, preserving siblings.
- `figma-mcp setup --cloud` pairs with the relay (Phase 6) and
  writes Streamable HTTP entries pointing at `/mcp/{sessionId}`.
- `figma-mcp setup --dry-run` and `--client <id>` for previewing
  and scoping.
- `figma-mcp setup --open-figma` reveals the bundled bridge
  plugin manifest in the OS file picker.
- `figma-mcp doctor` runs parallel health checks: daemon
  liveness, lockfile staleness, plugin pairing, AI client
  config drift, recent errors, socket/port conflict. `--json`
  for machine output.
- `figma-mcp --print-path` resolves the bundled bridge plugin
  manifest path.
- `figma-mcp --help` prints usage.

`@repo/transport` (packages/transport) gains:

- `pickIpcTransport(platform)` selector: Unix socket on
  POSIX, named pipe on win32.
- `NamedPipeServerTransport` / `NamedPipeClientTransport`
  re-exports (Node's `node:net` accepts pipe paths verbatim).

Out of scope: production relay URL (Phase 9), Windows beyond
unit-tested selector, telemetry, auto-update, doctor --fix.
