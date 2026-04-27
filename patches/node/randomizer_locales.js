#!/usr/bin/env node
const fs = require('fs');

const filePath = 'pokerogue-src/locales/en/challenges.json';
let content = fs.readFileSync(filePath, 'utf8');

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



fs.writeFileSync(filePath, content);
console.log('Randomizer Locales successfully');
