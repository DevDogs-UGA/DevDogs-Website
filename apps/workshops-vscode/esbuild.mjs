import { build, context } from "esbuild";

/**
 * Bundles the extension to one CommonJS file. `vscode` is provided by the
 * host at runtime, so it stays external; everything else (node-diff3, the
 * core) is inlined, which is what lets `vsce package --no-dependencies` work.
 * Node 20 is what VS Code 1.93 ships.
 */
// The Sentry DSN, baked in at publish from WORKSHOPS_VSCODE_SENTRY_DSN (an
// Actions variable, like devtools' DEVTOOLS_SENTRY_DSN). Unset, as in every
// local and CI build, it is "" and the extension reports nothing.
const dsn = process.env.WORKSHOPS_VSCODE_SENTRY_DSN ?? "";
if (dsn && !URL.canParse(dsn)) {
  console.error("WORKSHOPS_VSCODE_SENTRY_DSN is set but is not a URL.");
  process.exit(1);
}

const options = {
  define: { __WORKSHOPS_SENTRY_DSN__: JSON.stringify(dsn) },
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

if (process.argv.includes("--tests")) {
  // The real-VS Code smoke test: the runner (plain Node) and the suite that
  // runs inside the editor. Not part of the .vsix.
  await build({
    ...options,
    entryPoints: {
      run: "src/vscode-test/run.ts",
      suite: "src/vscode-test/suite.ts",
    },
    outdir: "dist-test",
    outfile: undefined,
    sourcemap: true,
    minify: false,
  });
} else if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
