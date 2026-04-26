const fs = require('fs');

const filePath = 'pokerogue-src/locales/en/challenges.json';
let content = fs.readFileSync(filePath, 'utf8');

const anchor = `  "noneSelected": "None Selected",`;

if (!content.includes(anchor)) {
  console.warn('locales anchor not found — skipping');
  process.exit(1);
}
const injection = `  "randomize": {
    "name": "Randomizer Mode",
    "desc": "Randomizes the game in the following ways:\\n - All Pokemon get random abilities.\\n - Passive Abilities are not effected.\\n - All Pokemon get random types.\\n - Mono Type Pokemon have a 33% chance to get a random secondary type.\\nBoss Pokemon do not have their abilities randomized.",
    "value": {
      "0": "Off",
      "1": "On"
    }
  },`;
content = content.replace(anchor, anchor + "\n" + injection);



fs.writeFileSync(filePath, content);
console.log('Randomizer Locales successfully');
