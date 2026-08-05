import {
  GAME_ROOT,
  LOG_PATH,
  MANIFEST_PATH,
  MANIFEST_SCHEMA_VERSION,
  NXJS_VERSION,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SWITCH_PLATFORM_VERSION,
} from "./constants";
import type { AssetPackManifest } from "./asset-packs";
import { readGraphicsSnapshot, readMemorySnapshot } from "./diagnostics";
import { appendLog } from "./logger";

interface RequiredFile {
  path: string;
  size: number;
  sha256: string;
  purpose?: string;
}

export interface SwitchGameManifest {
  schemaVersion: number;
  packageKind: "milestone2-real-game";
  switchPlatformVersion: string;
  silverShadowGameVersion: string;
  silverShadowRepositoryCommit: string;
  upstreamPokeRogueCommit: string;
  upstreamPokeRogueVersion: string;
  nxjsRuntimeVersion: string;
  nxjsNroVersion: string;
  phaserVersion: string;
  nodeVersion: string;
  pnpmVersion: string;
  buildDate: string;
  patchSetHash: string;
  switchPatchSetHash: string;
  buildScriptHash: string;
  compiledEntryPoint: string;
  originalEntryPoint: string;
  evaluationMode: "async-function";
  requiredDirectories: string[];
  requiredFiles: RequiredFile[];
  assetPacks: AssetPackManifest;
  compatibilityShims: string[];
  offlineRequired: true;
}

export interface CanvasDiagnostics {
  resizeContext: "PASS" | "FAIL";
  crossContextFont: "PASS" | "FAIL";
  detail: string[];
}

export type StartupStage =
  | "native-bootstrap"
  | "directories-resolved"
  | "logging-initialized"
  | "manifest-opened"
  | "package-version-validated"
  | "required-files-checked"
  | "asset-packs-checked"
  | "compatibility-shims-installed"
  | "compiled-entry-resolved"
  | "compiled-entry-evaluated"
  | "phaser-startup-reached"
  | "pokerogue-bootstrap-started"
  | "title-screen-or-first-blocker";

let currentStage: StartupStage = "native-bootstrap";
let activeManifest: SwitchGameManifest | null = null;
let requestedResource: string | null = null;
let requestedResourceKind: "embedded" | "sd-card" | "local" | "network" | "unknown" = "unknown";
const startupStartedAt = performance.now();
let previousStageAt = startupStartedAt;
(globalThis as any).__SILVERSHADOW_BOOT_STARTED_AT__ = startupStartedAt;

export function setStartupStage(stage: StartupStage, detail?: unknown): void {
  const now = performance.now();
  currentStage = stage;
  appendLog("INFO", `Startup stage: ${stage}`, {
    totalMs: Number((now - startupStartedAt).toFixed(3)),
    sincePreviousMs: Number((now - previousStageAt).toFixed(3)),
    detail: detail ?? null,
  });
  previousStageAt = now;
}

export function setRequestedResource(path: string, kind: typeof requestedResourceKind): void {
  requestedResource = path;
  requestedResourceKind = kind;
}

function readText(path: string): string {
  const data = Switch.readFileSync(path);
  if (data === null) {
    throw new Error(`Required file is missing: ${path}`);
  }
  return new TextDecoder().decode(data);
}

function validateRelativePath(value: string): void {
  if (!value || value.startsWith("/") || value.includes("..") || value.includes("\\") || value.includes(":")) {
    throw new Error(`Manifest contains an unsafe relative path: ${value}`);
  }
}

export async function validateStartup(): Promise<SwitchGameManifest> {
  setStartupStage("directories-resolved", { gameRoot: GAME_ROOT });
  if (!Switch.statSync(GAME_ROOT)) {
    throw new Error(`The external game folder does not exist: ${GAME_ROOT}`);
  }

  setRequestedResource(MANIFEST_PATH, "sd-card");
  let manifest: SwitchGameManifest;
  try {
    manifest = JSON.parse(readText(MANIFEST_PATH)) as SwitchGameManifest;
  } catch (error) {
    throw new Error(`The game manifest is missing or invalid: ${MANIFEST_PATH}`, { cause: error });
  }
  activeManifest = manifest;
  setStartupStage("manifest-opened", { schemaVersion: manifest.schemaVersion, packageKind: manifest.packageKind });

  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported manifest schema ${String(manifest.schemaVersion)}; expected ${MANIFEST_SCHEMA_VERSION}.`,
    );
  }
  if (manifest.packageKind !== "milestone2-real-game") {
    throw new Error(`This NRO requires a Milestone 2 real-game package, received ${String(manifest.packageKind)}.`);
  }
  if (manifest.switchPlatformVersion !== SWITCH_PLATFORM_VERSION) {
    throw new Error(
      `Game/platform mismatch: game requires ${manifest.switchPlatformVersion}, NRO provides ${SWITCH_PLATFORM_VERSION}.`,
    );
  }
  if (manifest.nxjsRuntimeVersion !== NXJS_VERSION || Switch.version.nxjs !== NXJS_VERSION) {
    throw new Error(
      `nx.js mismatch: package=${manifest.nxjsRuntimeVersion}, runtime=${Switch.version.nxjs}, expected=${NXJS_VERSION}.`,
    );
  }
  if (manifest.offlineRequired !== true || manifest.evaluationMode !== "async-function") {
    throw new Error("Manifest runtime policy is invalid for the offline async-function loader.");
  }
  setStartupStage("package-version-validated", {
    silverShadow: manifest.silverShadowGameVersion,
    upstream: manifest.upstreamPokeRogueVersion,
    nxjs: Switch.version.nxjs,
    v8: Switch.version.v8,
    skia: Switch.version.skia,
  });

  if (!Array.isArray(manifest.requiredDirectories) || !Array.isArray(manifest.requiredFiles)) {
    throw new Error("Manifest requiredDirectories or requiredFiles is invalid.");
  }
  if (!manifest.assetPacks || typeof manifest.assetPacks !== "object") {
    throw new Error("Manifest assetPacks metadata is missing or invalid.");
  }
  for (const directory of manifest.requiredDirectories) {
    validateRelativePath(directory);
    setRequestedResource(`${GAME_ROOT}/${directory}`, "sd-card");
    if (!Switch.statSync(`${GAME_ROOT}/${directory}`)) {
      throw new Error(`Required game directory is missing: ${directory}`);
    }
  }
  for (const file of manifest.requiredFiles) {
    validateRelativePath(file.path);
    const absolute = `${GAME_ROOT}/${file.path}`;
    setRequestedResource(absolute, "sd-card");
    const data = Switch.readFileSync(absolute);
    if (data === null) {
      throw new Error(`Required game file is missing: ${file.path}`);
    }
    if (data.byteLength !== file.size) {
      throw new Error(`Size mismatch for ${file.path}: expected ${file.size}, received ${data.byteLength}.`);
    }
    const digest = await sha256(data);
    if (digest !== file.sha256) {
      throw new Error(`SHA-256 mismatch for ${file.path}: expected ${file.sha256}, received ${digest}.`);
    }
  }
  setStartupStage("required-files-checked", {
    directories: manifest.requiredDirectories.length,
    files: manifest.requiredFiles.length,
  });
  return manifest;
}

async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
}

export function runCanvasDiagnostics(): CanvasDiagnostics {
  const result: CanvasDiagnostics = {
    resizeContext: "FAIL",
    crossContextFont: "FAIL",
    detail: [],
  };

  try {
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("OffscreenCanvas did not return a 2D context.");
    }
    context.font = "20px system-ui";
    context.measureText("before");
    canvas.width = 240;
    canvas.height = 60;
    context.font = "20px system-ui";
    context.fillText("after resize", 4, 30);
    const width = context.measureText("after resize").width;
    if (!(width > 0)) {
      throw new Error("measureText returned a non-positive width after resize.");
    }
    result.resizeContext = "PASS";
    result.detail.push(`Canvas resize/context: width=${width.toFixed(2)}`);
  } catch (error) {
    result.detail.push(`Canvas resize/context failed: ${String(error)}`);
  }

  try {
    const canvasA = new OffscreenCanvas(200, 50);
    const canvasB = new OffscreenCanvas(200, 50);
    const contextA = canvasA.getContext("2d");
    const contextB = canvasB.getContext("2d");
    if (!contextA || !contextB) {
      throw new Error("Could not create both 2D contexts.");
    }
    contextB.font = "14px system-ui";
    const before = contextB.measureText("SilverShadow").width;
    contextA.save();
    contextA.font = "20px system-ui";
    contextA.fillText("A", 0, 25);
    contextA.restore();
    const after = contextB.measureText("SilverShadow").width;
    if (Math.abs(before - after) > 0.5) {
      throw new Error(`Cross-context font width changed from ${before.toFixed(2)} to ${after.toFixed(2)}.`);
    }
    result.crossContextFont = "PASS";
    result.detail.push(`Cross-context font: before=${before.toFixed(2)}, after=${after.toFixed(2)}`);
  } catch (error) {
    result.detail.push(`Cross-context font failed: ${String(error)}`);
  }

  appendLog(
    result.resizeContext === "PASS" && result.crossContextFont === "PASS" ? "INFO" : "ERROR",
    "Canvas diagnostics",
    result,
  );
  return result;
}

export function showFatalError(error: unknown): void {
  const global = globalThis as any;
  if (global.__SILVERSHADOW_FATAL_ERROR_ACTIVE__) {
    return;
  }
  global.__SILVERSHADOW_FATAL_ERROR_ACTIVE__ = true;
  const normalized = error instanceof Error ? error : new Error(String(error));
  const diagnostics = {
    startupStage: currentStage,
    errorName: normalized.name,
    errorMessage: normalized.message,
    stack: normalized.stack ?? null,
    requestedResource,
    requestedResourceKind,
    logPath: LOG_PATH,
    packageVersion: activeManifest?.silverShadowGameVersion ?? null,
    silverShadowRepositoryCommit: activeManifest?.silverShadowRepositoryCommit ?? null,
    upstreamPokeRogueCommit: activeManifest?.upstreamPokeRogueCommit ?? null,
    upstreamPokeRogueVersion: activeManifest?.upstreamPokeRogueVersion ?? null,
    nxjsVersion: Switch.version.nxjs,
    v8Version: Switch.version.v8,
    skiaVersion: Switch.version.skia,
    phaserVersion: activeManifest?.phaserVersion ?? null,
    manifestVersion: activeManifest?.schemaVersion ?? null,
    compatibilityShims: activeManifest?.compatibilityShims ?? [],
    memory: readMemorySnapshot(),
    graphics: readGraphicsSnapshot(),
  };
  appendLog("ERROR", "Fatal startup failure", diagnostics);

  if (Boolean(global.__SILVERSHADOW_SCREEN_CONTEXT_ACQUIRED__)) {
    console.error("SilverShadow PokeRogue could not start.");
    console.error(`Stage: ${currentStage}`);
    console.error(`${normalized.name}: ${normalized.message}`);
    console.error(`Log: ${LOG_PATH.replace(/^sdmc:/, "")}`);
    return;
  }

  try {
    const context = (screen as any).getContext("2d") as CanvasRenderingContext2D;
    context.fillStyle = "#170b14";
    context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    context.fillStyle = "#ff6b8a";
    context.font = "bold 38px system-ui";
    context.fillText("SilverShadow PokeRogue could not start.", 56, 84);
    context.fillStyle = "#ffffff";
    context.font = "24px system-ui";
    context.fillText(`Stage: ${currentStage}`, 56, 132);
    context.fillStyle = "#ffc8d5";
    context.font = "19px system-ui";
    const summary = `${normalized.name}: ${normalized.message}`;
    wrapText(context, summary, SCREEN_WIDTH - 112)
      .slice(0, 9)
      .forEach((line, index) => context.fillText(line, 56, 190 + index * 28));
    context.fillStyle = "#aeb4c4";
    context.fillText("Return the log and a photo of this screen. Exit with HOME.", 56, 620);
    context.fillText(`Log: ${LOG_PATH.replace(/^sdmc:/, "")}`, 56, 658);
  } catch (renderError) {
    console.error("Unable to render startup error:", renderError);
  }
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}
