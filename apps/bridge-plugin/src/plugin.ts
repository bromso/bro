/**
 * Plugin sandbox entry — runs in Figma's plugin runtime (no DOM).
 *
 * Connects to the daemon over WebSocket, builds a `BridgePluginRuntime`
 * with a `RealFigmaAdapter`, registers the canonical extract handlers,
 * and starts the message dispatch loop.
 *
 * The `start()` function is exported but NOT invoked here — the bottom
 * `start().catch(...)` lives in `plugin-bootstrap.ts`. This split lets
 * tests import this module without spinning up a real WS connection.
 */
import { RealFigmaAdapter } from "@repo/figma-adapter";
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

export async function start(): Promise<void> {
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
}
