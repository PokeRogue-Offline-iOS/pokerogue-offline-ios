/**
 * Cross-platform Google Drive backup helper for PokeRogue-Offline.
 *
 * Backs up every localStorage key EXCEPT in-progress session data
 * (`sessionData`, `sessionData1`..`sessionData4`, per-user) to the user's
 * hidden Drive "appDataFolder". Manual-trigger only:
 *   - No auto-sync of any kind.
 *   - No restore/import — that's deferred to a future pass.
 *
 * Token model: plain OAuth access token (drive.appdata scope), NOT the
 * server-auth-code/offline-access pattern. This app has no backend, so
 * there's nothing to hand a long-lived refresh flow to — the user is always
 * present when a backup happens (it's a manual button press), so a
 * short-lived access token obtained fresh each time is all that's needed.
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
        webClientId: "REPLACE_WITH_WEB_CLIENT_ID.apps.googleusercontent.com",
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
