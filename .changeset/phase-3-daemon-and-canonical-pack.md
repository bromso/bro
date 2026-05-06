---
"@repo/tools-extract": minor
"@repo/mcp-server": minor
"@repo/transport": minor
"@repo/figma-adapter": minor
---

Phase 3: daemon + canonical feature pack end-to-end.

- @repo/mcp-server (apps/mcp-server) — daemon process model with
  Unix-socket IPC, lockfile-based single-instance enforcement, MCP
  stdio shim that proxies tool calls to the daemon, and `@modelcontextprotocol/sdk`
  bridge for tool registration.
- @repo/tools-extract — canonical feature pack with
  `extract_styles`, `extract_components`, `extract_local_variables`,
  `bridge_status`. Pattern is mechanical for later packs.
- @repo/transport — Unix-socket server + client transports.
- @repo/figma-adapter — extended to cover paint/text/effect styles
  and components.

Verified end-to-end (in-memory + real-process spawn). No published
package consumes these yet — all `private: true`.
