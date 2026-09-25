---
layout: section-divider
accent: emerald
kicker: "02 · Live demo"
chip: LIVE DEMO
---

# Build it live

<!-- Presenter notes: Sloan is back at the podium. Shruti's concepts map onto real code now — two laptops, one Supabase project, projected side by side. If Sloan is presenting alone, type the web (Next.js) side live and jump the Flutter laptop to each tag as we go. -->

---
layout: terminal
accent: emerald
chip: CLONE
titlebar: clone + switch
---

<Track web>

```bash
git clone https://github.com/DevDogsUGA/web-workshops.git
cd web-workshops
git switch 01-nextjs-introduction
```

</Track>
<Track mobile>

```bash
git clone https://github.com/DevDogsUGA/mobile-workshops.git
cd mobile-workshops
git switch 01-flutter-introduction
```

</Track>

<!-- Presenter notes: Everyone already has this from Setup Night — this is just the Supabase branch point. Both branches are "what you built, plus the guestbook we didn't get to." -->

---
layout: bullets-card
accent: emerald
chip: SETUP
cardTitle: One-click
---

# Project setup

- Create a Supabase project — dashboard, takes about a minute
- Copy the **publishable** key (Project Settings → API)
- Drop the URL + key into `.env.local` (web) or `demo.env` (mobile)

::card::

```bash
pnpm dlx @devdogsuga/devtools oauth
```

Registers "Sign in with DevDogs" as an OAuth provider on your project —
one command instead of the manual dashboard steps.

<!-- Presenter notes: Walk through creating a project live, then run devtools oauth on both laptops. This is the part most likely to eat time — budget for it, and a lead can drive if the room lags. -->

---
layout: statement
accent: emerald
chip: STEP 1
---

# Read the guestbook

<!-- Presenter notes: First step — swap the in-memory array for a real Supabase table, read-only. Demo tag: demo/01-read. Recovery: `git switch --detach --discard-changes demo/01-read`. -->

---
layout: terminal
accent: emerald
chip: SQL
file: supabase/migrations/20260928000000_guestbook.sql
---

```sql
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name text not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "messages are readable by everyone"
  on public.messages
  for select
  to anon, authenticated
  using (true);
```

<!-- Presenter notes: Paste this into the dashboard's SQL editor on both laptops (shared project, so one paste covers everyone). Everyone can read — no sign-in required yet. -->

---
layout: dual-code
accent: emerald
chip: CODE
heading: From in-memory to Supabase
leftFile: components/Guestbook.tsx
rightFile: lib/guestbook.dart
---

````md magic-move [@11,@15] {lines: true}
```ts {12}
export default function Guestbook() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
```
```ts {15-24}
  const [messages, setMessages] = useState<Message[]>([]);

  // Load the guestbook, newest first, once on mount.
  useEffect(() => {
    supabase
      .from("messages")
      .select("id, user_id, author_name, body, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setMessages(data ?? []));
  }, []);
```
````

::right::

````md magic-move [@26,@17] {lines: true}
```dart {28}
  // Newest entries are added to the front of the list, so the list itself is
  // always in "newest first" order.
  final List<GuestbookEntry> _entries = [];
```
```dart {17-32}
  @override
  void initState() {
    super.initState();
    _loadMessages();
  }

  // Load the guestbook, newest first.
  Future<void> _loadMessages() async {
    try {
      final rows = await _supabase
          .from('messages')
          .select('id, user_id, author_name, body, created_at')
          .order('created_at', ascending: false);
      if (mounted) {
        setState(() => _messages = List<Map<String, dynamic>>.from(rows));
      }
```
````

<!-- Presenter notes: Magic Move animates useState (in-memory) into the Supabase query. Demo tag: demo/01-read. Recovery: `git switch --detach --discard-changes demo/01-read`. -->

---
layout: statement
accent: emerald
chip: STEP 2
---

# Sign in with DevDogs

<!-- Presenter notes: No SQL this step — it's all client-side against the OAuth provider we just registered. Demo tag: demo/02-sign-in. Recovery: `git switch --detach --discard-changes demo/02-sign-in`. -->

---
layout: dual-code
accent: emerald
chip: CODE
heading: Sign in / sign out
leftFile: components/Guestbook.tsx
rightFile: lib/guestbook.dart
---

```ts {40|41-44|39-46}{lines:true,startLine:37}
  }, []);

  function signIn() {
    supabase.auth.signInWithOAuth({
      // auth-js's Provider type only lists Supabase's built-in providers, so
      // a custom OIDC provider like ours needs a cast to satisfy it.
      provider: "custom:devdogsuga" as never,
      options: { redirectTo: window.location.origin + "/guestbook" },
    });
  }

  function signOut() {
    supabase.auth.signOut();
  }
```

::right::

```dart {56-57|55-60}{lines:true,startLine:51}
      debugPrint('Could not load the guestbook: $error');
    }
  }

  Future<void> _signIn() {
    return _supabase.auth.signInWithOAuth(
      OAuthProvider('custom:devdogsuga'),
      redirectTo: _redirectTo,
    );
  }

  Future<void> _signOut() => _supabase.auth.signOut();
```

<!-- Presenter notes: Because the contributor's own GoTrue is the relying party, sign-in mints a native session in auth.users -- auth.uid() just works with the RLS policies coming up. Flutter's OAuthProvider is a real class here (gotrue Dart >= 2.20), so no cast needed on that side. -->

---
layout: statement
accent: emerald
chip: STEP 3
---

# Let signed-in users post

<!-- Presenter notes: Demo tag: demo/03-insert-naive. Recovery: `git switch --detach --discard-changes demo/03-insert-naive`. -->

---
layout: terminal
accent: emerald
chip: SQL
titlebar: supabase dashboard → SQL editor
---

```sql
create policy "authenticated users can insert their own messages"
  on public.messages
  for insert
  to authenticated
  with check (auth.uid() = user_id);
```

<!-- Presenter notes: auth.uid() = user_id is the whole guard -- Postgres itself refuses an insert claiming someone else's id. -->

---
layout: dual-code
accent: emerald
chip: CODE
heading: Naive insert — client sends its own name
leftFile: components/Guestbook.tsx
rightFile: lib/guestbook.dart
---

```ts {59-65|67-71}{lines:true,startLine:57}
    }

    // Naive version: we trust the client to tell us its own display name.
    // (Step 4 of the workshop replaces this with a server-side lookup.)
    const authorName =
      session.user.user_metadata.name ??
      session.user.user_metadata.full_name ??
      session.user.email ??
      "Anonymous";

    const { data, error } = await supabase
      .from("messages")
      .insert({ body: body.trim(), author_name: authorName })
      .select("id, user_id, author_name, body, created_at")
      .single();
```

::right::

```dart {79-83|85-88}{lines:true,startLine:77}
    }

    // Naive version: we trust the client to tell us its own display name.
    // (The next commit replaces this with a server-side lookup.)
    final metadata = session.user.userMetadata ?? {};
    final authorName =
        metadata['name'] ?? metadata['full_name'] ?? session.user.email ?? 'Anonymous';

    await _supabase.from('messages').insert({
      'body': body,
      'author_name': authorName,
    });

    _bodyController.clear();
```

<!-- Presenter notes: Highlight the authorName lookup -- it reads straight off the client's own session data, which the client fully controls. -->

---
layout: statement
accent: emerald
chip: WEB ONLY
---

# What's wrong with this?

<Track web>

Open devtools, edit the outgoing request, post as someone else's name.

</Track>
<Track mobile>

Watch the DogDays screen — we'll break it there. Your Flutter app has the same hole.

</Track>

<!-- Presenter notes: Web-only beat -- skip on the mobile laptop. Same demo tag as the last step: demo/03-insert-naive. Recovery: `git switch --detach --discard-changes demo/03-insert-naive`. Live: open the network tab, intercept the insert, change author_name to a friend's name, and post -- Postgres has no opinion, because nothing checked it. This is the setup for the profiles fix next. -->

---
layout: statement
accent: emerald
chip: STEP 4
---

# Stop trusting the client for names

<!-- Presenter notes: Demo tag: demo/04-profiles. Recovery: `git switch --detach --discard-changes demo/04-profiles`. -->

---
layout: terminal
accent: emerald
chip: SQL
file: supabase/migrations/20260928000100_profiles.sql
---

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null
);

alter table public.profiles enable row level security;

create policy "profiles are readable by everyone"
  on public.profiles
  for select
  to anon, authenticated
  using (true);
```

<!-- Presenter notes: This migration is long, so it's split across three slides -- same file, no new SQL editor paste in between. Same shape as the messages table: create, RLS on, one read-for-everyone policy. -->

---
layout: terminal
accent: emerald
chip: SQL
file: supabase/migrations/20260928000100_profiles.sql
---

```sql
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'preferred_username',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;
```

<!-- Presenter notes: Walk through the trigger function here: security definer + empty search_path so it can write to profiles even though the signed-in user has no write policy there, and can't be tricked by a planted function. The name comes from the first of name, full_name, preferred_username, or the email prefix. -->

---
layout: terminal
accent: emerald
chip: SQL
file: supabase/migrations/20260928000100_profiles.sql
---

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed up before this migration.
insert into public.profiles (id, name)
select id, coalesce(
  raw_user_meta_data ->> 'name',
  raw_user_meta_data ->> 'full_name',
  raw_user_meta_data ->> 'preferred_username',
  split_part(email, '@', 1)
)
from auth.users
on conflict (id) do nothing;

alter table public.messages
  add constraint messages_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.messages drop column author_name;
```

<!-- Presenter notes: Second half of the same migration -- the trigger hookup, a backfill for anyone who signed up before this migration existed, and the schema change that finally removes the naive author_name column now that profiles(name) covers it. -->

---
layout: dual-code
accent: emerald
chip: CODE
heading: The client can no longer lie
leftFile: components/Guestbook.tsx
rightFile: lib/guestbook.dart
---

````md magic-move [@67,@66] {lines: true}
```ts {67-71}
    const { data, error } = await supabase
      .from("messages")
      .insert({ body: body.trim(), author_name: authorName })
      .select("id, user_id, author_name, body, created_at")
      .single();

    if (!error && data) {
```
```ts {66-76}
    // The name is looked up server-side from public.profiles (set once, at
    // sign-up) -- we never send it from the client, so no one can post
    // under a name that isn't theirs.
    const { data, error } = await supabase
      .from("messages")
      .insert({ body: body.trim() })
      .select("id, user_id, body, created_at, profiles(name)")
      .single()
      // Same reasoning as the list query above -- this is a single row, and
      // its embedded profile is a single object, not an array.
      .overrideTypes<Message, { merge: false }>();

    if (!error && data) {
```
````

::right::

````md magic-move [@85,@79] {lines: true}
```dart {85-88}
    await _supabase.from('messages').insert({
      'body': body,
      'author_name': authorName,
    });

    _bodyController.clear();
    await _loadMessages();
```
```dart {79-82}
    // The name is looked up server-side from public.profiles (set once, at
    // sign-up) -- we never send it from the client, so no one can post
    // under a name that isn't theirs.
    await _supabase.from('messages').insert({'body': body});

    _bodyController.clear();
    await _loadMessages();
```
````

<!-- Presenter notes: The insert drops author_name entirely -- the column doesn't exist anymore. Point out `profiles(name)` in the select: PostgREST embeds the related row through the new foreign key in one query. -->

---
layout: dual-code
accent: emerald
chip: CODE
heading: Showing the author's name
leftFile: components/Guestbook.tsx
rightFile: lib/guestbook.dart
---

````md magic-move [@32,@35] {lines: true}
```ts {32-36}
  useEffect(() => {
    supabase
      .from("messages")
      .select("id, user_id, author_name, body, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setMessages(data ?? []));
  }, []);
```
```ts {35-43}
  useEffect(() => {
    supabase
      .from("messages")
      .select("id, user_id, body, created_at, profiles(name)")
      .order("created_at", { ascending: false })
      // Without generated database types, supabase-js guesses `profiles` is
      // an array; a many-to-one embed is actually a single object, so we
      // tell it the real shape here.
      .overrideTypes<Message[], { merge: false }>()
      .then(({ data }) => setMessages(data ?? []));
  }, []);
```
````

```ts {129}{lines:true,startLine:127}
          <li key={message.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{message.profiles?.name ?? "Unknown"}</h2>
```

::right::

````md magic-move [@47,@47] {lines: true}
```dart {48-51}
  Future<void> _loadMessages() async {
    try {
      final rows = await _supabase
          .from('messages')
          .select('id, user_id, author_name, body, created_at')
          .order('created_at', ascending: false);
      if (mounted) {
```
```dart {48-51}
  Future<void> _loadMessages() async {
    try {
      final rows = await _supabase
          .from('messages')
          .select('id, user_id, body, created_at, profiles(name)')
          .order('created_at', ascending: false);
      if (mounted) {
```
````

```dart {136-140}{lines:true,startLine:136}
                  final profile = message['profiles'] as Map<String, dynamic>?;
                  final authorName = profile?['name'] as String? ?? 'Unknown';

                  return ListTile(
                    title: Text(authorName),
                    subtitle: Text(message['body'] as String),
```

<!-- Presenter notes: `profiles(name)` embeds the author's profile through the new foreign key. Each message has exactly one author, so PostgREST returns a single object (or null), never a list. Without generated types supabase-js guesses an array, which is why web needs overrideTypes. Getting this wrong shows blank names on web and crashes Flutter. Demo tag: demo/04-profiles. -->

---
layout: statement
accent: cyan
chip: MONOREPO
---

The monorepo writes this exact same SQL, as a real migration, under `supabase/migrations`.

<!-- Presenter notes: One sentence, then move on. `02-nextjs-supabase` and `02-flutter-supabase` go public on GitHub right after tonight's workshop. -->

---
layout: statement
accent: emerald
chip: STEP 5
---

# Delete your own messages

<!-- Presenter notes: Demo tag: demo/05-delete. Recovery: `git switch --detach --discard-changes demo/05-delete`. -->

---
layout: terminal
accent: emerald
chip: SQL
titlebar: supabase dashboard → SQL editor
---

```sql
create policy "authenticated users can delete their own messages"
  on public.messages
  for delete
  to authenticated
  using (auth.uid() = user_id);
```

<!-- Presenter notes: No update policy on purpose -- this workshop only supports post-and-delete. -->

---
layout: dual-code
accent: emerald
chip: CODE
heading: Only your own delete button
leftFile: components/Guestbook.tsx
rightFile: lib/guestbook.dart
---

```ts {84-89}{lines:true,startLine:82}
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (!error) {
      setMessages(messages.filter((message) => message.id !== id));
    }
  }
```

```ts {142}{lines:true,startLine:140}
            </div>
            <p className="mt-1 text-gray-600">{message.body}</p>
            {session?.user.id === message.user_id && (
              <button
                onClick={() => handleDelete(message.id)}
```

::right::

```dart {90-93}{lines:true,startLine:88}
  }

  Future<void> _delete(String id) async {
    await _supabase.from('messages').delete().eq('id', id);
    await _loadMessages();
  }
```

```dart {139}{lines:true,startLine:137}
                itemBuilder: (context, index) {
                  final message = _messages[index];
                  final isOwnMessage = session?.user.id == message['user_id'];
                  // Embedded from public.profiles via the messages ->
                  // profiles foreign key. messages.user_id -> profiles.id is
```

<!-- Presenter notes: The delete button only renders for your own rows client-side, but the real guard is the RLS policy -- try deleting someone else's id from devtools/curl and Postgres refuses it regardless of what the UI shows. -->
