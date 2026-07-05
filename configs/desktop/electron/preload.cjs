const { contextBridge, ipcRenderer } = require('electron');

// Exposed to the renderer as `window.pkrOffline`. Kept intentionally tiny —
// just enough for the Drive backup flow (src/system/offline/google-drive-backup.ts
// checks for `window.pkrOffline` to detect it's running under Electron).
contextBridge.exposeInMainWorld('pkrOffline', {
  /**
   * Runs the full Google sign-in flow in the main process (opens the system
   * browser, catches the loopback redirect, exchanges the code for a token)
   * and resolves with a plain Drive-scoped access token.
   */
  googleSignIn: () => ipcRenderer.invoke('google-sign-in'),
});
