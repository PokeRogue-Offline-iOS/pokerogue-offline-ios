const fs = require('fs');
const path = require('path');

const version = process.env.APP_VERSION;
const buildNumber = process.env.BUILD_NUMBER;
const date = new Date().toISOString().split('T')[0];
const ipaSize = parseInt(process.env.IPA_SIZE || '0');
const tag = `${version}-${buildNumber}`;
const version2 = `${version}.${buildNumber}`;

const downloadURL = `https://github.com/PokeRogue-Offline-iOS/pokerogue-offline-ios/releases/download/v${tag}/PokeRogueOffline.ipa`;

if (!version || !buildNumber) {
  console.error('Missing APP_VERSION or BUILD_NUMBER');
  process.exit(1);
}

const sourcePath = path.join(__dirname, '../docs/repo.json');
console.log('load json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const newVersion = {
  version: version2,
  buildVersion: buildNumber,
  date: date,
  localizedDescription: `PokéRogue Offline ${version} — based on the latest PokéRogue main branch.`,
  downloadURL: downloadURL,
  size: ipaSize,
  minOSVersion: "15.0"
};

// Prepend new version to the front of the versions array
source.apps[0].versions.unshift(newVersion);

// Keep only the last 5 versions to avoid the file growing forever
source.apps[0].versions = source.apps[0].versions.slice(0, 5);

fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2));
console.log(`Updated source.json with version ${version} (build ${buildNumber})`);
