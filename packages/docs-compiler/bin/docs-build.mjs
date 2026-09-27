#!/usr/bin/env node
// The old name, kept as a `bin` alias (see docs-compiler.mjs) so an existing
// `pnpm exec docs-build` or CI step written before the docs-build ->
// docs-compiler rename does not break. Same committed-shim reasoning as that
// file: this always exists, so the link always exists.
import "../dist/cli.js";
