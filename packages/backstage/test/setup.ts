import { fileURLToPath } from "node:url";
import { overrideOwnPackageDir } from "@devdogsuga/cli-core/version";

// Source runs inline nothing, so the core would take its own package.json for
// "this CLI's root"; point it at backstage's, where `env.ts` lives.
overrideOwnPackageDir(fileURLToPath(new URL("..", import.meta.url)));
