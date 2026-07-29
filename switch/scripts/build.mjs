import { build } from "esbuild";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = path.join(projectRoot, "src");
const phaserEntry = path.join(projectRoot, "node_modules", "phaser", "dist", "phaser.esm.js");
const mainSource = path.join(sourceRoot, "main.ts");

// Supplying file contents through a plugin keeps the build reproducible in
// restricted desktop sandboxes whose native esbuild process cannot enumerate
// parent directories. Normal CI builds use the same code path.
const sandboxFileLoader = {
  name: "sandbox-file-loader",
  setup(context) {
    context.onResolve({ filter: /^phaser$/ }, () => ({
      path: phaserEntry,
      namespace: "sandbox-file",
    }));
    context.onResolve({ filter: /^\.\.?\// }, async args => ({
      path: await resolveLocal(args.resolveDir, args.path),
      namespace: "sandbox-file",
    }));
    context.onLoad({ filter: /.*/, namespace: "sandbox-file" }, async args => ({
      contents: await readFile(args.path, "utf8"),
      loader: loaderFor(args.path),
      resolveDir: path.dirname(args.path),
    }));
  },
};

await build({
  stdin: {
    contents: await readFile(mainSource, "utf8"),
    sourcefile: "src/main.ts",
    resolveDir: sourceRoot,
    loader: "ts",
  },
  bundle: true,
  sourcemap: true,
  sourcesContent: false,
  target: "es2022",
  format: "esm",
  outfile: path.join(projectRoot, "romfs", "main.js"),
  plugins: [sandboxFileLoader],
  logLevel: "info",
});

async function resolveLocal(resolveDir, specifier) {
  const candidate = path.resolve(resolveDir, specifier);
  const extensions = path.extname(candidate) ? [""] : [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"];
  for (const extension of extensions) {
    const resolved = `${candidate}${extension}`;
    try {
      const info = await stat(resolved);
      if (info.isFile()) {
        return resolved;
      }
    } catch {
      // Try the next supported extension.
    }
  }
  throw new Error(`Unable to resolve local module ${specifier} from ${resolveDir}`);
}

function loaderFor(file) {
  switch (path.extname(file)) {
    case ".ts":
      return "ts";
    case ".tsx":
      return "tsx";
    case ".json":
      return "json";
    default:
      return "js";
  }
}
