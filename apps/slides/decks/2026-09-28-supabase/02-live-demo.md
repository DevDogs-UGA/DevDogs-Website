---
layout: section-divider
accent: rose
kicker: "02 · Live demo"
chip: LIVE DEMO
---

# Build it live

<!-- Presenter notes: Sloan is back at the podium. Shruti's concepts map onto real code now — two laptops, one Supabase project, projected side by side. Both laptops type the code live (or paste it from the slides); if one presenter is alone, drive the web side and paste the Flutter side from the slides. -->

---
layout: dual-code
accent: rose
chip: CLONE
heading: Get the workshop code
leftFile: terminal
rightFile: terminal
---

```bash
# Download the workshop repo
gh repo clone DevDogsUGA/Web-Workshops
cd Web-Workshops
# Start from Setup Night's code
git switch 01-nextjs-intro
# Install dependencies
pnpm install
```

::right::

```bash
# Download the workshop repo
gh repo clone DevDogsUGA/Mobile-Workshops
cd Mobile-Workshops
# Start from Setup Night's code
git switch 01-flutter-intro
# Install dependencies
flutter pub get
```

<!-- Presenter notes: Everyone already has this from Setup Night — this is just the Supabase branch point. Both branches are "what you built, plus the guestbook we didn't get to." -->

---
layout: bullets-card
accent: rose
chip: SETUP
cardTitle: Where they go
---

# Project setup

- Create a Supabase project at **supabase.com/dashboard**; it takes about a minute
- Copy the **Project URL** and the **publishable** key from Project Settings → API
- Paste them into your app's env file

::card::

<Track web>

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…
```

</Track>
<Track mobile>

```bash
# demo.env
SUPABASE_URL=…
SUPABASE_PUBLISHABLE_KEY=…
```

</Track>

<!-- Presenter notes: Create the project live on both laptops. The URL looks like https://<ref>.supabase.co and the key starts with sb_publishable_. Web copies .env.example to .env.local; Flutter copies demo.env.example to demo.env and runs with `--dart-define-from-file=demo.env`. The publishable key is safe in the app; the secret key never is. This is the part most likely to eat time -- budget for it, and a lead can drive if the room lags. Sign-in setup waits until step 2. -->

---
layout: statement
accent: rose
chip: STEP 1
---

# Read the guestbook

<!-- Presenter notes: First step — swap the in-memory array for a real Supabase table, read-only. -->

---
layout: terminal
accent: emerald
chip: SQL
titlebar: supabase dashboard → SQL editor
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
accent: rose
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

<!-- Presenter notes: Magic Move animates useState (in-memory) into the Supabase query. -->

---
layout: statement
accent: rose
chip: STEP 2
---

# Sign in with DevDogs

<!-- Presenter notes: No SQL this step. First register the app with DevDogs and add the provider in the Dashboard (next two slides), then the client code. -->

---
layout: numbered-list
accent: rose
chip: DEVDOGS
---

# Register your app with DevDogs

- Go to **devdogsuga.org/tools/oauth** and create a client
- Redirect URI: `https://<ref>.supabase.co/auth/v1/callback`
- Copy the **client ID** and **client secret**

<!-- Presenter notes: The redirect URI is the contributor's own Supabase project's auth callback (the project ref is in the Project URL). The secret is shown once -- keep the tab open until it's pasted into Supabase on the next slide. -->

---
layout: numbered-list
accent: rose
chip: DASHBOARD
---

# Add the provider in Supabase

- Authentication → **Sign In / Providers** → add a custom **OIDC** provider
- Identifier `devdogsuga` · Issuer `https://api.devdogsuga.org/auth/v1`
- Scopes `openid email profile` · paste the client ID + secret · save

<!-- Presenter notes: Supabase prefixes custom provider IDs, so the app signs in with `custom:devdogsuga`. VERIFY ON THE 9/27 DRY RUN: the exact Dashboard labels, and the issuer -- Supabase refuses an issuer that disagrees with the discovery document (TASK-346/347); `devtools oauth` reads it from discovery, so if the dashboard rejects api.devdogsuga.org, use the issuer the discovery doc advertises. `devtools oauth` does all of this in one command; it comes back in the local bonus section at the end. -->

---
layout: dual-code
accent: rose
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
accent: rose
chip: STEP 3
---

# Let signed-in users post


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
accent: rose
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
accent: rose
chip: QUESTION
---

# What's wrong with this?

<v-click>

The **app** decides whose name goes on each message. Anyone can send any `author_name` they like, and the database stores whatever it's told.

</v-click>

<!-- Presenter notes: Ask the room first and take a few guesses before clicking to reveal. The insert trusts a name the client sends, and a client is just a program anyone can modify: edit the request, call the API directly, or change the app. RLS checks who you are (auth.uid() = user_id), but nothing checks the name. On the web laptop you can prove it: edit the insert request's author_name in the browser's network tools and resend. This sets up the profiles fix next. -->

---
layout: statement
accent: rose
chip: STEP 4
---

# Stop trusting the client for names


---
layout: terminal
accent: emerald
chip: SQL
titlebar: supabase dashboard → SQL editor
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

<!-- Presenter notes: Long, so it's split across three slides: run each in the SQL editor in order, on one laptop (shared project). Same shape as the messages table: create, RLS on, one read-for-everyone policy. -->

---
layout: terminal
accent: emerald
chip: SQL
titlebar: supabase dashboard → SQL editor
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
titlebar: supabase dashboard → SQL editor
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

<!-- Presenter notes: Last of the three: the trigger hookup, a backfill for anyone who signed up before this ran, and the schema change that finally removes the naive author_name column now that profiles(name) covers it. -->

---
layout: dual-code
accent: rose
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
accent: rose
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

<!-- Presenter notes: `profiles(name)` embeds the author's profile through the new foreign key. Each message has exactly one author, so PostgREST returns a single object (or null), never a list. Without generated types supabase-js guesses an array, which is why web needs overrideTypes. Getting this wrong shows blank names on web and crashes Flutter. -->

---
layout: statement
accent: rose
chip: STEP 5
---

# Delete your own messages


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
accent: rose
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

---
layout: section-divider
accent: rose
chip: BONUS
kicker: Run it locally
---

# Everything we clicked, as files

<!-- Presenter notes: Demo only -- nobody needs to follow along, and it needs Docker. Everything so far ran in the shared project's Dashboard; this turns the same SQL into migration files in the repo, which is how the monorepo works. Before starting: `supabase stop` any other local stack on this laptop (same ports, 54321-54324). -->

---
layout: terminal
accent: amber
chip: SHELL
titlebar: terminal
---

```bash
# Start Postgres, Auth, and Studio in Docker
npx supabase start
# Print the local API URL, Studio URL, and publishable key
npx supabase status
```

<!-- Presenter notes: start boots Postgres, Auth, and Studio in Docker (first run downloads images -- do it before the meeting). status prints the local API URL (http://127.0.0.1:54321), Studio (http://127.0.0.1:54323), and the local publishable key. Open Studio: it's the same dashboard, empty. -->

---
layout: terminal
accent: amber
chip: SHELL
titlebar: terminal
---

```bash
# Create empty, timestamped files under supabase/migrations,
# then paste in the SQL we ran in the Dashboard
npx supabase migration new guestbook
npx supabase migration new profiles
# Rebuild the local database from those files
npx supabase db reset
```

<!-- Presenter notes: Each `migration new` creates an empty, timestamped file under supabase/migrations -- paste in the SQL we ran in the Dashboard, in the same order (the guestbook table and policies into the first, the profiles table, trigger, and backfill into the second). `db reset` rebuilds the local database from those files, so anyone who clones the repo gets the same schema. -->

---
layout: terminal
accent: amber
chip: SHELL
titlebar: terminal
---

```bash
# Register "Sign in with DevDogs" on the local stack in one step
# (db reset wiped the provider we just set up by hand)
pnpm dlx @devdogsuga/devtools oauth
```

<!-- Presenter notes: The DevDogs sign-in provider isn't part of the migrations, and `db reset` wipes it, so register it again against the local stack. Then point `.env.local` (web) or `demo.env` (mobile) at the local URL and publishable key from `supabase status`, restart the app, and sign in against your own machine. -->

---
layout: statement
accent: rose
chip: MONOREPO
---

The monorepo works exactly like this: every schema change is a migration under `supabase/migrations`.

<!-- Presenter notes: One sentence, then move on to the competition. The `02-supabase` branches (with these migrations) go public on GitHub right after tonight's workshop. -->
