#!/usr/bin/env node
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OFFICIAL_DAILY_ARCHIVE_URL, serializeDailyArchive, validateDailyArchive } from "./daily-run-archive-core.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
export const checkedInFallbackPath = path.join(repositoryRoot, "assets", "daily-seeds-fallback.json");
export const generatedArchivePath = path.join(repositoryRoot, "work", "generated", "daily-seeds.json");

async function readValidArchive(filePath) {
  return validateDailyArchive(await readFile(filePath, "utf8"));
}

async function writeAtomic(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, contents, "utf8");
  validateDailyArchive(await readFile(temporaryPath, "utf8"));
  await rm(filePath, { force: true });
  await rename(temporaryPath, filePath);
}

export async function synchronizeDailyArchive({
  fetchImpl = globalThis.fetch,
  offline = false,
  fallbackPath = checkedInFallbackPath,
  outputPath = generatedArchivePath,
} = {}) {
  let downloaded;
  let downloadError;
  if (!offline) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetchImpl(`${OFFICIAL_DAILY_ARCHIVE_URL}?t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      if ((response.headers.get("content-type") ?? "").includes("text/html") || /^\s*<!doctype html/i.test(text)) {
        throw new Error("received HTML instead of JSON");
      }
      downloaded = validateDailyArchive(text);
    } catch (error) {
      downloadError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (downloaded) {
    await writeAtomic(outputPath, serializeDailyArchive(downloaded));
    console.log(`Daily archive synchronized: ${downloaded.entryCount} entries through ${downloaded.latestDate}.`);
    return { source: "downloaded", archive: downloaded, path: outputPath };
  }

  let fallback;
  try {
    fallback = await readValidArchive(fallbackPath);
  } catch (fallbackError) {
    throw new Error("No valid downloaded or checked-in Daily archive is available for this build.", {
      cause: { downloadError, fallbackError },
    });
  }
  await writeAtomic(outputPath, serializeDailyArchive(fallback));
  console.warn(
    `WARNING: Using checked-in Daily archive snapshot through ${fallback.latestDate}; refresh failed: ${downloadError ?? "offline build"}`,
  );
  return { source: "checked-in", archive: fallback, path: outputPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await synchronizeDailyArchive({ offline: process.argv.includes("--offline") });
}
