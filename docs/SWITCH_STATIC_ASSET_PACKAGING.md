# Switch static-asset packaging

## Status

The indexed asset-pack layout and ranged-read compatibility fix have launched
on the tested Nintendo Switch OLED. The public 2.0.0 package remains Alpha and
needs broader long-session and hardware-configuration testing.

## Measured input

The pre-packaging `game/` tree contained:

- 34,111 files in 324 directories;
- 710,221,255 bytes;
- a 1,262-byte median file;
- 21,420 files below 4 KiB;
- 28,512 files below 16 KiB.

The largest logical groups were:

| Group | Files | Bytes |
| --- | ---: | ---: |
| `audio/` | 2,731 | 457,030,899 |
| `images/` | 28,581 | 165,761,998 |
| `assets/` compiled output and maps | 21 | 36,006,835 |
| `battle-anims/` | 924 | 25,110,359 |
| `locales/` | 1,824 | 10,076,427 |
| `switch-entry.js` | 1 | 8,850,425 |
| `fonts/` | 7 | 7,235,742 |

The complete old SD-card application layout had 34,116 files. The 2.0.0
layout has 15 files and 734,931,641 bytes, including the required license and
third-party-notice files. It removes filesystem-entry overhead and copy
latency rather than compressing already-compressed media.

## nx.js beta.6 RomFS finding

The exact installed packages were inspected:

- `@nx.js/runtime@1.0.0-beta.6`;
- `@nx.js/nro@1.0.0-beta.6`;
- `@tootallnate/romfs@0.1.1`, used by the NRO build tool.

The runtime typings expose `romfs:` reads only for the running application's
embedded RomFS. `Switch.FileSystem` can open BIS, SDMC, or a title filesystem;
there is no method to open or mount an arbitrary external `.romfs` image.
The NRO tool's RomFS dependency is a host-side encoder/decoder used while
building the NRO. It is not an application runtime mount API.

The runtime can mount the embedded RomFS of an NRO selected as a bootstrap
launch target, but that makes the target NRO the running application. It does
not provide multiple independent external RomFS mounts. Therefore beta.6 does
not support the requested external `.romfs` deployment model.

Embedding the 675 MiB-class static payload would enlarge every NRO update,
counter the external-payload design, and make code-only hardware iterations
expensive. It was rejected.

Beta.6 does expose ranged SD-card reads through `Switch.readFile()` /
`Switch.readFileSync()` `start` and `end` options, as well as
`Switch.FsFile.slice()`. The installed typings describe `end` as inclusive,
but the 2026-07-31 hardware log proved that beta.6 treats it as exclusive:
requesting `{ start: 0, end: 63 }` returned 63 rather than 64 header bytes.

The reader now probes `{ start: 0, end: 1 }` once. A one-byte result selects
exclusive semantics and a two-byte result selects inclusive semantics. Every
header, async asset, and synchronous font read uses that shared calibrated
range primitive. This prevents the same off-by-one failure across all packs
without upgrading or replacing the exact runtime pin.

## Selected format

Four uncompressed logical packs are generated in sorted path order:

| Pack | Contents | Files | Bytes |
| --- | --- | ---: | ---: |
| `assets-audio.sspack` | BGM, sound effects, cries, battle-animation audio, UI audio | 2,731 | 457,030,963 |
| `assets-graphics.sspack` | Pokémon sprites, UI, arenas, effects, events, videos, other images | 28,581 | 165,762,062 |
| `assets-animations.sspack` | Battle-animation JSON/data | 924 | 25,110,423 |
| `assets-support.sspack` | Fonts, bitmap-font data, locales, stable root JSON, logos, web manifest | 1,837 | 17,367,256 |

Each pack has a fixed 64-byte header followed by raw file bytes. No pack-level
compression is used. `asset-packs.json` maps each original logical asset path
to a pack number, byte offset, size, and SHA-256 digest. Original URLs remain
unchanged.

The loose deployment files are:

- `SilverShadow-PokeRogue.nro`;
- `SHA256SUMS.txt`;
- `game/manifest.json`;
- `game/version.json`;
- `game/index.html`;
- `game/switch-entry.js`;
- `game/asset-packs.json`;
- `licenses/Phaser-MIT.txt`;
- `licenses/PokeRogue-AGPL-3.0.txt`;
- `licenses/THIRD-PARTY-NOTICES.txt`;
- `licenses/nx.js-MIT.txt`.

The original Vite chunks and source maps are not deployed. The Switch already
uses the no-import consolidated `switch-entry.js`; retaining the redundant
graph would add files without serving runtime code. The source map remains a
host-side symbol artifact.

## Runtime behavior and validation

Startup:

1. validates the normal schema-2 manifest and hashes the loose required files;
2. parses `asset-packs.json`;
3. rejects unsafe paths, duplicate pack IDs, invalid counts, out-of-range or
   non-contiguous offsets, invalid hashes, missing packs, size mismatches, and
   header/index mismatches;
4. detects the beta.6 range-end convention and validates every pack header;
5. verifies all seven font/bitmap-font entries before game evaluation.

Asset reads:

1. retain the original game URL;
2. resolve it to the existing logical path under `game/`;
3. read only the indexed byte range from the applicable pack;
4. verify that entry's SHA-256 on first access;
5. return an ordinary `Response` to `fetch`, the fetch-backed XHR facade, and
   the nx.js `Image`, `Audio`, and `Video` loaders.

The largest resident JavaScript buffer is one requested asset, not an entire
pack. Fonts are verified sequentially at startup. Pack files stay on SD and
are never extracted.

Host verification hashes every complete pack, checks every indexed path
against the selected source inventory, and reads representative JSON, battle
animation, front/back/shiny/female sprites, BGM, sound effect, cry, font,
bitmap-font XML, and locale entries.

Pack generation is deterministic. A content-identical pack is hard-linked or
copied from the short build cache instead of being rewritten. A changed input
changes only its logical pack catalog hash and rebuilds only that pack.

## Migration

Copy the new uncompressed `switch/` tree to the SD-card root. Preserve:

- `/switch/SilverShadow-PokeRogue/saves/`;
- `/switch/SilverShadow-PokeRogue/config/`;
- `/switch/SilverShadow-PokeRogue/logs/`.

After the new files are safely copied, remove only these obsolete paths:

- `/switch/SilverShadow-PokeRogue/game/assets/`;
- `/switch/SilverShadow-PokeRogue/game/audio/`;
- `/switch/SilverShadow-PokeRogue/game/battle-anims/`;
- `/switch/SilverShadow-PokeRogue/game/fonts/`;
- `/switch/SilverShadow-PokeRogue/game/images/`;
- `/switch/SilverShadow-PokeRogue/game/locales/`;
- obsolete loose static root files in `game/` that are now indexed:
  `biome-bgm-loop-points.json`, `exp-sprites.json`, `logo128.png`,
  `logo512.png`, `manifest.webmanifest`, and `starter-colors.json`.

Do not remove the application directory, and do not use a wildcard or
recursive deletion at `SilverShadow-PokeRogue/` level.
