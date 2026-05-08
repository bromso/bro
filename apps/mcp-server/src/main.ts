/**
 * @bromso/figma-mcp — entry point.
 *
 * Argv dispatch order:
 *   1. CLI commands (`setup`, `doctor`, `--print-path`, `--help`) — handled
 *      inline and exit. Implemented in `cli/*` (pure, testable seams) and
 *      wired here via thin Node-side helpers.
 *   2. Runtime path (no CLI flag) — falls through to `runRuntime()`, which
 *      preserves the original Phase 3 daemon/shim behavior verbatim.
 *
 * Excluded from coverage (see vitest.config.ts); branches exercised by
 * Task 3.16's spawn smoke test plus Task 7.11's cli-spawn tests.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FigmaFake } from "@repo/figma-adapter/testing";
import { FigmaApiClient } from "@repo/figma-api-client";
import {
  AddAnnotation,
  AuditA11ySummary,
  AuditContrast,
  AuditTargetSize,
  addAnnotationPluginHandler,
  auditA11ySummaryPluginHandler,
  auditContrastPluginHandler,
  auditTargetSizePluginHandler,
  GetAltText,
  GetAriaLabel,
  GetLandmarkRole,
  getAltTextPluginHandler,
  getAriaLabelPluginHandler,
  getLandmarkRolePluginHandler,
  ListAnnotations,
  listAnnotationsPluginHandler,
  RemoveAnnotation,
  removeAnnotationPluginHandler,
  SetAltText,
  SetAriaLabel,
  SetLandmarkRole,
  SimulateColorBlindness,
  setAltTextPluginHandler,
  setAriaLabelPluginHandler,
  setLandmarkRolePluginHandler,
  simulateColorBlindnessPluginHandler,
} from "@repo/tools-a11y";
import {
  ClearConsole,
  ConsoleStatusTool,
  clearConsolePluginHandler,
  consoleStatusPluginHandler,
  GetConsoleErrors,
  GetConsoleLogs,
  GetConsoleWarnings,
  getConsoleErrorsPluginHandler,
  getConsoleLogsPluginHandler,
  getConsoleWarningsPluginHandler,
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
  BridgeStatus,
  createBridgeStatusServerHandler,
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
import {
  createDeleteFileCommentServerHandler,
  createGetDevResourcesServerHandler,
  createGetFileBranchesServerHandler,
  createGetFileCommentsServerHandler,
  createGetFileComponentSetsServerHandler,
  createGetFileComponentsServerHandler,
  createGetFileMetadataServerHandler,
  createGetFilePagesServerHandler,
  createGetFileStylesServerHandler,
  createGetFileVersionsServerHandler,
  createGetImageFillsServerHandler,
  createGetImageRendersServerHandler,
  createGetNodeByIdServerHandler,
  createGetProjectFilesServerHandler,
  createGetTeamComponentsServerHandler,
  createGetTeamProjectsServerHandler,
  createGetTeamStylesServerHandler,
  createGetUserMeServerHandler,
  createPostDevResourcesServerHandler,
  createPostFileCommentServerHandler,
  DeleteFileComment,
  GetDevResources,
  GetFileBranches,
  GetFileComments,
  GetFileComponentSets,
  GetFileComponents,
  GetFileMetadata,
  GetFilePages,
  GetFileStyles,
  GetFileVersions,
  GetImageFills,
  GetImageRenders,
  GetNodeById,
  GetProjectFiles,
  GetTeamComponents,
  GetTeamProjects,
  GetTeamStyles,
  GetUserMe,
  PostDevResources,
  PostFileComment,
} from "@repo/tools-rest";
import {
  CreateSlide,
  CreateSlideRow,
  createSlidePluginHandler,
  createSlideRowPluginHandler,
  DeleteSlide,
  DuplicateSlide,
  deleteSlidePluginHandler,
  duplicateSlidePluginHandler,
  GetSlide,
  GetSlideGrid,
  getSlideGridPluginHandler,
  getSlidePluginHandler,
  ListSlideRows,
  ListSlides,
  listSlideRowsPluginHandler,
  listSlidesPluginHandler,
  MoveSlide,
  moveSlidePluginHandler,
  SetActiveSlide,
  SetSlideBackground,
  SetSlideName,
  SetSlideSkipped,
  SetSlidesView,
  SetSlideTransition,
  setActiveSlidePluginHandler,
  setSlideBackgroundPluginHandler,
  setSlideNamePluginHandler,
  setSlideSkippedPluginHandler,
  setSlidesViewPluginHandler,
  setSlideTransitionPluginHandler,
} from "@repo/tools-slides";
import {
  createStreamStatusPluginHandler,
  ExportVariables,
  exportVariablesPluginHandler,
  ImportVariables,
  StreamStatus,
  UpdateVariablesBatch,
  updateVariablesBatchPluginHandler,
} from "@repo/tools-variables";
import { type IpcTransportPair, pickIpcTransport } from "@repo/transport";
import { createAiClientConfigsCheck } from "./cli/checks/ai-client-configs";
import { createDaemonLivenessCheck } from "./cli/checks/daemon-liveness";
import { createFigmaApiKeyCheck } from "./cli/checks/figma-api-key";
import { createPluginPairingCheck, type PluginPairingProbe } from "./cli/checks/plugin-pairing";
import { createRecentErrorsCheck } from "./cli/checks/recent-errors";
import { createSocketConflictCheck } from "./cli/checks/socket-conflict";
import type { FsAdapter } from "./cli/config-writer";
import { writeConfig } from "./cli/config-writer";
import { detectClients, type Platform } from "./cli/detect";
import { dispatch } from "./cli/dispatch";
import { type Fixer, formatDoctorJson, formatDoctorText, runDoctor } from "./cli/doctor";
import { createStaleLockfileFixer } from "./cli/fixers/stale-lockfile";
import { runOpenFigma } from "./cli/open-figma";
import { resolveManifestPath } from "./cli/print-path";
import { formatSetupTable, runSetup } from "./cli/setup";
import { cloudEntry, DEFAULT_RELAY_URL, formatPairBanner, pairWithRelay } from "./cli/setup-cloud";
import { USAGE } from "./cli/usage";
import { Daemon } from "./daemon/daemon";
import { isPidAliveDefault, LockfileManager } from "./daemon/lockfile";
import { resolveStartup } from "./orchestrator";
import { createStdioShim } from "./shim/stdio-shim";
import { createImportVariablesServerHandler } from "./streaming/import-handler";
import type { ChunkLoopTransport } from "./streaming/session-manager";

const VERSION = "0.0.0";
const DEFAULT_DIR = join(homedir(), ".figma-mcp");
const LOCK_PATH = join(DEFAULT_DIR, "daemon.lock");

async function main(): Promise<void> {
  const cmd = dispatch({ argv: process.argv });

  if (cmd.kind === "help") {
    process.stdout.write(USAGE);
    return;
  }

  if (cmd.kind === "print-path") {
    process.stdout.write(`${resolveManifestPath({ metaUrl: import.meta.url })}\n`);
    return;
  }

  if (cmd.kind === "setup") {
    await handleSetup(cmd.flags);
    return;
  }

  if (cmd.kind === "doctor") {
    await handleDoctor(cmd.flags);
    return;
  }

  // cmd.kind === "runtime" — fall through to existing shim/daemon path:
  await runRuntime({ enableWriteTools: cmd.flags.enableWriteTools });
}

async function handleSetup(flags: {
  dryRun: boolean;
  cloud: boolean;
  openFigma: boolean;
  client: string | null;
  relayUrl: string | null;
}): Promise<void> {
  const homeDir = (process.env.HOME ?? process.env.USERPROFILE) as string;
  const platform = process.platform as Platform;
  const fileExists = (p: string) => existsSync(p);
  const clients = detectClients({ homeDir, platform, fileExists, env: process.env });

  let entry = { command: "npx", args: ["-y", "@scope/figma-mcp"] };
  if (flags.cloud) {
    const relayUrl = flags.relayUrl ?? DEFAULT_RELAY_URL;
    const pair = await pairWithRelay({ relayUrl, fetchFn: fetch });
    process.stdout.write(formatPairBanner(pair));
    entry = cloudEntry({ relayUrl, sessionId: pair.sessionId }) as typeof entry;
  }

  const report = await runSetup({
    clients,
    entry,
    mcpServerName: "figma",
    writeConfig: (a) => writeConfig({ ...a, fs: nodeFsAdapter() }),
    dryRun: flags.dryRun,
    clientFilter: flags.client,
  });
  process.stdout.write(`${formatSetupTable(report)}\n`);

  if (flags.openFigma) {
    const path = resolveManifestPath({ metaUrl: import.meta.url });
    runOpenFigma({ platform, path, spawnFn: spawn as never });
  }
}

async function handleDoctor(flags: { json: boolean; fix: boolean }): Promise<void> {
  const homeDir = (process.env.HOME ?? process.env.USERPROFILE) as string;
  const platform = process.platform as Platform;
  const ipc = pickIpcTransport({ platform });
  const lockfile = new LockfileManager({
    path: join(homeDir, ".figma-mcp", "daemon.lock"),
    isPidAlive: isPidAliveDefault,
  });
  const clients = detectClients({ homeDir, platform, fileExists: existsSync, env: process.env });

  const fixers = new Map<string, Fixer>([["daemon-liveness", createStaleLockfileFixer(lockfile)]]);

  const report = await runDoctor({
    checks: [
      createDaemonLivenessCheck(lockfile),
      createSocketConflictCheck({
        socketPath: ipc.socketPath,
        probeConnect: () => probeIpcConnect(ipc),
        lockfileActive: () => lockfile.readActive(),
      }),
      createPluginPairingCheck(() => connectPluginPairingProbe(ipc)),
      createAiClientConfigsCheck(clients, (p) => readFile(p, "utf-8")),
      createRecentErrorsCheck(join(homeDir, ".figma-mcp", "daemon.log"), (p) =>
        readFile(p, "utf-8")
      ),
      createFigmaApiKeyCheck({ env: process.env }),
    ],
    fixers,
    applyFixes: flags.fix,
  });
  process.stdout.write(
    flags.json ? `${formatDoctorJson(report)}\n` : `${formatDoctorText(report)}\n`
  );
}

/**
 * Node-side wiring helpers — kept here so the cli/ modules stay pure and
 * easily unit-testable. These are the only Node-API touchpoints the CLI
 * dispatch needs.
 */

function nodeFsAdapter(): FsAdapter {
  return {
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, data) => writeFile(path, data),
    rename: (from, to) => rename(from, to),
    mkdir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
  };
}

function probeIpcConnect(ipc: IpcTransportPair): Promise<{ ok: boolean; code?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: { ok: boolean; code?: string }) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* socket already torn down */
      }
      resolve(result);
    };
    const socket = createConnection({ path: ipc.socketPath });
    const timer = setTimeout(() => settle({ ok: false, code: "ETIMEDOUT" }), 500);
    socket.once("connect", () => {
      clearTimeout(timer);
      settle({ ok: true });
    });
    socket.once("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      settle({ ok: false, code: err.code });
    });
  });
}

// Phase-7 simplification: doctor's plugin-pairing probe just attempts the
// IPC connect and reports "not connected" on success — we deliberately avoid
// the Phase-3 Correlator/bridge_status request gymnastics here. The probe
// either errors (so the check reports "daemon unreachable") or completes
// cleanly with `connected: false`, which surfaces as "plugin not paired".
// Phase 8 can promote this to a real bridge_status round-trip once the
// daemon-side correlator is exposed via a stable client API.
async function connectPluginPairingProbe(ipc: IpcTransportPair): Promise<PluginPairingProbe> {
  const probe = await probeIpcConnect(ipc);
  if (!probe.ok) {
    throw new Error(`E_IPC_CONNECT_FAILED: ${probe.code ?? "unknown"}`);
  }
  return {
    request: async () => ({ pluginState: { connected: false } }),
  };
}

async function runRuntime(opts: { enableWriteTools: boolean }): Promise<void> {
  // Phase 14: pick the IPC transport once so the daemon-spawn path and the
  // doctor command agree on the same socket/named-pipe path. Previously the
  // daemon path used a hard-coded Unix socket (`SOCKET_PATH`) while doctor
  // resolved a platform-specific path via `pickIpcTransport`, so on Windows
  // the daemon bound a Unix path while doctor probed the named-pipe path
  // and they never agreed.
  const platform = process.platform as Platform;
  const ipc = pickIpcTransport({ platform });
  const lockfile = new LockfileManager({ path: LOCK_PATH, isPidAlive: isPidAliveDefault });

  // Phase 11: build the typed REST client once. `null` when FIGMA_API_KEY is
  // unset — REST handlers surface E_FIGMA_API_KEY_MISSING via requireApiKey.
  const figmaApiKey = process.env.FIGMA_API_KEY;
  const figmaApi = figmaApiKey ? new FigmaApiClient({ apiKey: figmaApiKey }) : null;

  const startup = await resolveStartup({
    argv: process.argv,
    version: VERSION,
    lockfile,
    socketPath: ipc.socketPath,
    spawnDaemon: async () => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--daemon"], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      // Poll the lockfile until the daemon writes it.
      const start = Date.now();
      while (Date.now() - start < 5_000) {
        const active = await lockfile.readActive();
        if (active) return { pid: active.pid, socketPath: active.socketPath };
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("daemon did not start within 5s");
    },
  });

  if (startup.mode === "daemon") {
    // Ensure ~/.figma-mcp exists before binding the Unix socket inside it.
    await mkdir(DEFAULT_DIR, { recursive: true });
    const figma = new FigmaFake();
    const lifecycleStartedAt = Date.now();
    let daemonRef: Daemon | null = null;
    const buildImportTransport = (): ChunkLoopTransport => {
      const correlator = daemonRef?.pluginCorrelator;
      if (!daemonRef || !correlator) {
        throw new Error("plugin not connected");
      }
      const d = daemonRef;
      return {
        async send(env) {
          await d.wsBroadcast(env);
        },
        async request(env) {
          // Correlator.request is typed for RequestEnvelope but the
          // runtime only keys on `id` and forwards verbatim — chunk
          // envelopes have the same `id` shape so this is a typing
          // gap, not a runtime issue. Phase 6/7 will widen the
          // Correlator API.
          return correlator.request(env as never);
        },
      };
    };
    const daemon = await Daemon.start({
      socketPath: startup.socketPath,
      version: VERSION,
      figma,
      figmaApi,
      packs: [
        {
          name: "tools-extract",
          tools: [ExtractStyles, ExtractComponents, ExtractLocalVariables, BridgeStatus],
          registerPlugin: (reg) => {
            reg.register(ExtractStyles, extractStylesPluginHandler);
            reg.register(ExtractComponents, extractComponentsPluginHandler);
            reg.register(ExtractLocalVariables, extractLocalVariablesPluginHandler);
          },
          registerServer: (reg) => {
            reg.register(
              BridgeStatus,
              createBridgeStatusServerHandler({
                getDaemonInfo: () => ({
                  pid: process.pid,
                  version: VERSION,
                  uptimeMs: Date.now() - lifecycleStartedAt,
                }),
                getPluginState: () => ({ connected: false }),
              })
            );
          },
        },
        {
          name: "tools-variables",
          tools: [ImportVariables, ExportVariables, UpdateVariablesBatch, StreamStatus],
          registerPlugin: (reg) => {
            reg.register(ExportVariables, exportVariablesPluginHandler);
            reg.register(UpdateVariablesBatch, updateVariablesBatchPluginHandler);
            reg.register(
              StreamStatus,
              createStreamStatusPluginHandler({
                // Phase 5 stream_status returns "unknown session" via the
                // handler's null-fallback. A real provider lands when the
                // plugin owns a StreamRuntime in-process (Phase 6/7).
                getStatus: () => null,
              })
            );
          },
          registerServer: (reg) => {
            reg.register(
              ImportVariables,
              createImportVariablesServerHandler({ buildTransport: buildImportTransport })
            );
          },
        },
        {
          name: "tools-console",
          tools: [
            GetConsoleLogs,
            ClearConsole,
            GetConsoleErrors,
            GetConsoleWarnings,
            QueryConsole,
            ConsoleStatusTool,
          ],
          registerPlugin: (reg) => {
            reg.register(GetConsoleLogs, getConsoleLogsPluginHandler);
            reg.register(ClearConsole, clearConsolePluginHandler);
            reg.register(GetConsoleErrors, getConsoleErrorsPluginHandler);
            reg.register(GetConsoleWarnings, getConsoleWarningsPluginHandler);
            reg.register(QueryConsole, queryConsolePluginHandler);
            reg.register(ConsoleStatusTool, consoleStatusPluginHandler);
          },
        },
        {
          name: "tools-design",
          tools: [
            CreateRectangle,
            CreateFrame,
            CreateEllipse,
            CreateLine,
            CreateText,
            SetTextContent,
            SetFill,
            SetStroke,
            ResizeNode,
            CloneNode,
            DeleteNode,
            CreateComponent,
          ],
          registerPlugin: (reg) => {
            reg.register(CreateRectangle, createRectanglePluginHandler);
            reg.register(CreateFrame, createFramePluginHandler);
            reg.register(CreateEllipse, createEllipsePluginHandler);
            reg.register(CreateLine, createLinePluginHandler);
            reg.register(CreateText, createTextPluginHandler);
            reg.register(SetTextContent, setTextContentPluginHandler);
            reg.register(SetFill, setFillPluginHandler);
            reg.register(SetStroke, setStrokePluginHandler);
            reg.register(ResizeNode, resizeNodePluginHandler);
            reg.register(CloneNode, cloneNodePluginHandler);
            reg.register(DeleteNode, deleteNodePluginHandler);
            reg.register(CreateComponent, createComponentPluginHandler);
          },
        },
        {
          name: "tools-figjam",
          tools: [
            CreateSticky,
            CreateSection,
            CreateConnector,
            CreateCodeBlock,
            CreateShapeWithText,
            CreateTable,
            SetStickyContent,
            SetSectionName,
            MoveIntoSection,
            ListSectionChildren,
          ],
          registerPlugin: (reg) => {
            reg.register(CreateSticky, createStickyPluginHandler);
            reg.register(CreateSection, createSectionPluginHandler);
            reg.register(CreateConnector, createConnectorPluginHandler);
            reg.register(CreateCodeBlock, createCodeBlockPluginHandler);
            reg.register(CreateShapeWithText, createShapeWithTextPluginHandler);
            reg.register(CreateTable, createTablePluginHandler);
            reg.register(SetStickyContent, setStickyContentPluginHandler);
            reg.register(SetSectionName, setSectionNamePluginHandler);
            reg.register(MoveIntoSection, moveIntoSectionPluginHandler);
            reg.register(ListSectionChildren, listSectionChildrenPluginHandler);
          },
        },
        {
          name: "tools-slides",
          tools: [
            CreateSlide,
            CreateSlideRow,
            SetSlideName,
            SetSlideSkipped,
            SetSlideTransition,
            SetSlideBackground,
            MoveSlide,
            DuplicateSlide,
            DeleteSlide,
            ListSlides,
            ListSlideRows,
            SetActiveSlide,
            GetSlide,
            SetSlidesView,
            GetSlideGrid,
          ],
          registerPlugin: (reg) => {
            reg.register(CreateSlide, createSlidePluginHandler);
            reg.register(CreateSlideRow, createSlideRowPluginHandler);
            reg.register(SetSlideName, setSlideNamePluginHandler);
            reg.register(SetSlideSkipped, setSlideSkippedPluginHandler);
            reg.register(SetSlideTransition, setSlideTransitionPluginHandler);
            reg.register(SetSlideBackground, setSlideBackgroundPluginHandler);
            reg.register(MoveSlide, moveSlidePluginHandler);
            reg.register(DuplicateSlide, duplicateSlidePluginHandler);
            reg.register(DeleteSlide, deleteSlidePluginHandler);
            reg.register(ListSlides, listSlidesPluginHandler);
            reg.register(ListSlideRows, listSlideRowsPluginHandler);
            reg.register(SetActiveSlide, setActiveSlidePluginHandler);
            reg.register(GetSlide, getSlidePluginHandler);
            reg.register(SetSlidesView, setSlidesViewPluginHandler);
            reg.register(GetSlideGrid, getSlideGridPluginHandler);
          },
        },
        {
          name: "tools-a11y",
          tools: [
            AuditContrast,
            AuditTargetSize,
            SimulateColorBlindness,
            SetAltText,
            GetAltText,
            SetAriaLabel,
            GetAriaLabel,
            SetLandmarkRole,
            GetLandmarkRole,
            ListAnnotations,
            AddAnnotation,
            RemoveAnnotation,
            AuditA11ySummary,
          ],
          registerPlugin: (reg) => {
            reg.register(AuditContrast, auditContrastPluginHandler);
            reg.register(AuditTargetSize, auditTargetSizePluginHandler);
            reg.register(SimulateColorBlindness, simulateColorBlindnessPluginHandler);
            reg.register(SetAltText, setAltTextPluginHandler);
            reg.register(GetAltText, getAltTextPluginHandler);
            reg.register(SetAriaLabel, setAriaLabelPluginHandler);
            reg.register(GetAriaLabel, getAriaLabelPluginHandler);
            reg.register(SetLandmarkRole, setLandmarkRolePluginHandler);
            reg.register(GetLandmarkRole, getLandmarkRolePluginHandler);
            reg.register(ListAnnotations, listAnnotationsPluginHandler);
            reg.register(AddAnnotation, addAnnotationPluginHandler);
            reg.register(RemoveAnnotation, removeAnnotationPluginHandler);
            reg.register(AuditA11ySummary, auditA11ySummaryPluginHandler);
          },
        },
        {
          name: "tools-rest",
          tools: [
            GetFileMetadata,
            GetFilePages,
            GetNodeById,
            GetFileVersions,
            GetFileStyles,
            GetFileComponents,
            GetFileComponentSets,
            GetFileBranches,
            GetImageRenders,
            GetImageFills,
            GetUserMe,
            GetFileComments,
            PostFileComment,
            DeleteFileComment,
            GetTeamProjects,
            GetProjectFiles,
            GetTeamComponents,
            GetTeamStyles,
            GetDevResources,
            PostDevResources,
          ],
          registerServer: (reg) => {
            reg.register(GetFileMetadata, createGetFileMetadataServerHandler({ figmaApi }));
            reg.register(GetFilePages, createGetFilePagesServerHandler({ figmaApi }));
            reg.register(GetNodeById, createGetNodeByIdServerHandler({ figmaApi }));
            reg.register(GetFileVersions, createGetFileVersionsServerHandler({ figmaApi }));
            reg.register(GetFileStyles, createGetFileStylesServerHandler({ figmaApi }));
            reg.register(GetFileComponents, createGetFileComponentsServerHandler({ figmaApi }));
            reg.register(
              GetFileComponentSets,
              createGetFileComponentSetsServerHandler({ figmaApi })
            );
            reg.register(GetFileBranches, createGetFileBranchesServerHandler({ figmaApi }));
            reg.register(GetImageRenders, createGetImageRendersServerHandler({ figmaApi }));
            reg.register(GetImageFills, createGetImageFillsServerHandler({ figmaApi }));
            reg.register(GetUserMe, createGetUserMeServerHandler({ figmaApi }));
            reg.register(GetFileComments, createGetFileCommentsServerHandler({ figmaApi }));
            reg.register(
              PostFileComment,
              createPostFileCommentServerHandler({
                figmaApi,
                enableWriteTools: opts.enableWriteTools,
              })
            );
            reg.register(
              DeleteFileComment,
              createDeleteFileCommentServerHandler({
                figmaApi,
                enableWriteTools: opts.enableWriteTools,
              })
            );
            reg.register(GetTeamProjects, createGetTeamProjectsServerHandler({ figmaApi }));
            reg.register(GetProjectFiles, createGetProjectFilesServerHandler({ figmaApi }));
            reg.register(GetTeamComponents, createGetTeamComponentsServerHandler({ figmaApi }));
            reg.register(GetTeamStyles, createGetTeamStylesServerHandler({ figmaApi }));
            reg.register(GetDevResources, createGetDevResourcesServerHandler({ figmaApi }));
            reg.register(
              PostDevResources,
              createPostDevResourcesServerHandler({
                figmaApi,
                enableWriteTools: opts.enableWriteTools,
              })
            );
          },
        },
      ],
    });
    daemonRef = daemon;
    await lockfile.write({
      pid: process.pid,
      version: VERSION,
      socketPath: startup.socketPath,
    });
    process.on("SIGTERM", async () => {
      await daemon.stop();
      await lockfile.clear();
      process.exit(0);
    });
    return;
  }

  const shim = await createStdioShim({
    socketPath: startup.socketPath,
    sourceClientId: `shim-${process.pid}`,
    tools: [
      ExtractStyles,
      ExtractComponents,
      ExtractLocalVariables,
      BridgeStatus,
      GetConsoleLogs,
      ClearConsole,
      GetConsoleErrors,
      GetConsoleWarnings,
      QueryConsole,
      ConsoleStatusTool,
      CreateRectangle,
      CreateFrame,
      CreateEllipse,
      CreateLine,
      CreateText,
      SetTextContent,
      SetFill,
      SetStroke,
      ResizeNode,
      CloneNode,
      DeleteNode,
      CreateComponent,
      CreateSticky,
      CreateSection,
      CreateConnector,
      CreateCodeBlock,
      CreateShapeWithText,
      CreateTable,
      SetStickyContent,
      SetSectionName,
      MoveIntoSection,
      ListSectionChildren,
      CreateSlide,
      CreateSlideRow,
      SetSlideName,
      SetSlideSkipped,
      SetSlideTransition,
      SetSlideBackground,
      MoveSlide,
      DuplicateSlide,
      DeleteSlide,
      ListSlides,
      ListSlideRows,
      SetActiveSlide,
      GetSlide,
      SetSlidesView,
      GetSlideGrid,
      GetFileMetadata,
      GetFilePages,
      GetNodeById,
      GetFileVersions,
      GetFileStyles,
      GetFileComponents,
      GetFileComponentSets,
      GetFileBranches,
      GetImageRenders,
      GetImageFills,
      GetUserMe,
      GetFileComments,
      PostFileComment,
      DeleteFileComment,
      GetTeamProjects,
      GetProjectFiles,
      GetTeamComponents,
      GetTeamStyles,
      GetDevResources,
      PostDevResources,
      AuditContrast,
      AuditTargetSize,
      SimulateColorBlindness,
      SetAltText,
      GetAltText,
      SetAriaLabel,
      GetAriaLabel,
      SetLandmarkRole,
      GetLandmarkRole,
      ListAnnotations,
      AddAnnotation,
      RemoveAnnotation,
      AuditA11ySummary,
    ],
    mcpServerInfo: { name: "figma-mcp", version: VERSION },
  });
  await shim.connectMcp(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
