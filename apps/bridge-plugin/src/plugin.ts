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
import {
  ClearConsole,
  ConsoleStatusTool,
  ConsoleStore,
  clearConsolePluginHandler,
  consoleStatusPluginHandler,
  GetConsoleErrors,
  GetConsoleLogs,
  GetConsoleWarnings,
  getConsoleErrorsPluginHandler,
  getConsoleLogsPluginHandler,
  getConsoleWarningsPluginHandler,
  installConsoleCapture,
  QueryConsole,
  queryConsolePluginHandler,
} from "@repo/tools-console";
import {
  CloneNode,
  CreateComponent,
  CreateEllipse,
  CreateFrame,
  CreateLine,
  CreateRectangle,
  CreateText,
  cloneNodePluginHandler,
  createComponentPluginHandler,
  createEllipsePluginHandler,
  createFramePluginHandler,
  createLinePluginHandler,
  createRectanglePluginHandler,
  createTextPluginHandler,
  DeleteNode,
  deleteNodePluginHandler,
  ResizeNode,
  resizeNodePluginHandler,
  SetFill,
  SetStroke,
  SetTextContent,
  setFillPluginHandler,
  setStrokePluginHandler,
  setTextContentPluginHandler,
} from "@repo/tools-design";
import {
  ExtractComponents,
  ExtractLocalVariables,
  ExtractStyles,
  extractComponentsPluginHandler,
  extractLocalVariablesPluginHandler,
  extractStylesPluginHandler,
} from "@repo/tools-extract";
import {
  CreateCodeBlock,
  CreateConnector,
  CreateSection,
  CreateShapeWithText,
  CreateSticky,
  CreateTable,
  createCodeBlockPluginHandler,
  createConnectorPluginHandler,
  createSectionPluginHandler,
  createShapeWithTextPluginHandler,
  createStickyPluginHandler,
  createTablePluginHandler,
  ListSectionChildren,
  listSectionChildrenPluginHandler,
  MoveIntoSection,
  moveIntoSectionPluginHandler,
  SetSectionName,
  SetStickyContent,
  setSectionNamePluginHandler,
  setStickyContentPluginHandler,
} from "@repo/tools-figjam";
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

    runtime.register(GetConsoleLogs, getConsoleLogsPluginHandler);
    runtime.register(ClearConsole, clearConsolePluginHandler);
    runtime.register(GetConsoleErrors, getConsoleErrorsPluginHandler);
    runtime.register(GetConsoleWarnings, getConsoleWarningsPluginHandler);
    runtime.register(QueryConsole, queryConsolePluginHandler);
    runtime.register(ConsoleStatusTool, consoleStatusPluginHandler);

    runtime.register(CreateRectangle, createRectanglePluginHandler);
    runtime.register(CreateFrame, createFramePluginHandler);
    runtime.register(CreateEllipse, createEllipsePluginHandler);
    runtime.register(CreateLine, createLinePluginHandler);
    runtime.register(CreateText, createTextPluginHandler);
    runtime.register(SetTextContent, setTextContentPluginHandler);
    runtime.register(SetFill, setFillPluginHandler);
    runtime.register(SetStroke, setStrokePluginHandler);
    runtime.register(ResizeNode, resizeNodePluginHandler);
    runtime.register(CloneNode, cloneNodePluginHandler);
    runtime.register(DeleteNode, deleteNodePluginHandler);
    runtime.register(CreateComponent, createComponentPluginHandler);

    runtime.register(CreateSticky, createStickyPluginHandler);
    runtime.register(CreateSection, createSectionPluginHandler);
    runtime.register(CreateConnector, createConnectorPluginHandler);
    runtime.register(CreateCodeBlock, createCodeBlockPluginHandler);
    runtime.register(CreateShapeWithText, createShapeWithTextPluginHandler);
    runtime.register(CreateTable, createTablePluginHandler);
    runtime.register(SetStickyContent, setStickyContentPluginHandler);
    runtime.register(SetSectionName, setSectionNamePluginHandler);
    runtime.register(MoveIntoSection, moveIntoSectionPluginHandler);
    runtime.register(ListSectionChildren, listSectionChildrenPluginHandler);

    runtime.start();
    post("connected");
  } catch (err) {
    post("disconnected");
    throw err;
  }
}
