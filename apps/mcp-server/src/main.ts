/**
 * @repo/mcp-server — entry point.
 *
 * Two modes selected by CLI flag (resolved in Task 3.14's orchestrator):
 *   - default (no flag): stdio shim. Forks a daemon if none is running.
 *   - --daemon: daemon main loop. Launched detached by a stdio shim.
 *
 * Subsequent tasks fill in the implementation. This file currently
 * exits zero so the package builds and lints cleanly.
 */
process.exit(0);
