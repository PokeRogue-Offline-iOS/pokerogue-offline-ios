import { SAVES_ROOT, STORAGE_BACKUP_PATH, STORAGE_PATH, STORAGE_TEMP_PATH } from "./constants";
import { appendLog } from "./logger";

interface StorageDocument {
  schemaVersion: 1;
  values: Record<string, string>;
}

function readDocument(path: string): StorageDocument | null {
  const data = Switch.readFileSync(path);
  if (data === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(data)) as StorageDocument;
    if (parsed.schemaVersion !== 1 || !parsed.values || typeof parsed.values !== "object") {
      throw new Error("unsupported storage schema");
    }
    for (const value of Object.values(parsed.values)) {
      if (typeof value !== "string") {
        throw new Error("storage contains a non-string value");
      }
    }
    return parsed;
  } catch (error) {
    appendLog("WARN", "Could not read storage document", { path, error: String(error) });
    return null;
  }
}

export function installPersistentStorage(): void {
  Switch.mkdirSync(SAVES_ROOT);
  const primary = readDocument(STORAGE_PATH);
  const backup = readDocument(STORAGE_BACKUP_PATH);
  const values: Record<string, string> = { ...(primary ?? backup ?? { values: {} }).values };

  const persist = (): void => {
    const document: StorageDocument = { schemaVersion: 1, values };
    const encoded = `${JSON.stringify(document, null, 2)}\n`;
    Switch.writeFileSync(STORAGE_TEMP_PATH, encoded);
    if (Switch.statSync(STORAGE_PATH)) {
      if (Switch.statSync(STORAGE_BACKUP_PATH)) {
        Switch.removeSync(STORAGE_BACKUP_PATH);
      }
      Switch.renameSync(STORAGE_PATH, STORAGE_BACKUP_PATH);
    }
    Switch.renameSync(STORAGE_TEMP_PATH, STORAGE_PATH);
  };

  const methods = {
    get length(): number {
      return Object.keys(values).length;
    },
    key(index: number): string | null {
      return Object.keys(values)[index] ?? null;
    },
    getItem(key: string): string | null {
      return Object.hasOwn(values, String(key)) ? values[String(key)] : null;
    },
    setItem(key: string, value: string): void {
      values[String(key)] = String(value);
      persist();
    },
    removeItem(key: string): void {
      if (Object.hasOwn(values, String(key))) {
        delete values[String(key)];
        persist();
      }
    },
    clear(): void {
      for (const key of Object.keys(values)) {
        delete values[key];
      }
      persist();
    },
  };

  const storage = new Proxy(methods as Storage, {
    get(target, property, receiver) {
      if (typeof property === "string" && Object.hasOwn(values, property)) {
        return values[property];
      }
      return Reflect.get(target, property, receiver);
    },
    set(_target, property, value) {
      if (typeof property === "string") {
        values[property] = String(value);
        persist();
        return true;
      }
      return false;
    },
    deleteProperty(_target, property) {
      if (typeof property === "string" && Object.hasOwn(values, property)) {
        delete values[property];
        persist();
      }
      return true;
    },
    has(target, property) {
      return (typeof property === "string" && Object.hasOwn(values, property)) || Reflect.has(target, property);
    },
    ownKeys() {
      return [...Reflect.ownKeys(methods), ...Object.keys(values)];
    },
    getOwnPropertyDescriptor(target, property) {
      if (typeof property === "string" && Object.hasOwn(values, property)) {
        return { configurable: true, enumerable: true, writable: true, value: values[property] };
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    enumerable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    enumerable: true,
    value: createMemoryStorage(),
  });
  appendLog("INFO", "Persistent localStorage installed", {
    path: STORAGE_PATH,
    recoveredFromBackup: !primary && Boolean(backup),
    keys: Object.keys(values).length,
  });
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(String(key)) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(String(key));
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
  };
}
