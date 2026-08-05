#!/usr/bin/env node

/** Switch-only physical-input lifecycle hardening. */

const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Could not find ${file}`);
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function replaceRequired(source, anchor, replacement, description) {
  if (!source.includes(anchor)) fail(`Could not find ${description}`);
  return source.replace(anchor, replacement);
}

function replaceBetween(source, start, end, replacement, description) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) fail(`Could not find ${description}`);
  return source.slice(0, startIndex) + replacement + source.slice(endIndex);
}

const inputsPath = path.join("pokerogue-src", "src", "inputs-controller.ts");
let source = read(inputsPath);

source = replaceRequired(
  source,
  `  private readonly inputInterval: NodeJS.Timeout[] = [];
  private touchControls: TouchControl;`,
  `  private readonly inputInterval: NodeJS.Timeout[] = [];
  private readonly physicalDown = new Map<string, Button>();
  private readonly suppressedUntilRelease = new Set<string>();
  private transitionGeneration = 0;
  private inputDiagnosticCount = 0;
  private touchControls: TouchControl;`,
  "input lifecycle fields",
);

source = replaceRequired(
  source,
  `    globalScene.game.events.on(Phaser.Core.Events.BLUR, () => {
      this.loseFocus();
    });`,
  `    globalScene.game.events.on(Phaser.Core.Events.BLUR, () => {
      this.loseFocus();
    });
    globalScene.game.events.on(Phaser.Core.Events.FOCUS, () => {
      this.recordPhysicalInput("focus", "window", undefined);
    });`,
  "focus listener",
);

source = replaceRequired(
  source,
  `  onDisconnect(thisGamepad: Phaser.Input.Gamepad.Gamepad): void {
    this.disconnectedGamepads.push(thisGamepad.id);
  }`,
  `  onDisconnect(thisGamepad: Phaser.Input.Gamepad.Gamepad): void {
    this.disconnectedGamepads.push(thisGamepad.id);
    this.beginInputBoundary("disconnect", \`gamepad:\${thisGamepad.id}:\`);
  }`,
  "gamepad disconnect handler",
);

source = replaceRequired(
  source,
  `  onReconnect(thisGamepad: Phaser.Input.Gamepad.Gamepad): void {
    this.disconnectedGamepads = this.disconnectedGamepads.filter(g => g !== thisGamepad.id);
  }`,
  `  onReconnect(thisGamepad: Phaser.Input.Gamepad.Gamepad): void {
    this.disconnectedGamepads = this.disconnectedGamepads.filter(g => g !== thisGamepad.id);
    const prefix = \`gamepad:\${thisGamepad.id}:\`;
    for (const physical of [...this.suppressedUntilRelease]) {
      if (!physical.startsWith(prefix)) continue;
      const index = Number(physical.slice(prefix.length));
      if (!thisGamepad.buttons[index]?.pressed) {
        this.suppressedUntilRelease.delete(physical);
      }
    }
    this.recordPhysicalInput("reconnect", prefix, undefined);
  }`,
  "gamepad reconnect handler",
);

const helpers = `  /** Prevent input state created in one UI generation from entering the next. */
  beginUiTransition(from: UiMode, to: UiMode): void {
    this.beginInputBoundary(\`ui:\${UiMode[from]}->\${UiMode[to]}\`);
  }

  private beginInputBoundary(reason: string, physicalPrefix?: string): void {
    this.transitionGeneration++;
    for (const [physical, mapped] of [...this.physicalDown]) {
      if (physicalPrefix && !physical.startsWith(physicalPrefix)) continue;
      this.events.emit("input_up", {
        controller_type: physical.startsWith("gamepad:") ? "gamepad" : "keyboard",
        button: mapped,
      });
      this.physicalDown.delete(physical);
      this.suppressedUntilRelease.add(physical);
      this.releaseLogicalButton(mapped);
      this.recordPhysicalInput("boundary", physical, mapped, { reason });
    }
    for (const value of Object.values(this.inputInterval)) clearInterval(value);
    this.buttonLock = [];
  }

  private isDirectional(button: Button): boolean {
    return button === Button.UP || button === Button.DOWN || button === Button.LEFT || button === Button.RIGHT;
  }

  private releaseLogicalButton(button: Button): void {
    if (![...this.physicalDown.values()].includes(button)) {
      const index = this.buttonLock.indexOf(button);
      if (index >= 0) this.buttonLock.splice(index, 1);
      clearInterval(this.inputInterval[button]);
    }
  }

  private recordPhysicalInput(
    status: string,
    physical: string,
    mapped: Button | undefined,
    detail: Record<string, unknown> = {},
  ): void {
    const entry = {
      timestamp: Date.now(),
      status,
      physical,
      mapped: mapped === undefined ? null : Button[mapped],
      uiMode: globalScene.ui ? UiMode[globalScene.ui.getMode()] : null,
      generation: this.transitionGeneration,
      ...detail,
    };
    const global = globalThis as any;
    const events = (global.__SILVERSHADOW_INPUT_EVENTS__ ??= []) as unknown[];
    events.push(entry);
    if (events.length > 96) events.shift();
    if (this.inputDiagnosticCount < 256 || status === "unmatched-up" || status === "suppressed") {
      this.inputDiagnosticCount++;
      global.__SILVERSHADOW_DIAGNOSTICS__?.checkpoint?.(\`input:\${status}\`, entry);
    }
  }

  private pressPhysical(controllerType: "keyboard" | "gamepad", physical: string, mapped: Button): void {
    if (this.suppressedUntilRelease.has(physical)) {
      this.recordPhysicalInput("suppressed", physical, mapped);
      return;
    }
    if (this.physicalDown.has(physical)) {
      this.recordPhysicalInput("duplicate-down", physical, mapped);
      return;
    }
    this.physicalDown.set(physical, mapped);
    if (this.buttonLock.includes(mapped)) {
      this.recordPhysicalInput("logical-locked", physical, mapped);
      return;
    }
    this.buttonLock.push(mapped);
    this.events.emit("input_down", { controller_type: controllerType, button: mapped });
    this.recordPhysicalInput("down", physical, mapped);
    if (!this.isDirectional(mapped)) return;
    const generation = this.transitionGeneration;
    clearInterval(this.inputInterval[mapped]);
    this.inputInterval[mapped] = setInterval(() => {
      if (generation !== this.transitionGeneration || this.physicalDown.get(physical) !== mapped) {
        clearInterval(this.inputInterval[mapped]);
        return;
      }
      this.events.emit("input_down", { controller_type: controllerType, button: mapped });
      this.recordPhysicalInput("repeat", physical, mapped);
    }, repeatInputDelayMillis);
  }

  private releasePhysical(controllerType: "keyboard" | "gamepad", physical: string): void {
    if (this.suppressedUntilRelease.delete(physical)) {
      this.recordPhysicalInput("rearmed", physical, undefined);
      return;
    }
    const mapped = this.physicalDown.get(physical);
    if (mapped === undefined) {
      this.recordPhysicalInput("unmatched-up", physical, undefined);
      return;
    }
    this.physicalDown.delete(physical);
    this.events.emit("input_up", { controller_type: controllerType, button: mapped });
    this.releaseLogicalButton(mapped);
    this.recordPhysicalInput("up", physical, mapped);
  }

`;

source = replaceRequired(
  source,
  `  /**
   * Handles the keydown event for the keyboard.`,
  `${helpers}  /**
   * Handles the keydown event for the keyboard.`,
  "keyboard handler documentation",
);

source = replaceBetween(
  source,
  `  keyboardKeyDown(event: KeyboardEvent): void {`,
  `  /**
   * Handles the keyup event for the keyboard.`,
  `  keyboardKeyDown(event: KeyboardEvent): void {
    this.lastSource = "keyboard";
    this.ensureKeyboardIsInit();
    const buttonDown = getButtonWithKeycode(this.getActiveConfig(Device.KEYBOARD)!, event.keyCode);
    if (buttonDown != null) this.pressPhysical("keyboard", \`keyboard:\${event.keyCode}\`, buttonDown);
  }

`,
  "keyboard keydown method",
);

source = replaceBetween(
  source,
  `  keyboardKeyUp(event: KeyboardEvent): void {`,
  `  /**
   * Handles button press events on a gamepad.`,
  `  keyboardKeyUp(event: KeyboardEvent): void {
    this.lastSource = "keyboard";
    this.releasePhysical("keyboard", \`keyboard:\${event.keyCode}\`);
  }

`,
  "keyboard keyup method",
);

const gamepadDownStart = `  gamepadButtonDown(pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button, _value: number): void {`;
const gamepadDownPrefix = `  gamepadButtonDown(pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button, _value: number): void {
    if (!this.configs[this.selectedDevice[Device.KEYBOARD]]?.padID) this.setupKeyboard();
    if (!pad) return;
    this.lastSource = "gamepad";
    if (!this.selectedDevice[Device.GAMEPAD] || (globalScene.ui.getMode() !== UiMode.GAMEPAD_BINDING && this.selectedDevice[Device.GAMEPAD] !== pad.id.toLowerCase())) {
      this.setChosenGamepad(pad.id);
    }
    if (!this.gamepadSupport || pad.id.toLowerCase() !== this.selectedDevice[Device.GAMEPAD]?.toLowerCase()) return;
    const activeConfig = this.getActiveConfig(Device.GAMEPAD);
    const mapped = activeConfig && getButtonWithKeycode(activeConfig, button.index);
    if (mapped != null) this.pressPhysical("gamepad", \`gamepad:\${pad.id}:\${button.index}\`, mapped);
  }

`;
source = replaceBetween(source, gamepadDownStart, `  /**
   * Responds to a button release event on a gamepad`, gamepadDownPrefix, "gamepad down method");

source = replaceBetween(
  source,
  `  gamepadButtonUp(pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button, _value: number): void {`,
  `  /**
   * Retrieves the configuration object for a gamepad`,
  `  gamepadButtonUp(pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button, _value: number): void {
    if (!pad) return;
    this.lastSource = "gamepad";
    this.releasePhysical("gamepad", \`gamepad:\${pad.id}:\${button.index}\`);
  }

`,
  "gamepad up method",
);

source = replaceRequired(
  source,
  `  deactivatePressedKey(): void {
    for (const value of Object.values(this.inputInterval)) {
      clearInterval(value);
    }
    this.buttonLock = [];
  }`,
  `  deactivatePressedKey(): void {
    this.beginInputBoundary("deactivate");
  }`,
  "deactivate input method",
);

for (const marker of [
  `private readonly physicalDown = new Map<string, Button>()`,
  `if (!this.isDirectional(mapped)) return`,
  `recordPhysicalInput("unmatched-up"`,
  `beginUiTransition(from: UiMode, to: UiMode)`,
]) {
  if (!source.includes(marker)) fail(`Final input source is missing ${marker}`);
}
fs.writeFileSync(inputsPath, source, "utf8");

const uiPath = path.join("pokerogue-src", "src", "ui", "ui.ts");
let ui = read(uiPath);
ui = replaceRequired(
  ui,
  `      const doSetMode = () => {`,
  `      globalScene.inputController?.beginUiTransition(this.mode, mode);
      const doSetMode = () => {`,
  "UI mode transition boundary",
);
ui = replaceRequired(
  ui,
  `      const lastMode = this.mode;

      const doRevertMode = () => {`,
  `      const lastMode = this.mode;
      const nextMode = this.modeChain[this.modeChain.length - 1];
      globalScene.inputController?.beginUiTransition(lastMode, nextMode);

      const doRevertMode = () => {`,
  "UI revert transition boundary",
);
if ((ui.match(/beginUiTransition/g) ?? []).length !== 2) fail("Expected exactly two UI transition boundaries");
fs.writeFileSync(uiPath, ui, "utf8");

console.log("Switch physical input lifecycle stabilization applied.");
