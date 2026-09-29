import { build, context } from "esbuild";

/**
 * Bundles the extension to one CommonJS file. `vscode` is provided by the
 * host at runtime, so it stays external; everything else (node-diff3, the
 * core) is inlined, which is what lets `vsce package --no-dependencies` work.
 * Node 20 is what VS Code 1.93 ships.
 */
const options = {
  entryPoints: ["src/extension/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  minify: process.argv.includes("--minify"),
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
