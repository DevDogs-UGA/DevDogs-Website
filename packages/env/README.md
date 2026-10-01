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

For a staging or production tier, `with-env` also sets `CLOUDFLARE_ENV` and
`NEXT_PUBLIC_DEPLOY_ENV` to that tier, so `DEPLOY_ENV=staging with-env vinext
build` needs nothing else. A value you set yourself (shell or env file) wins.

`with-env` also derives `CLOUDFLARE_ENV` and `NEXT_PUBLIC_DEPLOY_ENV` from
`DEPLOY_ENV` (an explicit value wins), and writes `.env.generated` from
`supabase status -o env` when the local stack is up and the file is missing or
older than `supabase/config.toml`. `--worker <app>` writes the app's Worker env
to a private temp file for the life of the command and replaces `{env-file}` in
the command with its path; previewing production asks first (`--yes` without a
terminal):

```jsonc
"start": "with-env --worker platform wrangler dev --config dist/server/wrangler.json --env-file {env-file}"
```

`buildWorkerEnv(app, env, "dev" | "deploy")` builds that env, and the one
`wrangler deploy --secrets-file` uploads, from the app's manifest.
