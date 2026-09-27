#!/usr/bin/env node
// A COMMITTED shim, and its existence at install time is the whole point.
// The bin used to point straight at ./dist/cli.js, which does not exist on a
// fresh checkout — and pnpm silently skips linking a bin whose target file is
// missing, so CI's first-ever run failed with a bare exit 127 ("docs-compiler:
// command not found") while every laptop with a stale dist/ worked fine.
// This file always exists, so the link always exists; by the time anything
// RUNS it, pnpm's dependency-order recursive build has compiled dist/.
//
// `docs-build.mjs` beside this file is the same shim under the package's old
// name, kept as a `bin` alias in package.json so a script or a contributor's
// muscle memory that still types `pnpm exec docs-build` keeps working.
import "../dist/cli.js";
