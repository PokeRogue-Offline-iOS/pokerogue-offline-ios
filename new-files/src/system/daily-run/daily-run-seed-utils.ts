export const OFFLINE_DAILY_ALGORITHM_VERSION = "SilverShadow-Daily-v1";
export const RANDOM_DAILY_ALGORITHM_VERSION = "SilverShadow-Random50-v1";
export const CUSTOM_TEXT_ALGORITHM_VERSION = "SilverShadow-CustomSeed-v1";

let randomSeedCounter = 0;

export function getUtcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

/** Small dependency-free SHA-256 so every supported runtime follows exactly the same path. */
export function sha256(input: Uint8Array): Uint8Array {
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const data = new Uint8Array(paddedLength);
  data.set(input);
  data[input.length] = 0x80;
  const view = new DataView(data.buffer);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  view.setUint32(paddedLength - 8, high, false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index++) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    const state = Array.from(hash);
    for (let index = 0; index < 64; index++) {
      const s1 = rotateRight(state[4], 6) ^ rotateRight(state[4], 11) ^ rotateRight(state[4], 25);
      const choose = (state[4] & state[5]) ^ (~state[4] & state[6]);
      const temp1 = (state[7] + s1 + choose + constants[index] + words[index]) >>> 0;
      const s0 = rotateRight(state[0], 2) ^ rotateRight(state[0], 13) ^ rotateRight(state[0], 22);
      const majority = (state[0] & state[1]) ^ (state[0] & state[2]) ^ (state[1] & state[2]);
      const temp2 = (s0 + majority) >>> 0;
      state[7] = state[6];
      state[6] = state[5];
      state[5] = state[4];
      state[4] = (state[3] + temp1) >>> 0;
      state[3] = state[2];
      state[2] = state[1];
      state[1] = state[0];
      state[0] = (temp1 + temp2) >>> 0;
    }
    for (let index = 0; index < hash.length; index++) {
      hash[index] = (hash[index] + state[index]) >>> 0;
    }
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  hash.forEach((value, index) => digestView.setUint32(index * 4, value, false));
  return digest;
}

export function bytesToStandardBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = hasB ? bytes[index + 1] : 0;
    const c = hasC ? bytes[index + 2] : 0;
    output += alphabet[a >>> 2];
    output += alphabet[((a & 3) << 4) | (b >>> 4)];
    output += hasB ? alphabet[((b & 15) << 2) | (c >>> 6)] : "=";
    output += hasC ? alphabet[c & 63] : "=";
  }
  return output;
}

export function canonicalSeedFromText(sourceMaterial: string): string {
  const digest = sha256(new TextEncoder().encode(sourceMaterial));
  return bytesToStandardBase64(digest.slice(0, 16));
}

export function createOfflineDailySeed(date = new Date()): string {
  return canonicalSeedFromText(`${OFFLINE_DAILY_ALGORITHM_VERSION}|${getUtcDateKey(date)}`);
}

export function createCustomTextSeed(text: string): { canonicalSeed: string; friendlyText: string } {
  const friendlyText = text.trim();
  if (!friendlyText) {
    throw new Error("Text Seed cannot be empty.");
  }
  return {
    canonicalSeed: canonicalSeedFromText(`${CUSTOM_TEXT_ALGORITHM_VERSION}|${friendlyText}`),
    friendlyText,
  };
}

function secureRandomHex(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  }
  const highResolution = typeof performance !== "undefined" && Number.isFinite(performance.now())
    ? performance.now().toString(36)
    : "no-performance-clock";
  return `fallback-${highResolution}`;
}

export function createRandomDailySeed(now = new Date()): string {
  randomSeedCounter = (randomSeedCounter + 1) >>> 0;
  const source = `${RANDOM_DAILY_ALGORITHM_VERSION}|${now.toISOString()}|${secureRandomHex()}|${randomSeedCounter}`;
  return canonicalSeedFromText(source);
}

export function normalizeAndValidateExactSeed(input: string): string {
  const seed = input.trim();
  if (!/^[A-Za-z0-9+/]{22}==$/.test(seed)) {
    throw new Error("Enter a 24-character standard Base64 seed ending in ==.");
  }
  return seed;
}

export function isInvisibleControlCharacter(value: string): boolean {
  return /[\u0000-\u001f\u007f-\u009f\r\n]/u.test(value);
}
