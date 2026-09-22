---
layout: section-divider
accent: emerald
kicker: "02 · Build against it"
---

# Create your project & connect

<!--
Transition beat: from here on we're in each contributor's own dashboard.
No CLI, nothing to install — every contributor spins up their own
Supabase project.
-->

---
layout: default
accent: emerald
---

# Create your project

**Each of you creates your own Supabase project** from the dashboard — no CLI, nothing to install.

1. In the dashboard, **New Project** → name it, set a database password, pick a region.
2. Wait for it to provision (~1–2 min).
3. **Settings → API** gives you the two values your app needs:
   - **Project URL**
   - **anon (public) key** — safe to ship in a client; RLS is what actually protects data

<!--
Walk the room through the New Project flow live if anyone's behind —
provisioning takes a minute or two, good spot for questions.

HOOK: dashboard URL — if we're on a DevDogs-hosted dashboard rather than
supabase.com, the login URL and Project URL format differ; drop the exact
dashboard link here once known.
-->

<!-- ⟨HOOK: DASHBOARD_URL⟩ — exact dashboard login/host, see notes above. -->

---
layout: dual-code
accent: emerald
title: "Put them in env, never hard-code"
leftLabel: Next.js
rightLabel: Flutter
---

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

::right::

```bash
# pass at run time (--dart-define) or a config file
flutter run \
  --dart-define=SUPABASE_URL=https://<your-project>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon-key>
```

<!--
Both platforms need the same two values from Settings → API: Project URL
and the anon (public) key. The anon key is safe to ship client-side —
RLS (next section) is what actually protects data, not key secrecy.
-->

---
layout: default
accent: emerald
---

# Tables & data

In your project's dashboard, model a small table two ways — the visual **Table Editor** and the **SQL Editor** — to show they're the same thing.

Running example for the teaching sections: a `messages` table.

<!--
Have folks try both: click through Table Editor first, then show the SQL
Editor produces/accepts the identical schema. Reinforces "it's just
Postgres."
-->

---
layout: terminal
accent: emerald
title: supabase dashboard → SQL editor
---

```sql
create table messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id),
  body        text not null,
  created_at  timestamptz not null default now()
);
```

<!--
Point out: user_id references the authenticated user — that's the hook
RLS uses next. Keep this table on screen; it's the running example for
the rest of the teaching sections.
-->

---
layout: section-divider
accent: emerald
kicker: "02 · Build against it"
---

# Row Level Security

<!--
This is the anchor of the whole workshop. Slow down here. Everything
before this point was "just Postgres" — this is the part that's
Supabase-specific and the part everyone trips on.
-->

---
layout: statement
accent: emerald
---

# With RLS on, a table is locked by default.

The anon key can read/write **nothing** until a policy says otherwise.

<!--
The one thing people trip on. A policy is a SQL rule evaluated per row.
auth.uid() is the current user's id from their session — that's the hook
every policy below uses.
-->

---
layout: terminal
accent: emerald
title: supabase dashboard → SQL editor
---

```sql {1-2|4-8}
-- Turn it on
alter table messages enable row level security;

-- Anyone signed in can read every message
create policy "read for authenticated"
  on messages for select
  to authenticated
  using (true);
```

<!--
Walk it line by line with the highlight steps: (1) turn RLS on — table is
now locked; (2) the read policy — `using (true)` means every authenticated
user can see every row.

Mental model to say out loud: `using` filters which rows you can see/act
on; `with check` validates rows you're writing.
-->

---
layout: terminal
accent: emerald
title: supabase dashboard → SQL editor
---

```sql {1-4|6-7}
-- You can only insert rows that belong to you
create policy "insert your own"
  on messages for insert
  to authenticated
  with check (auth.uid() = user_id);

-- You can only edit/delete your own rows
create policy "modify your own"
  on messages for update using (auth.uid() = user_id);
create policy "delete your own"
  on messages for delete using (auth.uid() = user_id);
```

<!--
Continuing the walk: (3) the insert policy — `with check` validates the
row being written, not an existing one; (4) update/delete reuse `using`
to restrict to the caller's own rows.
-->

---
layout: statement
accent: emerald
---

# An open table with a public key is a public table.

<!--
Forgetting RLS is the #1 Supabase security mistake. The anon key is
public by design — it ships in the client bundle. RLS is the only thing
standing between "public key" and "public data." Let this land before
moving on; it's the single most important idea in the workshop.
-->
