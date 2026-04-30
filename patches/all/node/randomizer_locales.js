#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const TARGET = path.join('pokerogue-src', 'locales', 'en', 'challenges.json');
if (!fs.existsSync(TARGET)) {
  console.error(`ERROR: Could not find target file: ${TARGET}`);
  process.exit(1);
}
let content = fs.readFileSync(TARGET, "utf8").replace(/\r\n/g, "\n");

if (content.includes('"randomize"')) {
  console.log('Randomizer locale already present, skipping.');
  process.exit(0);
}

const anchor = `  "noneSelected": "None Selected",`;

if (!content.includes(anchor)) {
  console.error('locales anchor not found — skipping');
  process.exit(1);
}
const injection = `  "randomize": {
    "name": "Randomizer Mode",
    "desc": "Randomizes the following:\\n- All Pokemon abilities.\\n- All Pokemon types\\n- Mono Type Pokemon may have a secondary type.\\nPassives and Boss abilites are unaffected.",
    "value": {
      "0": "Off",
      "1": "On"
    }
  },`;
content = content.replace(anchor, anchor + "\n" + injection);



fs.writeFileSync(TARGET, content);
console.log('Randomizer Locales successfully');
