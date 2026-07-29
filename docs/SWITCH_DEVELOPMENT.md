# Switch development and debugging

## Prerequisites

- Node.js 24.9 or newer.
- npm 11 or newer.
- Git.

The published nx.js packages contain the prebuilt V8 runtime, so devkitPro is
not required for Milestone 1.

## Windows PowerShell

If PowerShell blocks `npm.ps1`, invoke `npm.cmd`:

```powershell
npm.cmd --prefix switch ci
npm.cmd --prefix switch run check
npm.cmd --prefix switch run package
npm.cmd --prefix switch run verify
```

The SD-card-ready ZIP is created at:

```text
switch/release/SilverShadow-PokeRogue-Switch-Milestone1.zip
```

## Linux, macOS, or WSL

```bash
npm --prefix switch ci
npm --prefix switch run check
npm --prefix switch run package
npm --prefix switch run verify
```

## Generated output

`npm run package`:

1. type-checks the nx.js/Phaser bootstrap;
2. bundles it to `switch/romfs/main.js`;
3. invokes `nxjs-nro --fat`;
4. generates the PNG, version, and manifest;
5. assembles the SD-card tree;
6. creates the ZIP;
7. verifies NRO magic, fat-package size, exact versions, and file hashes.

Clean generated output with:

```powershell
npm.cmd --prefix switch run clean
```

## Patch validation

From the repository root:

```bash
bash scripts/apply-patches.sh switch
```

This applies shared SilverShadow patches and the Switch layer to an existing
`pokerogue-src` checkout. It does not run mobile or Android patches.

## Hardware logs

The application appends to:

```text
sdmc:/switch/SilverShadow-PokeRogue/logs/milestone1.log
```

Delete only that log between controlled test runs if a clean trace is needed.
Do not delete `saves/`.

## Updating nx.js

Do not change the package pin because a newer beta exists. First inspect the
official release, issues, merged graphics fixes, and Phaser-related work. Then
run the complete Milestone 1 hardware test on the candidate version and update
the package lock, manifests, docs, and expected runtime check together.

Clone or compile nx.js only after a minimized reproduction proves that the
published runtime has a missing native API or native defect.
