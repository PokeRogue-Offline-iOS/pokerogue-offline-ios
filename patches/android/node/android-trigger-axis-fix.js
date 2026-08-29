#!/usr/bin/env node
/**
 * Patch: android-trigger-axis-fix.js
 *
 * Fixes analog L2/R2 shoulder triggers on Android gaming handhelds
 * (Anbernic RG Rotate and similar) in the Capacitor APK.
 *
 * Root cause:
 *   These devices expose their Hall-effect triggers to the Android Chrome
 *   WebView as a MotionEvent analog *axis* stream. The WebView surfaces that
 *   data on `Gamepad.axes[...]` but never populates the matching
 *   `Gamepad.buttons[6]` / `buttons[7]` — `GamepadButton.pressed` and `.value`
 *   stay 0.
 *
 *   PokeRogue's input stack runs entirely on Phaser 3.90's Gamepad plugin,
 *   which only emits `down`/`up` from `navigator.getGamepads()[i].buttons[n]`
 *   and requires `button.value >= 1` (Phaser `Button.threshold === 1`). The
 *   triggers therefore never register.
 *
 * Fix:
 *   Inject a shim that wraps `navigator.getGamepads` so every snapshot the game
 *   reads carries synthetic `buttons[6]` / `buttons[7]` derived from the axis
 *   stream (auto-calibrating against each pad's rest position), plus a
 *   pass-through for analog trigger buttons that report a value but never quite
 *   reach 1.0. The standard pad configs already map `LT: 6` / `RT: 7`, so no
 *   game-code change is needed.
 *
 * Targets: pokerogue-src/dist/index.html  (Android build only)
 */

const fs = require("fs");
const path = require("path");

const TARGET = path.join("pokerogue-src", "dist", "index.html");

if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  console.error("Make sure this runs after the build step (dist/ must exist).");
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");

const MARKER = "android-trigger-axis-fix";

if (src.includes(MARKER)) {
  console.log("Android trigger axis fix already present, skipping.");
  process.exit(0);
}

if (!src.includes("</head>")) {
  console.error("ERROR: Could not find </head> in index.html.");
  process.exit(1);
}

const SCRIPT_BLOCK = `
  <script id="${MARKER}">
    // Anbernic-style Android handhelds expose their analog Hall-effect L2/R2
    // triggers as a Gamepad axis stream but never populate buttons[6]/[7]
    // (GamepadButton.pressed/.value stay 0). Phaser only emits down/up from
    // buttons[n].value >= 1, so the game never sees the triggers.
    //
    // This wraps navigator.getGamepads so every snapshot the game reads carries
    // synthetic buttons[6]/[7] derived from the axis stream (and from analog
    // trigger buttons that never quite reach 1.0).
    (function () {
      // ── Tuning (safe defaults; no per-device profile) ──────────────────────
      var FIRST_TRIGGER_AXIS = 4;   // axes 0..3 are the two thumbsticks
      var PRESS_DELTA        = 0.5; // deviation from rest that counts as pressed
      var ANALOG_BTN_PRESS   = 0.5; // native buttons[6/7].value over this = pressed
      var L2_BTN_INDEX       = 6;
      var R2_BTN_INDEX       = 7;

      var cap = window.Capacitor;
      if (!(cap && typeof cap.getPlatform === "function" && cap.getPlatform() === "android")) {
        return;
      }

      var nav = window.navigator;
      var nativeGet = nav.getGamepads || nav.webkitGetGamepads;
      if (typeof nativeGet !== "function") {
        return;
      }
      nativeGet = nativeGet.bind(nav);

      // Per-pad rest baseline for candidate trigger axes, keyed by index + id.
      var baselines = Object.create(null);

      function makeButton(pressed) {
        return { pressed: pressed, touched: pressed, value: pressed ? 1 : 0 };
      }

      function synthPad(pad) {
        if (!pad) {
          return pad;
        }
        var axes = pad.axes || [];
        var key = pad.index + ":" + pad.id;
        var base = baselines[key];
        if (!base) {
          base = baselines[key] = Object.create(null);
        }

        // Candidate trigger axes: everything past the two thumbsticks. Record
        // each one's rest position the first time we see it.
        var cand = [];
        for (var i = FIRST_TRIGGER_AXIS; i < axes.length; i++) {
          if (typeof base[i] !== "number") {
            base[i] = axes[i]; // first sight of this axis = its rest position
          }
          cand.push(i);
        }

        var l2 = false;
        var r2 = false;
        if (cand.length >= 2) {
          // Common ABS_Z / ABS_RZ layout: one axis per trigger, judged
          // independently against its own rest position.
          l2 = Math.abs(axes[cand[0]] - base[cand[0]]) > PRESS_DELTA;
          r2 = Math.abs(axes[cand[1]] - base[cand[1]]) > PRESS_DELTA;
        } else if (cand.length === 1) {
          // Single combined axis: negative pull -> L2, positive pull -> R2.
          var d = axes[cand[0]] - base[cand[0]];
          l2 = d < -PRESS_DELTA;
          r2 = d > PRESS_DELTA;
        }

        var nativeButtons = pad.buttons || [];
        function nativeAnalogPressed(idx) {
          var b = nativeButtons[idx];
          return !!b && (b.pressed || b.value > ANALOG_BTN_PRESS);
        }

        // Fold in analog trigger buttons that report a value but never reach the
        // 1.0 Phaser needs.
        l2 = l2 || nativeAnalogPressed(L2_BTN_INDEX);
        r2 = r2 || nativeAnalogPressed(R2_BTN_INDEX);

        var len = Math.max(nativeButtons.length, R2_BTN_INDEX + 1);
        var buttons = new Array(len);
        for (var k = 0; k < len; k++) {
          var nb = nativeButtons[k];
          buttons[k] = nb
            ? { pressed: nb.pressed, touched: nb.touched, value: nb.value }
            : makeButton(false);
        }
        buttons[L2_BTN_INDEX] = makeButton(l2);
        buttons[R2_BTN_INDEX] = makeButton(r2);

        if (window.__triggerAxisDebug) {
          try {
            console.log("[trigger-axis-fix]", pad.index, pad.id,
              "axes=", Array.prototype.slice.call(axes),
              "candidateAxes=", cand, "L2=", l2, "R2=", r2);
          } catch (e) { /* ignore */ }
        }

        // Phaser skips updates when pad.timestamp regresses, so forward it (and
        // the rest of the identifying fields / axes) verbatim.
        return {
          id: pad.id,
          index: pad.index,
          connected: pad.connected,
          mapping: pad.mapping,
          timestamp: pad.timestamp,
          axes: axes,
          buttons: buttons,
          vibrationActuator: pad.vibrationActuator,
        };
      }

      function wrapped() {
        var pads = nativeGet();
        if (!pads) {
          return pads;
        }
        var out = [];
        for (var i = 0; i < pads.length; i++) {
          out.push(pads[i] ? synthPad(pads[i]) : null);
        }
        return out;
      }

      try {
        nav.getGamepads = wrapped;
        if (nav.webkitGetGamepads) {
          nav.webkitGetGamepads = wrapped;
        }
      } catch (e) {
        // getGamepads may be non-writable on some engines; nothing else to do.
      }
    })();
  </script>`;

const patched = src.replace("</head>", `${SCRIPT_BLOCK}\n</head>`);

if (patched === src) {
  console.error("ERROR: Replacement produced no change.");
  process.exit(1);
}

fs.writeFileSync(TARGET, patched, "utf8");
console.log(`Injected Android trigger axis fix into ${TARGET}`);
console.log("Android trigger axis fix applied successfully.");
