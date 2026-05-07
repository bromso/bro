/**
 * Plugin sandbox entry — runs in Figma's plugin runtime (no DOM).
 *
 * Connects to the daemon over WebSocket, builds a `BridgePluginRuntime`
 * with a `RealFigmaAdapter`, registers the canonical extract handlers,
 * and starts the message dispatch loop.
 *
 * Also mounts the status-panel iframe (`figma.showUI`) and forwards
 * `connection-state` transitions to it via `figma.ui.postMessage`.
 *
 * The `start()` function is exported but NOT invoked here — the bottom
 * `start().catch(...)` lives in `plugin-bootstrap.ts`. This split lets
 * tests import this module without spinning up a real WS connection.
 */
import { RealFigmaAdapter } from "@repo/figma-adapter";
import { ConsoleStore, installConsoleCapture } from "@repo/tools-console";
import {
  ExtractComponents,
  ExtractLocalVariables,
  ExtractStyles,
  extractComponentsPluginHandler,
  extractLocalVariablesPluginHandler,
  extractStylesPluginHandler,
} from "@repo/tools-extract";
import { WebSocketClientTransport } from "@repo/transport";
import { BridgePluginRuntime } from "./runtime";

const VERSION = "0.0.0";

type ConnectionState = "disconnected" | "connecting" | "connected" | "version-mismatch";

export async function start(): Promise<void> {
  const consoleStore = new ConsoleStore();
  installConsoleCapture({ store: consoleStore });

  figma.showUI(__html__, { width: 320, height: 200 });

  const post = (state: ConnectionState) =>
    figma.ui.postMessage({ kind: "connection-state", state });

  post("connecting");
  try {
    const transport = await WebSocketClientTransport.connect({
      url: "ws://127.0.0.1:9223",
      WebSocketCtor: globalThis.WebSocket as never,
    });
    const runtime = new BridgePluginRuntime({
      transport,
      version: VERSION,
      figma: new RealFigmaAdapter(),
    });
    runtime.register(ExtractStyles, extractStylesPluginHandler);
    runtime.register(ExtractComponents, extractComponentsPluginHandler);
    runtime.register(ExtractLocalVariables, extractLocalVariablesPluginHandler);
    runtime.start();
    post("connected");
  } catch (err) {
    post("disconnected");
    throw err;
  }
}
