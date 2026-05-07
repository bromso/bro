export const USAGE = `Usage: figma-mcp [command] [options]

Commands:
  (no command)         Run as MCP stdio shim (default; spawns daemon if needed).
  setup                Detect AI clients and write their MCP configs.
  doctor               Diagnose daemon, plugin pairing, and AI client configs.

Options:
  --print-path         Print the bundled bridge-plugin manifest path and exit.
  --help, -h           Show this usage text.

setup options:
  --dry-run            Print actions without writing any files.
  --client <id>        Only configure the named client (claude-code|claude-desktop|cursor|windsurf|copilot).
  --cloud              Configure for the cloud relay; pairs and prints a 6-digit code.
  --open-figma         Open the bundled plugin manifest in the OS file picker for drag-import.
  --relay-url <url>    Override the relay base URL (default: https://figma-mcp-relay.bromso.workers.dev).

doctor options:
  --json               Emit JSON output for tooling consumption.
`;
