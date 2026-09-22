---
layout: section-divider
accent: cyan
kicker: 04 · In the DevDogs monorepo
---
# How the DevDogs monorepo uses Supabase

<!-- Presenter notes: Everything so far was your own personal Supabase project through the dashboard. Self-contained workshop ends here — this section connects it to the real DevDogsUGA codebase, so what you just learned maps onto how our own apps are actually built. -->

---
layout: statement
accent: cyan
---

# Different setup from tonight: the monorepo runs a **local, self-hosted Supabase in Docker**.

<!-- Presenter notes: Where tonight you clicked "New Project" on supabase.com, the monorepo boots its own Postgres + Supabase stack locally, through the repo's own CLI wrapper rather than raw `supabase` commands. -->

---
layout: terminal
accent: cyan
title: shell
---

```bash
pnpm devtools db start   # boots the local Docker Supabase stack
pnpm devtools db reset   # replays migrations, then seeds, regenerates types
pnpm dev --filter schedule-builder   # or study-group-finder, or platform
```

<!-- Presenter notes: `db start` is the Docker equivalent of provisioning a project in the dashboard. `db reset` is the local equivalent of running SQL by hand in the SQL Editor — it replays every migration, runs the seeds, and regenerates the TypeScript types the app imports. There's also `pnpm devtools db connect <project-ref>` if you'd rather point at a hosted project instead of Docker — same commands, same mental model either way. Verified against the monorepo's README and docs/monorepo/guides/quickstart.md. -->

---
layout: statement
accent: cyan
---

# Schema is defined with **Drizzle**, not hand-written SQL — migrations generate from it, and RLS policies live right next to the table.

<!-- Presenter notes: schedule-builder's schema lives at apps/schedule-builder/src/server/db/schema/schedule-builder.ts. Instead of writing `create table` and `create policy` by hand like we did tonight, the table shape and its RLS policy are both defined as TypeScript, and drizzle-kit generates the SQL migration from that. -->

---
layout: dual-code
accent: cyan
title: Same lesson, real repo pattern
leftLabel: Tonight (§6, SQL)
rightLabel: schedule-builder (Drizzle)
---

```sql
create table messages (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  body    text not null
);

alter table messages enable row level security;

create policy "insert your own"
  on messages for insert
  to authenticated
  with check (auth.uid() = user_id);
```

::right::

```ts
// schedule-builder/src/server/db/schema/schedule-builder.ts
export const userPreferences =
  scheduleBuilder.table("userPreferences", (d) => ({
    userId: d.uuid().primaryKey(),
    currentAcademicPeriod: d.integer(),
  }), (t) => [
    crudPolicy("users_own_prefs", t.userId),
  ]);

// policy.ts — crudPolicy(name, col) wraps:
//   pgPolicy(name, { for: "all", to: "authenticated",
//     using: sql`auth.uid() = ${col}` })
```

<!-- Presenter notes: Same rule from §6, `auth.uid() = user_id`, wrapped in a reusable `crudPolicy()` helper (apps/schedule-builder/src/server/db/policy.ts) so every user-owned table gets the same read/write-your-own-rows policy without retyping the SQL. `userPreferences` is a real, small table from the live schema — one row per signed-in user, keyed by their auth uid, exactly the pattern §5–6 taught. This pairing replaces the draft's original hook once verified live in the repo. -->

---
layout: statement
accent: cyan
---

# Auth is DevDogs' own **OAuth server** — `apps/platform` — the exact flow §8 just taught.

<!-- Presenter notes: The monorepo's sibling apps (schedule-builder, study-group-finder) sign in against apps/platform, the Next.js app behind the DevDogs site, console, docs, and OAuth server. It's the same authorization-code flow diagrammed in §8, issuing the same kind of Supabase session so auth.uid() resolves and RLS does its job — so what you practiced tonight generalizes directly to what the repo already does. Verified: docs/platform/index.md describes apps/platform as "the OAuth server sibling projects sign in against." -->

---
layout: statement
accent: cyan
---

<!-- HOOK: draft §12 flagged an open item here — capture the DevDogs OAuth provider's exact dashboard/config wiring (authorize/token URLs, client id issuance) once that source lands; not resolved by this verification pass, so kept as a placeholder rather than invented. -->

**HOOK:** exact DevDogs OAuth provider config (authorize/token URLs, client id issuance) — fill once the live-coding source lands.

<!-- Presenter notes: This is the one thing from draft §12 that repo verification alone couldn't resolve — the precise provider config lives in the live-coding source the original draft was waiting on, not in static docs. Keep this visible as a real hook rather than guessing at URLs. -->
