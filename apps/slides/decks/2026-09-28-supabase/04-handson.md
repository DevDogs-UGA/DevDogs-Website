---
layout: section-divider
accent: emerald
kicker: "10 · Hands-on"
---

# Build a feature end-to-end

<!-- Let's tie it together. You'll work in your own Supabase project through the dashboard, creating a table with RLS, signing in through DevDogs' OAuth, and querying your own data. The self-contained example is a messages board — create the table, turn on policies, authenticate, then insert and list your own messages. Later we have track-specific extensions for those of you building on today's live-coding examples. -->

---
layout: statement
accent: emerald
---

# Create your table

<!-- In the Supabase dashboard, go to the SQL Editor and run the messages table schema. This is real SQL — the same thing you'd run on any Postgres server. Note the user_id foreign key; that's what RLS will use to enforce per-user access. -->

---
layout: terminal
accent: emerald
title: Supabase dashboard → SQL editor
---

```sql
create table messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id),
  body        text not null,
  created_at  timestamptz not null default now()
);
```

<!-- The table is created. The user_id field links each row to the authenticated user — RLS policies will use this to control who can read and write which rows. -->

---
layout: statement
accent: emerald
---

# Turn on Row Level Security

<!-- Now we lock the table down with RLS. By default, with an anon key (the public key you put in your app), nothing is allowed to read or write until a policy says so. -->

---
layout: terminal
accent: emerald
title: Supabase dashboard → SQL editor
---

```sql
alter table messages enable row level security;

create policy "read for authenticated"
  on messages for select
  to authenticated
  using (true);
```

<!-- The `using` clause filters which rows you can see. `auth.uid()` is your user ID from the session — Supabase fills it in after you sign in. -->

---
layout: terminal
accent: emerald
title: Supabase dashboard → SQL editor
---

```sql
create policy "insert your own"
  on messages for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "modify your own"
  on messages for update using (auth.uid() = user_id);
create policy "delete your own"
  on messages for delete using (auth.uid() = user_id);
```

<!-- `with check` validates rows you're writing; update/delete reuse `using` to restrict to your own rows. This is the pattern that protects all your data. -->

---
layout: dual-code
accent: emerald
title: Sign in with DevDogs
---

```ts
await supabase.auth.signInWithOAuth({
  provider: 'custom:devdogs',
  options: { redirectTo },
})
```

::right::

```dart
// HOOK: confirm Dart API for a custom provider — supabase_flutter's
// OAuthProvider is an enum; the custom:devdogs path is unconfirmed.
await supabase.auth.signInWithOAuth(
  /* custom:devdogs — confirm Dart API */,
  redirectTo: redirectTo,
);
```

<!-- Same call as §8 — because you already registered the DevDogs OAuth client and added the custom OIDC provider in your dashboard, your own GoTrue is the relying party and mints a native Supabase session. No manual code-exchange step: the client library handles the redirect callback for you. ⟨HOOK⟩ carried forward from the implementation plan (§9 "verify during implementation"): the Dart custom-provider path through supabase_flutter's OAuthProvider enum is unconfirmed — say so on stage. -->

---
layout: dual-code
accent: emerald
title: Get the current user
---

```ts
const { data: { user } } = await supabase.auth.getUser()
```

::right::

```dart
final user = supabase.auth.currentUser;
```

<!-- Once you're signed in, `auth.uid()` is set in your session, and RLS policies know who you are. -->

---
layout: dual-code
accent: emerald
title: Read and write messages
---

```ts
const { data: messages, error } = await supabase
  .from('messages')
  .select('*')
  .order('created_at', { ascending: false })

await supabase.from('messages').insert({ body: 'hello' })
```

::right::

```dart
final messages = await supabase
    .from('messages')
    .select()
    .order('created_at', ascending: false);

await supabase.from('messages').insert({'body': 'hello'});
```

<!-- You don't set user_id — Supabase reads it from your session. The insert policy checks that the user_id in your row matches your auth.uid(), so you can only create messages that belong to you. The read policy lets you see all messages (everyone sees the whole board), but you can only edit or delete your own. -->

---
layout: statement
accent: emerald
---

# ⟨HOOK⟩ Next.js track: extend today's schedule builder

<!-- Take the live example from this morning's Next.js workshop and wire it to Supabase the same way you just wired the messages board. Create a table for your data, set up the RLS policies, and wire the UI to sign in through DevDogs and query your data. -->

---
layout: statement
accent: emerald
---

# ⟨HOOK⟩ Flutter track: extend today's study-group finder

<!-- Same pattern: take the Flutter live example and add a Supabase backend. Create a table, enable RLS, sign in, and populate the UI with your own data. -->

---
layout: statement
accent: emerald
---

# [BREAK OUT INTO WORKSHOP GROUPS]

## Build. Reconvene for the wrap-up.

<!-- Everyone splits into their track's breakout area. You have about 45 minutes to build — create your table in the dashboard, enable RLS, sign in through the OAuth flow, and either complete the messages board or extend the live example from this morning. Instructors will circulate to help. We'll reconvene here at [time] for the dashboard tour and a look at how the real monorepo uses all this. -->

---
layout: section-divider
accent: emerald
kicker: "11 · Dashboard"
---

# Where things live

<!-- Everything you did tonight happened in the Supabase dashboard — no CLI, no containers. Here's the map of where to find each piece when you need it. -->

---
layout: default
accent: emerald
---

# Dashboard tour — reference

**Table Editor** — Create and inspect tables and rows visually. This is where you can browse the messages you inserted.

**SQL Editor** — Run the schema and RLS policies from the steps above (and any SQL you write).

**Authentication** — Users and sessions. This is where the DevDogs OAuth provider gets wired in (details below).

**Storage** — Buckets and files, with the same RLS permission rules as your tables (covered in §9).

**Settings → API** — Your **Project URL** and **anon key** (public, safe to ship in the client), plus the **service_role key** (admin, server-only, never shipped).

**Logs** — Request and auth events. When something isn't working, check here for error messages.

<!-- The dashboard is your command center for everything database, auth, and file-storage related. -->

---
layout: statement
accent: emerald
---

# ⟨HOOK⟩ DevDogs OAuth provider setup

<!-- Capture the exact provider configuration from the live example — the authorization URL, token endpoint, and how the server hands off to a Supabase session (OIDC id_token vs. code exchange). This goes in the dashboard's Auth settings. -->
