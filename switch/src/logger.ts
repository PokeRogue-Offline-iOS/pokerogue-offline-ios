import { LOG_PATH } from "./constants";

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
  try {
    Switch.appendFileSync(LOG_PATH, line);
  } catch (error) {
    console.error("Unable to write the SilverShadow log:", error);
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
