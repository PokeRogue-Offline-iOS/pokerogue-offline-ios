/**
 * preload.js — Electron contextBridge for PokeRogueOffline (Linux desktop)
 *
 * Exposes a minimal `window.electronSaves` API to the renderer so the game
 * can import/export saves and persist data without needing nodeIntegration.
 *
 * All real filesystem access happens in main.js via ipcMain.handle().
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronSaves", {
  /**
   * Open a file picker and return { name, data } for the chosen save file,
   * or null if the user cancelled.
   */
  import: () => ipcRenderer.invoke("save:import"),

  /**
   * Open a save-file dialog and write data to the chosen path.
   * Returns true on success, false if cancelled.
   */
  export: (name, data) => ipcRenderer.invoke("save:export", { name, data }),

  /**
   * Read a persisted save-data value by key (mirrors localStorage).
   * Returns the stored string, or null if not found.
   */
  read: (key) => ipcRenderer.invoke("save:read", key),

  /**
   * Persist a save-data value by key.
   */
  write: (key, value) => ipcRenderer.invoke("save:write", key, value),

  /**
   * Delete a persisted save-data value by key.
   */
  delete: (key) => ipcRenderer.invoke("save:delete", key),

  /** True in the Electron desktop build; undefined/falsy in browser. */
  isDesktop: true,
});
