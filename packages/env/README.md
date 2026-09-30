# @devdogsuga/env

The env-registry _machinery_: `declare()`/`define()` for building a manifest,
target/tier resolution (development/preflight/staging/production), the
`with-env` session loader, and a `@t3-oss/env-nextjs` re-export. It ships no
variables of its own — the registry of actual names and schemas (which app
needs `SUPABASE_URL`, which secret is production-only, …) is repo data and
lives in each consuming app's own `env.ts`, built out of this package's
`declare()`/`define()`.

A new variable is added to an app's `env.ts` — a `declare()` whose manifest maps
each name to `define(schema, meta)`. A consumer typically feeds that manifest
into `createEnv()` from the `./nextjs` subpath (a straight re-export of
`@t3-oss/env-nextjs`, so an app depends on this package instead of adding
`@t3-oss/env-nextjs` to its own package.json):

```ts
import { createEnv } from "@devdogsuga/env/nextjs";
import { declare, define } from "@devdogsuga/env";
```

The package also ships `with-env`, the bin most workspace scripts that need a
value at run time wrap their command in (`build`, `lint`, `typecheck` and
`test` are bare):

```jsonc
"dev": "with-env next dev",
"link-remote-project": "with-env -c 'supabase link --project-ref $PROJECT_REF'"
```

The `-c` form defers `$VAR` expansion until after the env files are loaded; use
the plain argv form otherwise.
