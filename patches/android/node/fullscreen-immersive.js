#!/usr/bin/env node
/**
 * Patch: fullscreen-immersive.js
 *
 * Enables sticky immersive fullscreen mode on Android so the status bar and
 * navigation bar are hidden while the game is running, giving a true full-
 * screen game experience.
 *
 * Approach:
 *   Overrides onWindowFocusChanged() in MainActivity.java to call hideSystemUI()
 *   whenever the window regains focus (e.g. after a dialog or toast dismisses).
 *   Uses WindowInsetsController on Android 11+ (API 30+) and the legacy
 *   SYSTEM_UI_FLAG_IMMERSIVE_STICKY flags on older versions.
 *
 * Targets: android/app/src/main/java/com/scooom/pokerogueoffline/MainActivity.java
 *   (path is derived from the applicationId in capacitor.config.json if present,
 *    but we locate the file by glob to be robust against package name changes)
 */

const fs   = require("fs");
const path = require("path");

// ── Locate MainActivity.java ──────────────────────────────────────────────────

function findMainActivity(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const result = findMainActivity(full);
      if (result) return result;
    } else if (entry.name === "MainActivity.java") {
      return full;
    }
  }
  return null;
}

const ANDROID_ROOT = path.join("android", "app", "src", "main", "java");

if (!fs.existsSync(ANDROID_ROOT)) {
  console.error(`ERROR: Could not find Android source directory: ${ANDROID_ROOT}`);
  console.error("Make sure 'npx cap add android' has been run before this patch.");
  process.exit(1);
}

const TARGET = findMainActivity(ANDROID_ROOT);

if (!TARGET) {
  console.error(`ERROR: Could not find MainActivity.java under ${ANDROID_ROOT}`);
  process.exit(1);
}

console.log(`Found MainActivity.java at: ${TARGET}`);

// ── Read & guard ──────────────────────────────────────────────────────────────

let src = fs.readFileSync(TARGET, "utf8");

if (src.includes("fullscreen-immersive")) {
  console.log("Fullscreen immersive patch already present, skipping.");
  process.exit(0);
}

// ── Build replacement ─────────────────────────────────────────────────────────

// We need to:
//  1. Add new imports after the existing import block
//  2. Add onWindowFocusChanged() and hideSystemUI() methods inside the class

const IMPORT_ANCHOR = "import com.getcapacitor.BridgeActivity;";

const NEW_IMPORTS = `import android.os.Build;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.View;
`;

// Insert new imports right before the BridgeActivity import line
if (!src.includes(IMPORT_ANCHOR)) {
  console.error("ERROR: Could not find import anchor 'import com.getcapacitor.BridgeActivity;'");
  console.error("MainActivity.java structure may have changed. Manual inspection required.");
  process.exit(1);
}

src = src.replace(IMPORT_ANCHOR, NEW_IMPORTS + IMPORT_ANCHOR);

// ── Inject methods before the closing brace of the class ─────────────────────

const METHODS = `
    // fullscreen-immersive: re-apply immersive mode whenever the window regains focus
    // (e.g. after a Capacitor dialog, toast, or permission prompt is dismissed).
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    private void hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+ (API 30): use the modern WindowInsetsController API
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            // Android 10 and below: use the legacy SYSTEM_UI_FLAG_* API
            //noinspection deprecation
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
            );
        }
    }
`;

// Find the last closing brace of the class and inject before it
const lastBrace = src.lastIndexOf("}");
if (lastBrace === -1) {
  console.error("ERROR: Could not find closing brace of MainActivity class.");
  process.exit(1);
}

src = src.slice(0, lastBrace) + METHODS + src.slice(lastBrace);

// ── Write ─────────────────────────────────────────────────────────────────────

fs.writeFileSync(TARGET, src, "utf8");
console.log(`Patched MainActivity.java at ${TARGET}`);
console.log("Fullscreen immersive patch applied successfully.");
