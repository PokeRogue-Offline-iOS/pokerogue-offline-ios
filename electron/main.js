/**
 * main.js — Electron main process for PokeRogueOffline (Linux desktop)
 *
 * Loads the pre-built dist/ folder from the app's resources, wires up
 * save-file import/export via IPC, and presents a full-screen game window.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

// In production the built dist/ is copied next to main.js inside the AppImage.
// In development (running `electron .` from pokerogue-src/) point at dist/.
const DIST_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "dist")
  : path.join(__dirname, "dist");

const SAVE_DIR = path.join(app.getPath("userData"), "saves");

// ---------------------------------------------------------------------------
// Ensure save directory exists
// ---------------------------------------------------------------------------
if (!fs.existsSync(SAVE_DIR)) {
  fs.mkdirSync(SAVE_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: "PokeRogueOffline",
    icon: path.join(__dirname, "appIcon.png"),
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow local file loads from dist/
      webSecurity: false,
    },
  });

  mainWindow.loadFile(path.join(DIST_DIR, "index.html"));

  // Open external links in the system browser, not a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------------------------------------------------------------------------
// IPC — Save file import / export
// ---------------------------------------------------------------------------

/**
 * Show an open-file dialog and return the chosen file's contents as a string.
 * Used by the renderer to import a .prsv save exported from pokerogue.net.
 */
ipcMain.handle("save:import", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import Save File",
    defaultPath: app.getPath("downloads"),
    filters: [
      { name: "PokeRogue Save", extensions: ["prsv", "json"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  return {
    name: path.basename(filePath),
    data: fs.readFileSync(filePath, "utf8"),
  };
});

/**
 * Show a save-file dialog and write `data` to the chosen path.
 * Used by the renderer to export the current save to disk.
 */
ipcMain.handle("save:export", async (_event, { name, data }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export Save File",
    defaultPath: path.join(app.getPath("downloads"), name || "save.prsv"),
    filters: [
      { name: "PokeRogue Save", extensions: ["prsv", "json"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled || !result.filePath) return false;

  fs.writeFileSync(result.filePath, data, "utf8");
  return true;
});

/**
 * Read a named key from the local userData saves folder.
 * This mirrors the Capacitor Filesystem plugin used on mobile.
 */
ipcMain.handle("save:read", (_event, key) => {
  const file = path.join(SAVE_DIR, sanitizeKey(key));
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
});

/**
 * Write a named key to the local userData saves folder.
 */
ipcMain.handle("save:write", (_event, key, value) => {
  const file = path.join(SAVE_DIR, sanitizeKey(key));
  fs.writeFileSync(file, value, "utf8");
  return true;
});

/**
 * Delete a named key from the local userData saves folder.
 */
ipcMain.handle("save:delete", (_event, key) => {
  const file = path.join(SAVE_DIR, sanitizeKey(key));
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return true;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip path separators so save keys can't escape the saves directory. */
function sanitizeKey(key) {
  return String(key).replace(/[/\\]/g, "_");
}
