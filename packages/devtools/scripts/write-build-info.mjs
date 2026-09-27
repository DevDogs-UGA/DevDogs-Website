#!/usr/bin/env node
// Runs after `tsc` (see package.json `build`). Bakes build-time settings into
// dist/build-info.json, which ships in the tarball and src/telemetry.ts reads
// at run time. Today that is only the Sentry DSN: publish.yaml passes the
// Backstage repo's DEVTOOLS_SENTRY_DSN Actions variable, so published builds
// report and every other build (CI, `pnpm pack:local`, a fork) bakes "" and
// stays silent.
import { writeFileSync } from "node:fs";

const sentryDsn = process.env.DEVTOOLS_SENTRY_DSN ?? "";
if (sentryDsn && !URL.canParse(sentryDsn)) {
  console.error(
    "write-build-info: DEVTOOLS_SENTRY_DSN is set but is not a URL.",
  );
  process.exit(1);
}

writeFileSync(
  new URL("../dist/build-info.json", import.meta.url),
  `${JSON.stringify({ sentryDsn }, null, 2)}\n`,
);
