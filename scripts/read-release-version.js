#!/usr/bin/env node

/** Print the one SilverShadow release version shared by every platform. */

const fs = require("fs");
const path = require("path");

const versionPath = path.join(__dirname, "..", "configs", "release-version.txt");
const version = fs.readFileSync(versionPath, "utf8").trim();

if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid SilverShadow release version in ${versionPath}: ${JSON.stringify(version)}`);
  process.exit(1);
}

process.stdout.write(version);
