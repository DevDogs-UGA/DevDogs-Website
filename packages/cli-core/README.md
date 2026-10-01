# @devdogsuga/cli-core

The shared core of the published CLIs (`@devdogsuga/devtools`, and
`@devdogsuga/backstage` once it exists). **Private and never published.** Each
CLI inlines it with [tsdown](https://tsdown.dev), so it is only ever a
`workspace:*` devDependency, and its source is consumed directly (the
`exports` map points at `src/`).

It holds what both CLIs need and neither owns:

| Module                                   | What it is                                                      |
| ---------------------------------------- | --------------------------------------------------------------- |
| `repo/*`                                 | repo root discovery, `@devdogsuga/*` peer loading, tsx loading  |
| `ui`, `telemetry`, `version`, `pipes`    | clack helpers, Sentry bootstrap, own-version, EPIPE handling    |
| `tier`, `env-entry`, `env/discovery`     | the session tier, entering its env, the env manifest registry   |
| `db/run`, `db/connection`, `instance`    | running the Supabase CLI, resolving the session's database      |
| `args`, `invocation`                     | argv helpers, the "run it directly next time" recorder          |
| `catalog`, `help`, `menu`, `completions` | the command catalog and everything that walks it                |
| `dispatch`                               | the handler contract between a CLI's dispatcher and its domains |

## The rules

- **Nothing here imports from a CLI.** Where core needs something a CLI owns
  (starting the local stack from `env-entry`), the CLI injects it.
- **Third-party imports stay external.** The consuming CLI must declare every
  package this one imports in its own `dependencies`/`peerDependencies`; its
  build fails (`deps.onlyImport` in `tsdown.config.ts`) when it does not.
- **A CLI is a catalog plus handlers.** Each domain declares its commands in
  `<domain>/catalog.ts` (inert data) and owns its handlers in
  `<domain>/commands.ts`; the CLI composes the first into a `Catalog` with
  `createCatalog` and maps top-level names to the second in its `cli.ts`.
