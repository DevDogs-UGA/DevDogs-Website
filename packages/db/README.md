# @devdogsuga/db

Supabase client factories and the Drizzle/postgres-js client factory, merged
into one published package. Migrated from DevDogsUGA's `packages/supabase`
and `packages/drizzle`.

Nothing here ships repo data: no generated `Database` type, no app→schema
map, no migrations. Every client is generic over a `Database` type the
consumer supplies from its own generated `database.types.ts`.

## `@devdogsuga/db/client`

Browser-safe Supabase client factories, scoped to one Postgres schema at
construction:

```ts
import { createBrowserClient } from "@devdogsuga/db/client";
import type { Database } from "~/supabase/database.types";

const supabase = createBrowserClient<Database, "platform">({
  url,
  key,
  schema: "platform",
});
```

`createServerClient` takes the same options plus a `cookies` adapter, for
RSC / Route Handlers / Server Actions.

## `@devdogsuga/db/server`

Server-only. The module's first line is `import "server-only"`, so an
accidental browser import of this subpath fails at build rather than leaking
a service key at runtime.

Under plain Vitest, that guard throws on import: `server-only` only turns
into a no-op when a Next.js server bundle aliases it. A consumer testing code
that reaches this subpath needs both of these in its Vitest config:

- `resolve.alias["server-only"]` pointing at an empty stub module.
- `test.server.deps.inline: [/@devdogsuga\/db/]`. Without it Vitest hands
  this package to Node's native `import()`, which resolves the real
  `server-only` before the alias is ever consulted.

- `createAdminClient` — the service-role Supabase client. Bypasses RLS.
- `createDb` — the shared postgres-js + Drizzle client factory:

```ts
import { createDb } from "@devdogsuga/db/server";

export const db = createDb(env.DB_URL, relations);
```

`drizzle-orm` and `postgres` are **peer dependencies**, not bundled deps: the
consumer's own pinned versions are what actually run, matching the source
package's contract.

## `@devdogsuga/db/typegen`

The machinery that generates a `Database` type from a live connection —
`generateDatabaseTypes({ dbUrl, outFile, cwd })` runs `supabase gen types`
via `pnpm exec` (so the consumer's lockfile-pinned CLI version runs, not a
bundled copy) and writes the result to `outFile`, formatting it with
`pnpm exec prettier` by default. It writes no file of its own — the consumer
decides where its `database.types.ts` lives.

## What didn't move

- `database.types.ts` — generated repo data. Regenerate it into the consumer
  repo with `@devdogsuga/db/typegen`.
- `SCHEMAS` / `AppKey` / `SchemaName` (the product repo's `schemas.ts`) — the
  app→Postgres-schema map is DevDogsUGA's own data, not framework. It stays
  in DevDogsUGA and can import `DatabaseSchema<Database>` from
  `@devdogsuga/db/client` to key its own map's values.
- The RLS persona test suite (`packages/supabase/testing/**`) — exercises
  DevDogsUGA's actual business schema (`profile`, `reports`, moderation
  policy, attendance, …), not this package's own code. See
  `vitest.rls.config.ts` for the cutover note.
