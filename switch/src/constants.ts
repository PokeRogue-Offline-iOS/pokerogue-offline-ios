export const APP_ROOT = "sdmc:/switch/SilverShadow-PokeRogue";
export const GAME_ROOT = `${APP_ROOT}/game`;
export const MANIFEST_PATH = `${GAME_ROOT}/manifest.json`;
export const SAVES_ROOT = `${APP_ROOT}/saves`;
export const LOG_TIMESTAMP = new Date().toISOString().replace(/[-:.]/g, "");
export const LOG_FILE_NAME = `milestone2-${LOG_TIMESTAMP}.log`;
export const LOG_PATH = `${APP_ROOT}/logs/${LOG_FILE_NAME}`;
export const STORAGE_PATH = `${SAVES_ROOT}/local-storage.json`;
export const STORAGE_BACKUP_PATH = `${SAVES_ROOT}/local-storage.backup.json`;
export const STORAGE_TEMP_PATH = `${SAVES_ROOT}/local-storage.tmp.json`;

export const SWITCH_PLATFORM_VERSION = "0.3.0";
export const NXJS_VERSION = "1.0.0-beta.6";
export const PHASER_VERSION = "3.90.0";
export const MANIFEST_SCHEMA_VERSION = 2;

export const SCREEN_WIDTH = 1280;
export const SCREEN_HEIGHT = 720;
