import { LOG_PATH } from "./constants";

const FLUSH_INTERVAL_MS = 250;
const MAX_PENDING_BYTES = 64 * 1024;
let pending = "";
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const ioStats = {
  syncWrites: 0,
  bytes: 0,
  totalMs: 0,
  maxMs: 0,
  flushes: 0,
  pendingBytes: 0,
};

function formatValue(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}\n${value.stack ?? ""}`.trim();
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function appendLog(level: "INFO" | "WARN" | "ERROR", ...values: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${values.map(formatValue).join(" ")}\n`;
  pending += line;
  ioStats.pendingBytes = pending.length;
  if (level !== "INFO" || pending.length >= MAX_PENDING_BYTES) {
    flushLog();
  } else if (flushTimer === null) {
    flushTimer = setTimeout(flushLog, FLUSH_INTERVAL_MS);
  }

  if (
    Boolean((globalThis as any).__SILVERSHADOW_SCREEN_CONTEXT_ACQUIRED__) &&
    level !== "ERROR"
  ) {
    return;
  }

  if (level === "ERROR") {
    console.error(...values);
  } else if (level === "WARN") {
    console.warn(...values);
  } else {
    console.log(...values);
  }
}

/** Flush the bounded log buffer at fatal, warning, exit, and periodic boundaries. */
export function flushLog(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!pending) return;
  const batch = pending;
  pending = "";
  ioStats.pendingBytes = 0;
  if (typeof Switch === "undefined" || typeof Switch.appendFileSync !== "function") return;
  const startedAt = performance.now();
  try {
    Switch.appendFileSync(LOG_PATH, batch);
    const elapsed = performance.now() - startedAt;
    ioStats.syncWrites++;
    ioStats.flushes++;
    ioStats.bytes += batch.length;
    ioStats.totalMs += elapsed;
    ioStats.maxMs = Math.max(ioStats.maxMs, elapsed);
  } catch (error) {
    console.error("Unable to write the SilverShadow log:", error);
  }
}

export function readLogIoStats(): Readonly<typeof ioStats> {
  return { ...ioStats, pendingBytes: pending.length };
}
