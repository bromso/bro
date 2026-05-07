---
"@bromso/figma-mcp": patch
"@repo/tools-console": patch
---

Phase 14: hardening (three deferred reviewer follow-ups).

`@bromso/figma-mcp`:

- **IPC path unification (Phase 7 follow-up).** The daemon now uses
  `pickIpcTransport({platform}).socketPath` everywhere (was a hardcoded
  Unix path on line 232 of `main.ts`). Daemon and `figma-mcp doctor`
  now agree on Windows where the path is a named pipe rather than a
  Unix socket. macOS/Linux behavior unchanged.

- **`figma-api-key` doctor check (Phase 11 follow-up).** A sixth check
  in `figma-mcp doctor` warns when `FIGMA_API_KEY` is not set in the
  daemon's environment — without it, the 20 tools in `@repo/tools-rest`
  fail per-call with `E_FIGMA_API_KEY_MISSING`. The check returns
  `warn` (not `error`) — the daemon boots fine without the key; only
  the REST pack is gated.

`@repo/tools-console`:

- **`query_console` DoS hardening (Phase 8 follow-up).** Pattern length
  capped at 200 chars via the Zod schema; each console message
  truncated to its first 1000 chars before `regex.test` runs. The full
  message is still returned on a hit — only the matching surface is
  bounded. Worst-case input (100KB message + classic `^(a+)+$`
  backtracking pattern) now finishes in <2s instead of hanging.

Out of scope: real-Figma golden coverage promotion; Webhook tools;
OAuth-based auth; doctor `--fix` mode; Windows runtime testing in CI
(still macOS-only).
