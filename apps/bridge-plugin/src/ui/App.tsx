/**
 * Status panel React component for the bridge-plugin iframe.
 *
 * Displays the daemon-connection lifecycle of the plugin sandbox.
 * The sandbox owns the truth (it holds the WebSocket); this UI is a
 * read-only mirror that listens for `figma.ui.postMessage` payloads
 * tagged `kind: "connection-state"`.
 *
 * Bigger UI affordances (action buttons, structured layouts via
 * @repo/ui) are deferred to Phase 7 — Tailwind utilities only here.
 */
import { type JSX, useEffect, useState } from "react";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "version-mismatch";

export function App(): JSX.Element {
  const [state, setState] = useState<ConnectionState>("disconnected");

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const data = (
        event.data as { pluginMessage?: { kind?: string; state?: ConnectionState } } | null
      )?.pluginMessage;
      if (data?.kind === "connection-state" && data.state) setState(data.state);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  return (
    <div className="p-4 text-sm font-medium" data-testid="status-panel">
      <div>Figma MCP Bridge</div>
      <div className="mt-2 text-xs opacity-70">{state}</div>
    </div>
  );
}
