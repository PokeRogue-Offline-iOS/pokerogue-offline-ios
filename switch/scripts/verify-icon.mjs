import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const iconPath = fileURLToPath(new URL("../icon.jpg", import.meta.url));
const icon = await readFile(iconPath);

if (icon.length < 4 || icon[0] !== 0xff || icon[1] !== 0xd8 || icon.at(-2) !== 0xff || icon.at(-1) !== 0xd9) {
  throw new Error("switch/icon.jpg must be a valid JPEG for the Homebrew Menu NRO icon.");
}

const { width, height } = readJpegDimensions(icon);
if (width !== 256 || height !== 256) {
  throw new Error(`switch/icon.jpg must be 256x256 pixels; found ${width}x${height}.`);
}

console.log(`Verified Homebrew Menu icon: ${width}x${height}, ${icon.length} bytes`);

function readJpegDimensions(buffer) {
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;

    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  throw new Error("switch/icon.jpg does not contain readable JPEG dimensions.");
}
