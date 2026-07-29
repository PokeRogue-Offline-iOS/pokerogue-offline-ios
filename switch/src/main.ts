import { GAME_ROOT, LOG_PATH, NXJS_VERSION, PHASER_VERSION } from "./constants";
import { installAudioListenerShim } from "./audio-shim";
import { appendLog } from "./logger";
import { installPersistentStorage } from "./storage";
import { installXmlHttpRequestShim } from "./xhr-shim";
import {
  runCanvasDiagnostics,
  setRequestedResource,
  setStartupStage,
  showFatalError,
  validateStartup,
} from "./startup";

const nativeFetch = globalThis.fetch.bind(globalThis);

addEventListener("error", (event: any) => {
  appendLog("ERROR", "Global error", {
    name: event.error?.name ?? "ErrorEvent",
    message: event.error?.message ?? event.message,
    stack: event.error?.stack ?? null,
    file: event.filename ?? null,
    line: event.lineno ?? null,
    column: event.colno ?? null,
  });
  showFatalError(event.error ?? new Error(event.message || "Unknown global error"));
});
addEventListener("unhandledrejection", (event: any) => {
  appendLog("ERROR", "Unhandled promise rejection", {
    name: event.reason?.name ?? "UnhandledRejection",
    message: event.reason?.message ?? String(event.reason),
    stack: event.reason?.stack ?? null,
  });
  showFatalError(event.reason);
});

async function boot(): Promise<void> {
  setStartupStage("native-bootstrap", {
    expectedNxjs: NXJS_VERSION,
    actualNxjs: Switch.version.nxjs,
    v8: Switch.version.v8,
    skia: Switch.version.skia,
    expectedPhaser: PHASER_VERSION,
  });
  Switch.mkdirSync("sdmc:/switch/SilverShadow-PokeRogue/logs");
  setStartupStage("logging-initialized", {
    log: LOG_PATH,
  });
  addEventListener("beforeunload", event => {
    event.preventDefault();
    appendLog("INFO", "Intercepted Plus-button exit request for game input");
  });

  const manifest = await validateStartup();
  const diagnostics = runCanvasDiagnostics();
  if (diagnostics.resizeContext !== "PASS" || diagnostics.crossContextFont !== "PASS") {
    appendLog("WARN", "Continuing after a Canvas regression diagnostic failure", diagnostics);
  }

  const { installDomShim } = await import("./dom-shim");
  installDomShim();
  installLocationShim();
  installPersistentStorage();
  installOfflineFetch();
  installXmlHttpRequestShim();
  installAudioListenerShim();
  installFontFaceShim();
  installFonts();
  logFontMetrics();
  setStartupStage("compatibility-shims-installed", {
    active: manifest.compatibilityShims,
  });

  const entryPath = `${GAME_ROOT}/${manifest.compiledEntryPoint}`;
  setRequestedResource(entryPath, "sd-card");
  const entryData = Switch.readFileSync(entryPath);
  if (entryData === null) {
    throw new Error(`Compiled entry is missing after manifest validation: ${entryPath}`);
  }
  const entryCode = new TextDecoder().decode(entryData);
  setStartupStage("compiled-entry-resolved", {
    path: entryPath,
    bytes: entryData.byteLength,
    evaluationMode: manifest.evaluationMode,
  });

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
    ...args: string[]
  ) => (...values: unknown[]) => Promise<unknown>;
  const evaluate = new AsyncFunction(
    "globalThis",
    `"use strict";\n${entryCode}\n//# sourceURL=${entryPath}`,
  );
  await evaluate(globalThis);
  setStartupStage("compiled-entry-evaluated", {
    bootstrapStarted: Boolean((globalThis as any).__SILVERSHADOW_WEB_BOOTSTRAP_STARTED__),
    bootstrapResolved: Boolean((globalThis as any).__SILVERSHADOW_WEB_BOOTSTRAP_RESOLVED__),
  });

  const gameStage = (globalThis as any).__SILVERSHADOW_POKEROGUE_STAGE__;
  if (gameStage === "phaser-game-created") {
    setStartupStage("phaser-startup-reached", { marker: gameStage });
  }
  if (gameStage === "startGame-entered" || gameStage === "phaser-game-created") {
    setStartupStage("pokerogue-bootstrap-started", { marker: gameStage });
  }
  setStartupStage("title-screen-or-first-blocker", {
    status: "awaiting hardware observation",
    marker: gameStage ?? null,
  });
}

function installLocationShim(): void {
  const location = {
    href: `${GAME_ROOT}/index.html`,
    origin: "null",
    protocol: "sdmc:",
    host: "",
    hostname: "",
    port: "",
    pathname: "/switch/SilverShadow-PokeRogue/game/index.html",
    search: "",
    hash: "",
    ancestorOrigins: {} as DOMStringList,
    assign(url: string | URL) {
      throw new Error(`Navigation is unsupported in the Switch build: ${String(url)}`);
    },
    replace(url: string | URL) {
      throw new Error(`Navigation is unsupported in the Switch build: ${String(url)}`);
    },
    reload() {
      appendLog("WARN", "Application requested location.reload(); restart the NRO from hbmenu.");
    },
    toString() {
      return this.href;
    },
  } satisfies Location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    enumerable: true,
    value: location,
  });
}

function installOfflineFetch(): void {
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const original = input instanceof Request ? input.url : String(input);
    const resolution = resolveLocalRequest(original);
    setRequestedResource(resolution.url, resolution.kind);
    if (resolution.kind === "network" || resolution.kind === "unknown") {
      appendLog("ERROR", "Blocked runtime resource request", {
        url: original,
        resolved: resolution.url,
        kind: resolution.kind,
        stack: new Error("Network request origin").stack,
      });
      throw new TypeError(
        resolution.kind === "network"
          ? `Network access is disabled in the Switch build: ${original}`
          : `Unsupported or out-of-root resource URL is blocked: ${original}`,
      );
    }
    appendLog("INFO", "Local resource request", {
      requested: original,
      resolved: resolution.url,
      kind: resolution.kind,
    });
    if (input instanceof Request) {
      return nativeFetch(new Request(resolution.url, input), init);
    }
    return nativeFetch(resolution.url, init);
  };
}

function resolveLocalRequest(input: string): {
  url: string;
  kind: "embedded" | "sd-card" | "local" | "network" | "unknown";
} {
  if (/^https?:/i.test(input) || /^wss?:/i.test(input) || input.startsWith("//")) {
    return { url: input, kind: "network" };
  }
  if (/^(data|blob):/i.test(input)) {
    return { url: input, kind: "local" };
  }
  if (/^romfs:/i.test(input)) {
    return { url: input, kind: "embedded" };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !/^(sdmc|file):/i.test(input)) {
    return { url: input, kind: "unknown" };
  }

  const withoutQuery = input.replace(/[?#].*$/, "");
  let resolved: string;
  if (/^(sdmc|file):/i.test(withoutQuery)) {
    resolved = withoutQuery.replace(/^file:/i, "sdmc:");
  } else {
    resolved = `${GAME_ROOT}/${withoutQuery.replace(/^\.?\//, "")}`;
  }
  if (!resolved.startsWith(`${GAME_ROOT}/`) && resolved !== GAME_ROOT) {
    return { url: resolved, kind: "unknown" };
  }
  if (resolved.split("/").includes("..")) {
    throw new TypeError(`Local path traversal is blocked: ${input}`);
  }
  return { url: resolved, kind: "sd-card" };
}

function installFontFaceShim(): void {
  const global = globalThis as any;
  if (global.__silverShadowFontFaceShimInstalled) {
    return;
  }
  global.__silverShadowFontFaceShimInstalled = true;

  const NativeFontFace = global.FontFace as typeof FontFace;
  const nativePrototype = NativeFontFace.prototype;
  const nativeLoad = Object.getOwnPropertyDescriptor(nativePrototype, "load");
  if (nativeLoad?.configurable !== false) {
    Object.defineProperty(nativePrototype, "load", {
      configurable: true,
      value(this: FontFace) {
        return this.status === "loaded"
          ? Promise.resolve(this)
          : Promise.reject(new Error(`Font "${this.family}" could not be loaded from its local buffer.`));
      },
      writable: true,
    });
  }

  const CompatibleFontFace = function (
    this: FontFace,
    family: string,
    source: string | BufferSource,
    descriptors?: FontFaceDescriptors,
  ): FontFace {
    if (typeof source !== "string") {
      return new NativeFontFace(family, source, descriptors);
    }
    const match = /^\s*url\(\s*(["']?)(.*?)\1\s*\)\s*$/i.exec(source);
    if (!match?.[2]) {
      throw new Error(`Unsupported Switch FontFace source for "${family}": ${source}`);
    }
    const resolution = resolveLocalRequest(match[2]);
    if (resolution.kind !== "sd-card") {
      throw new Error(`Switch FontFace URL must resolve inside the game folder: ${source}`);
    }
    setRequestedResource(resolution.url, resolution.kind);
    const data = Switch.readFileSync(resolution.url);
    if (data === null) {
      throw new Error(`Switch FontFace file is missing: ${resolution.url}`);
    }
    const face = new NativeFontFace(family, data, descriptors);
    appendLog("INFO", "Mapped game FontFace URL to local buffer", {
      family,
      requested: source,
      resolved: resolution.url,
      bytes: data.byteLength,
      status: face.status,
    });
    return face;
  } as unknown as typeof FontFace;
  CompatibleFontFace.prototype = nativePrototype;
  Object.setPrototypeOf(CompatibleFontFace, NativeFontFace);
  Object.defineProperty(global, "FontFace", {
    configurable: true,
    value: CompatibleFontFace,
    writable: true,
  });
  appendLog("INFO", "Installed local FontFace URL compatibility");
}

function installFonts(): void {
  for (const [family, file] of [
    ["emerald", "pokemon-emerald-pro.ttf"],
    ["pkmnems", "pkmnems.ttf"],
  ] as const) {
    const path = `${GAME_ROOT}/fonts/${file}`;
    setRequestedResource(path, "sd-card");
    const data = Switch.readFileSync(path);
    if (data === null) {
      appendLog("WARN", "Optional bootstrap font is missing", { family, path });
      continue;
    }
    const face = new FontFace(family, data);
    fonts.add(face);
    appendLog("INFO", "Registered external game font", {
      family,
      path,
      bytes: data.byteLength,
      status: face.status,
    });
  }
}

function logFontMetrics(): void {
  try {
    const canvas = new OffscreenCanvas(512, 128);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not create a 2D canvas context");
    }
    context.textBaseline = "alphabetic";
    context.fillStyle = "#ffffff";

    for (const family of ["emerald", "pkmnems"]) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = `48px ${family}`;
      const sample = "Agjpqy0123";
      const metrics = context.measureText(sample);
      context.fillText(sample, 8, 88);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let firstPixelY = canvas.height;
      let lastPixelY = -1;
      for (let y = 0; y < canvas.height; y++) {
        const rowStart = y * canvas.width * 4;
        for (let x = 0; x < canvas.width; x++) {
          if (pixels[rowStart + x * 4 + 3] !== 0) {
            firstPixelY = Math.min(firstPixelY, y);
            lastPixelY = Math.max(lastPixelY, y);
          }
        }
      }
      appendLog("INFO", "Font metrics diagnostic", {
        family,
        font: context.font,
        width: metrics.width,
        actualBoundingBoxAscent: metrics.actualBoundingBoxAscent,
        actualBoundingBoxDescent: metrics.actualBoundingBoxDescent,
        fontBoundingBoxAscent: metrics.fontBoundingBoxAscent,
        fontBoundingBoxDescent: metrics.fontBoundingBoxDescent,
        firstPixelY: firstPixelY === canvas.height ? null : firstPixelY,
        lastPixelY: lastPixelY < 0 ? null : lastPixelY,
      });
    }
  } catch (error) {
    appendLog("WARN", "Font metrics diagnostic failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

boot().catch(showFatalError);
