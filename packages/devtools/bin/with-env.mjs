#!/usr/bin/env node
// The `with-env` bin: loads a tier's env files around one command.
//
//   with-env [--tier <tier>] <command> [args...]
//   with-env -c '<shell command>'
//   with-env --worker <app> -- <command> [args...]
//
// It used to be `@devdogsuga/env`'s bin and ran TypeScript source through tsx;
// the env tooling moved into devtools, so it ships built like the other bin.
// tsx stays registered because `--worker` imports an app's TypeScript env
// manifest. A `node` shebang is what package-manager bin shims handle most
// reliably (notably the generated .cmd on Windows), and resolving tsx through
// this package's own dependencies avoids relying on it being on PATH.
import { register } from "tsx/esm/api";

register();
await import("../dist/with-env.js");
