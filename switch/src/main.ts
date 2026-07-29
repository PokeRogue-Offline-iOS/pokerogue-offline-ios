import { GAME_ROOT, NXJS_VERSION, PHASER_VERSION } from "./constants";
import { appendLog } from "./logger";
import { installPersistentStorage } from "./storage";
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
});
addEventListener("unhandledrejection", (event: any) => {
  appendLog("ERROR", "Unhandled promise rejection", {
    name: event.reason?.name ?? "UnhandledRejection",
    message: event.reason?.message ?? String(event.reason),
    stack: event.reason?.stack ?? null,
  });
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
    log: "sdmc:/switch/SilverShadow-PokeRogue/logs/milestone2.log",
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
  await installFonts();
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

async function installFonts(): Promise<void> {
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
    await face.load();
    fonts.add(face);
    appendLog("INFO", "Loaded external game font", { family, path, bytes: data.byteLength });
  }
}

boot().catch(showFatalError);
