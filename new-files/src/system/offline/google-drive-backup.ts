/**
 * Cross-platform Google Drive backup helper for PokeRogue-Offline.
 *
 * Backs up every localStorage key EXCEPT in-progress session data
 * (`sessionData`, `sessionData1`..`sessionData4`, per-user) to the user's
 * hidden Drive "appDataFolder". Manual-trigger only — no auto-sync of any
 * kind, in either direction.
 *
 * Restore is now implemented ({@link restoreFromBackup}) — downloads the
 * existing backup file and writes every key straight back into
 * localStorage. Since the backup never contained session keys to begin
 * with, restoring can't touch an in-progress run either way.
 *
 * Token model: on Electron, main.cjs now requests offline access and
 * persists a refresh token (encrypted via Electron's safeStorage where
 * available) so the connection survives app restarts — see main.cjs for the
 * full explanation of why the original online-only flow lost the connection
 * every time the app reopened. On Capacitor, the native Google Sign-In SDKs
 * typically persist sign-in state on-device themselves; whether that means
 * no extra work is needed here or whether an explicit "restore previous
 * sign-in" call is required has NOT been verified yet — flagged below.
 *
 * NOTE: This module has not been exercised against a live Drive account or a
 * real device/build yet. The request shapes follow Drive API v3's documented
 * multipart-upload format, but treat this as a solid first draft that needs
 * to be verified end-to-end once wired into an actual build.
 */

const BACKUP_FILE_NAME = "pkroffline-save-backup.json";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

// Matches sessionData_<user>, sessionData1_<user> ... sessionData4_<user>.
const SESSION_KEY_PATTERN = /^sessionData\d*_/;

declare global {
  interface Window {
    // Injected by @capacitor/core at runtime on Android/iOS builds.
    Capacitor?: {
      isNativePlatform?: () => boolean;
    };
    // Injected by configs/desktop/electron/preload.cjs on the Electron build.
    pkrOffline?: {
      googleSignIn: () => Promise<string>;
      hasStoredGoogleCredentials: () => Promise<boolean>;
      googleSignOut: () => Promise<boolean>;
    };
  }
}

function isCapacitor(): boolean {
  return typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
}

function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.pkrOffline;
}

let cachedAccessToken: string | null = null;

/** Whether we currently hold an access token from a prior sign-in this session. */
export function isSignedIn(): boolean {
  return !!cachedAccessToken;
}

/**
 * Attempts to silently restore a connection from a previous session, without
 * prompting the user. Safe to call on every screen open — on Electron this
 * hits the fast/no-browser-popup path in main.cjs when a stored refresh
 * token exists, and does nothing if one doesn't. Returns whether it
 * succeeded.
 *
 * On Capacitor: NOT YET IMPLEMENTED. The native SDKs likely handle this
 * automatically or via their own "restore previous sign-in" call, but that
 * hasn't been confirmed against the actual plugin — see the plan doc's list
 * of unverified items. Always returns false here for now rather than
 * guessing at an API call that might not exist.
 */
export async function tryRestoreSession(): Promise<boolean> {
  if (cachedAccessToken) {
    return true;
  }

  if (isElectron()) {
    try {
      const hasStored = await window.pkrOffline!.hasStoredGoogleCredentials();
      if (!hasStored) {
        return false;
      }
      cachedAccessToken = await window.pkrOffline!.googleSignIn();
      return true;
    } catch (err) {
      console.warn("Silent Google session restore failed:", err);
      return false;
    }
  }

  return false;
}

/** Forgets the current connection, on Electron also deleting the stored refresh token. */
export async function signOut(): Promise<void> {
  cachedAccessToken = null;
  if (isElectron()) {
    await window.pkrOffline!.googleSignOut();
  }
  // Capacitor sign-out not implemented yet — same caveat as tryRestoreSession.
}

/**
 * Signs the user into Google, scoped to drive.appdata only, and caches the
 * resulting access token for use by {@link backupSave}.
 */
export async function signIn(): Promise<string> {
  if (isCapacitor()) {
    // @capgo/capacitor-social-login — NOT @codetrix-studio/capacitor-google-auth.
    // The codetrix plugin is effectively unmaintained (peer dep capped at
    // Capacitor 6; this project pins Capacitor 8), so this fork is used
    // instead. API shape is meaningfully different — see the plan doc and
    // https://capgo.app/docs/plugins/social-login/google/android/
    const { SocialLogin } = await import("@capgo/capacitor-social-login");
    await SocialLogin.initialize({
      google: {
        // webClientId is intentionally used here even though we're on a
        // native platform — see capacitor.config.json comments; this is a
        // "Web application" type client used purely as the token audience.
        webClientId: "856587427302-iffda5uuavbg9ft4eo4f5c93fmu46kqg.apps.googleusercontent.com",
        // REQUIRED on iOS specifically — without this, SocialLogin.login()
        // throws "No provider was initialized" on iOS even though the exact
        // same call works fine on Android with only webClientId set. Harmless
        // to include on Android too, so it's set unconditionally here rather
        // than branching on platform.
        //
        // This value is DIFFERENT for the prod (xyz.scooom.pkr) vs dev
        // (xyz.scooom.pkrdev) iOS builds, since Google's iOS OAuth clients are
        // bundle-ID-locked — substituted at build time via sed, sourced from
        // GOOGLE_IOS_CLIENT_ID / GOOGLE_IOS_DEV_CLIENT_ID secrets. Android
        // ignores this field entirely, so it gets the prod value there too —
        // doesn't matter functionally, just keeps one substitution convention.
        iOSClientId: "IOS_CLIENT_ID_PLACEHOLDER",
        iOSServerClientId: "856587427302-iffda5uuavbg9ft4eo4f5c93fmu46kqg.apps.googleusercontent.com",
        mode: "online", // plain access token, not the server-auth-code/offline flow
      },
    });
    const res = await SocialLogin.login({
      provider: "google",
      options: { scopes: ["https://www.googleapis.com/auth/drive.appdata"] },
    });
    const token = res?.result?.accessToken?.token;
    if (!token) {
      throw new Error("Google sign-in did not return an access token.");
    }
    cachedAccessToken = token;
    return token;
  }

  if (isElectron()) {
    const token = await window.pkrOffline!.googleSignIn();
    if (!token) {
      throw new Error("Google sign-in did not return an access token.");
    }
    cachedAccessToken = token;
    return token;
  }

  throw new Error("Google sign-in is not supported in this build.");
}

/** Collect every localStorage key/value except in-progress session slots. */
function collectBackupPayload(): Record<string, string> {
  const payload: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || SESSION_KEY_PATTERN.test(key)) {
      continue;
    }
    const value = localStorage.getItem(key);
    if (value !== null) {
      payload[key] = value;
    }
  }
  return payload;
}

/** Find an existing backup file's Drive file ID inside appDataFolder, if one exists. */
async function findExistingBackupFileId(accessToken: string): Promise<string | null> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${BACKUP_FILE_NAME}'`,
    fields: "files(id, modifiedTime)",
  });

  const res = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Drive file lookup failed: ${res.status}`);
  }

  const body = await res.json();
  return body.files?.[0]?.id ?? null;
}

/**
 * Uploads (or overwrites) the single backup file in the user's Drive
 * appDataFolder. Returns the ISO timestamp the backup was made at.
 */
export async function backupSave(): Promise<string> {
  if (!cachedAccessToken) {
    throw new Error("Not signed in — call signIn() first.");
  }

  const payload = collectBackupPayload();
  const madeAt = new Date().toISOString();
  const fileContent = JSON.stringify({ backedUpAt: madeAt, data: payload });

  const existingId = await findExistingBackupFileId(cachedAccessToken);

  const metadata = existingId ? { name: BACKUP_FILE_NAME } : { name: BACKUP_FILE_NAME, parents: ["appDataFolder"] };

  const boundary = "pkroffline-backup-boundary";
  const multipartBody =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    "Content-Type: application/json\r\n\r\n" +
    `${fileContent}\r\n` +
    `--${boundary}--`;

  const url = existingId
    ? `${DRIVE_UPLOAD_URL}/${existingId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${cachedAccessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) {
    throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
  }

  return madeAt;
}

/** A single file's metadata as returned by Drive's files.list, for the debug listing screen. */
export interface AppDataFileInfo {
  id: string;
  name: string;
  modifiedTime: string;
  size: string;
}

/** Lists every file currently in the app's hidden Drive appDataFolder. */
export async function listAppDataFiles(): Promise<AppDataFileInfo[]> {
  if (!cachedAccessToken) {
    throw new Error("Not signed in — call signIn() first.");
  }

  const params = new URLSearchParams({
    spaces: "appDataFolder",
    fields: "files(id, name, modifiedTime, size)",
  });

  const res = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${cachedAccessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Drive file listing failed: ${res.status}`);
  }

  const body = await res.json();
  return body.files ?? [];
}

/**
 * Downloads and restores the existing Drive backup, overwriting every key it
 * contains directly into localStorage. Since the backup payload never
 * includes session keys (see {@link collectBackupPayload}), this can't touch
 * an in-progress run either way — but the caller is still expected to force
 * a reload afterward so the game actually picks up the restored data, since
 * most of it (save data, unlocks, dex) is only ever read once at boot.
 *
 * Throws if there's no existing backup to restore from.
 */
export async function restoreFromBackup(): Promise<void> {
  if (!cachedAccessToken) {
    throw new Error("Not signed in — call signIn() first.");
  }

  const existingId = await findExistingBackupFileId(cachedAccessToken);
  if (!existingId) {
    throw new Error("No backup found in Google Drive to restore from.");
  }

  const res = await fetch(`${DRIVE_FILES_URL}/${existingId}?alt=media`, {
    headers: { Authorization: `Bearer ${cachedAccessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Drive download failed: ${res.status} ${await res.text()}`);
  }

  const parsed = await res.json();
  const data: Record<string, string> = parsed?.data ?? {};

  for (const [key, value] of Object.entries(data)) {
    if (SESSION_KEY_PATTERN.test(key)) {
      // Defensive only — backups should never contain these to begin with.
      continue;
    }
    localStorage.setItem(key, value);
  }
}
