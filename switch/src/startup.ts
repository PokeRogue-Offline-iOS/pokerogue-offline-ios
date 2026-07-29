import {
  GAME_ROOT,
  MANIFEST_PATH,
  NXJS_VERSION,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SWITCH_PLATFORM_VERSION,
} from "./constants";
import { appendLog } from "./logger";

interface RequiredFile {
  path: string;
  sha256?: string;
}

export interface SwitchGameManifest {
  schemaVersion: number;
  switchPlatformVersion: string;
  nxjsPackageVersion: string;
  phaserVersion: string;
  silverShadowGameVersion: string;
  upstreamPokeRogueCommit: string | null;
  assetVersion: string;
  buildDate: string;
  requiredFiles: RequiredFile[];
}

export interface CanvasDiagnostics {
  resizeContext: "PASS" | "FAIL";
  crossContextFont: "PASS" | "FAIL";
  detail: string[];
}

function readText(path: string): string {
  const data = Switch.readFileSync(path);
  if (data === null) {
    throw new Error(`Required file is missing: ${path}`);
  }
  return new TextDecoder().decode(data);
}

function validateRelativePath(path: string): void {
  if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    throw new Error(`Manifest contains an unsafe required-file path: ${path}`);
  }
}

export function validateStartup(): SwitchGameManifest {
  if (!Switch.statSync(GAME_ROOT)) {
    throw new Error(`The external game folder does not exist: ${GAME_ROOT}`);
  }

  let manifest: SwitchGameManifest;
  try {
    manifest = JSON.parse(readText(MANIFEST_PATH)) as SwitchGameManifest;
  } catch (error) {
    throw new Error(`The game manifest is missing or invalid: ${MANIFEST_PATH}`, { cause: error });
  }

  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported manifest schema ${String(manifest.schemaVersion)}; expected 1.`);
  }
  if (manifest.switchPlatformVersion !== SWITCH_PLATFORM_VERSION) {
    throw new Error(
      `Game/platform mismatch: game requires ${manifest.switchPlatformVersion}, NRO provides ${SWITCH_PLATFORM_VERSION}.`,
    );
  }
  if (manifest.nxjsPackageVersion !== NXJS_VERSION) {
    throw new Error(
      `nx.js package mismatch: game expects ${manifest.nxjsPackageVersion}, NRO was built for ${NXJS_VERSION}.`,
    );
  }
  if (Switch.version.nxjs !== NXJS_VERSION) {
    throw new Error(`Embedded nx.js runtime is ${Switch.version.nxjs}; expected exactly ${NXJS_VERSION}.`);
  }
  if (!Array.isArray(manifest.requiredFiles) || manifest.requiredFiles.length === 0) {
    throw new Error("The game manifest has no requiredFiles entries.");
  }

  for (const file of manifest.requiredFiles) {
    validateRelativePath(file.path);
    if (!Switch.statSync(`${GAME_ROOT}/${file.path}`)) {
      throw new Error(`Required game file is missing: ${file.path}`);
    }
  }

  appendLog("INFO", "Startup validation passed", {
    platform: SWITCH_PLATFORM_VERSION,
    nxjs: Switch.version.nxjs,
    v8: Switch.version.v8,
    skia: Switch.version.skia,
    game: manifest.silverShadowGameVersion,
  });
  return manifest;
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
  const message = error instanceof Error ? error.message : String(error);
  appendLog("ERROR", "Fatal startup failure", error);

  try {
    const context = (screen as any).getContext("2d") as CanvasRenderingContext2D;
    context.fillStyle = "#170b14";
    context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    context.fillStyle = "#ff6b8a";
    context.font = "bold 42px system-ui";
    context.fillText("SilverShadow PokeRogue could not start.", 64, 100);
    context.fillStyle = "#ffffff";
    context.font = "26px system-ui";
    context.fillText("The required game files are missing or incompatible.", 64, 165);
    context.fillText("Reinstall the complete Switch release package.", 64, 205);
    context.fillStyle = "#ffc8d5";
    context.font = "20px system-ui";
    const lines = wrapText(context, message, SCREEN_WIDTH - 128);
    lines.slice(0, 8).forEach((line, index) => context.fillText(line, 64, 285 + index * 30));
    context.fillStyle = "#aeb4c4";
    context.fillText(`Log: ${APP_LOG_DISPLAY_PATH}`, 64, 650);
  } catch (renderError) {
    console.error("Unable to render startup error:", renderError);
  }
}

const APP_LOG_DISPLAY_PATH = "/switch/SilverShadow-PokeRogue/logs/milestone1.log";

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
