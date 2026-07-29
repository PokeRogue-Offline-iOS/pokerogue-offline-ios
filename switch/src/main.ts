import {
  NXJS_VERSION,
  PHASER_VERSION,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  TEST_ASSET_PATH,
} from "./constants";
import { patchCanvas } from "./dom-shim";
import { appendLog } from "./logger";
import {
  runCanvasDiagnostics,
  showFatalError,
  validateStartup,
  type CanvasDiagnostics,
  type SwitchGameManifest,
} from "./startup";

const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const value = input instanceof Request ? input.url : input.toString();
  if (/^https?:/i.test(value)) {
    appendLog("ERROR", "Blocked runtime network request", value);
    return Promise.reject(new TypeError(`Network access is disabled in the Switch build: ${value}`));
  }
  return originalFetch(input, init);
};

addEventListener("error", (event: any) => {
  const detail = event.error ?? event.message;
  appendLog("ERROR", "Global error", detail);
});
addEventListener("unhandledrejection", (event: any) => {
  appendLog("ERROR", "Unhandled promise rejection", event.reason);
});

interface ButtonDefinition {
  index: number;
  label: string;
}

const BUTTONS: ButtonDefinition[] = [
  { index: 0, label: "B" },
  { index: 1, label: "A" },
  { index: 2, label: "Y" },
  { index: 3, label: "X" },
  { index: 8, label: "-" },
  { index: 9, label: "+" },
  { index: 12, label: "Up" },
  { index: 13, label: "Down" },
  { index: 14, label: "Left" },
  { index: 15, label: "Right" },
];

async function boot(): Promise<void> {
  appendLog("INFO", "Milestone 1 boot", {
    expectedNxjs: NXJS_VERSION,
    actualNxjs: Switch.version.nxjs,
    v8: Switch.version.v8,
    expectedPhaser: PHASER_VERSION,
  });
  const manifest = validateStartup();
  const diagnostics = runCanvasDiagnostics();

  // Phaser is deliberately evaluated only after startup validation and the
  // Canvas regression checks, so missing external files get a readable error.
  const Phaser = await import("phaser");
  appendLog("INFO", "Phaser module evaluated", Phaser.VERSION);

  class ProofScene extends Phaser.Scene {
    private controllerText!: import("phaser").GameObjects.Text;
    private pulse!: import("phaser").GameObjects.Rectangle;
    private previousA = false;
    private pressCount = 0;
    private assetLoadError = "";

    constructor() {
      super({ key: "SilverShadowNxjsProof" });
    }

    preload(): void {
      this.load.once("loaderror", (file: { src?: string }) => {
        this.assetLoadError = `Phaser could not decode ${file.src ?? TEST_ASSET_PATH}`;
        appendLog("ERROR", this.assetLoadError);
      });
      this.load.image("milestone1-test", TEST_ASSET_PATH);
    }

    create(): void {
      this.add.rectangle(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, SCREEN_WIDTH, SCREEN_HEIGHT, 0x101526);
      this.add
        .text(52, 42, "SilverShadow PokeRogue", {
          fontFamily: "system-ui",
          fontSize: "42px",
          color: "#f2f5ff",
        })
        .setDepth(2);
      this.add
        .text(54, 98, "nx.js V8 + Phaser 3 Milestone 1", {
          fontFamily: "system-ui",
          fontSize: "24px",
          color: "#92a7ff",
        })
        .setDepth(2);

      if (this.textures.exists("milestone1-test") && !this.assetLoadError) {
        const asset = this.add.image(235, 300, "milestone1-test").setScale(2.25);
        this.tweens.add({
          targets: asset,
          angle: { from: -2, to: 2 },
          duration: 900,
          yoyo: true,
          repeat: -1,
        });
        appendLog("INFO", "Phaser loaded the external SD-card PNG", TEST_ASSET_PATH);
      } else {
        this.add.text(70, 260, this.assetLoadError || "External PNG texture is unavailable.", {
          fontFamily: "system-ui",
          fontSize: "22px",
          color: "#ff718a",
          wordWrap: { width: 360 },
        });
      }

      this.pulse = this.add.rectangle(625, 325, 170, 90, 0x637bff).setStrokeStyle(4, 0xbcc7ff);
      this.tweens.add({
        targets: this.pulse,
        scale: { from: 0.92, to: 1.08 },
        alpha: { from: 0.7, to: 1 },
        duration: 750,
        yoyo: true,
        repeat: -1,
      });
      this.add.text(548, 310, "rAF / tween", {
        fontFamily: "system-ui",
        fontSize: "22px",
        color: "#ffffff",
      });

      addDiagnosticText(this, diagnostics, manifest);
      this.controllerText = this.add.text(70, 585, "Controller: waiting for input...", {
        fontFamily: "system-ui",
        fontSize: "23px",
        color: "#ffe69b",
      });
      this.add.text(70, 630, "Press A to increment the input counter. Press + to exit.", {
        fontFamily: "system-ui",
        fontSize: "20px",
        color: "#aeb8d6",
      });
      appendLog("INFO", "Phaser scene create() completed");
    }

    update(): void {
      const gamepad = navigator.getGamepads().find(value => value !== null);
      if (!gamepad) {
        this.controllerText.setText("Controller: none detected");
        return;
      }

      const pressed = BUTTONS.filter(button => gamepad.buttons[button.index]?.pressed).map(button => button.label);
      const aPressed = Boolean(gamepad.buttons[1]?.pressed);
      if (aPressed && !this.previousA) {
        this.pressCount += 1;
        this.pulse.setFillStyle(this.pressCount % 2 ? 0xff4f8b : 0x637bff);
        appendLog("INFO", "Controller A press", { controller: gamepad.id, count: this.pressCount });
      }
      this.previousA = aPressed;
      this.controllerText.setText(
        `Controller: ${gamepad.id || "Switch controller"} | pressed: ${pressed.join(", ") || "none"} | A count: ${this.pressCount}`,
      );
    }
  }

  const config: import("phaser").Types.Core.GameConfig = {
    type: Phaser.CANVAS,
    canvas: patchCanvas(screen),
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: "#101526",
    customEnvironment: true,
    scene: ProofScene,
    banner: false,
    audio: {
      noAudio: true,
    },
    input: {
      keyboard: false,
      mouse: false,
      touch: false,
      gamepad: false,
    },
    loader: {
      imageLoadType: "HTMLImageElement",
    },
  };

  new Phaser.Game(config);
}

function addDiagnosticText(
  scene: import("phaser").Scene,
  diagnostics: CanvasDiagnostics,
  manifest: SwitchGameManifest,
): void {
  const ok = diagnostics.resizeContext === "PASS" && diagnostics.crossContextFont === "PASS";
  const lines = [
    `nx.js: ${Switch.version.nxjs} (V8 ${Switch.version.v8})`,
    `Phaser: ${PHASER_VERSION}`,
    `Canvas resize/context: ${diagnostics.resizeContext}`,
    `Cross-context font: ${diagnostics.crossContextFont}`,
    `External bundle: ${manifest.silverShadowGameVersion}`,
  ];
  scene.add.text(770, 210, lines.join("\n"), {
    fontFamily: "system-ui",
    fontSize: "23px",
    color: ok ? "#91f4b2" : "#ff718a",
    lineSpacing: 12,
  });
}

boot().catch(showFatalError);
