---
"@bromso/figma-mcp": minor
---

`figma-mcp doctor --fix` mode. The new flag runs the existing 6 doctor
checks, then auto-applies fixes for the two automatable failure modes:

- `daemon-liveness` with a stale lockfile → `LockfileManager.clear()`.
- `ai-client-configs` with config drift → re-runs the per-client setup
  write against detected clients (idempotent).

Non-automatable checks (plugin-pairing, socket-conflict, recent-errors,
figma-api-key) print their manual fix instructions but take no action.

The default `figma-mcp doctor` (no flag) is unchanged.
