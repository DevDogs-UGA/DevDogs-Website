---
layout: section-divider
accent: emerald
kicker: "03 · Build against it"
---

# Connect, auth, realtime & storage

<!--
Transition beat. We just modeled `messages` and turned on RLS (§5–6).
Now: wire a real client to it, sign contributors in through DevDogs'
custom OAuth provider, then a quick look at realtime + storage.
-->

---
layout: dual-code
accent: emerald
title: Initialize the client — once
---

```ts
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
```

::right::

```dart
// main.dart
await Supabase.initialize(
  url: const String.fromEnvironment('SUPABASE_URL'),
  anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
);
final supabase = Supabase.instance.client;
```

<!--
One client, reused everywhere. Same URL/anon key from §4's env setup.
Note supabase_flutter takes the values via --dart-define at run time
instead of a .env file — flag that difference if anyone asks.
-->

---
layout: dual-code
accent: emerald
title: Read & write
---

```ts {1-4|6}
const { data: messages, error } = await supabase
  .from('messages')
  .select('*')
  .order('created_at', { ascending: false })

await supabase.from('messages').insert({ body: 'hello' })
```

::right::

```dart {1-4|6}
final messages = await supabase
    .from('messages')
    .select()
    .order('created_at', ascending: false);

await supabase.from('messages').insert({'body': 'hello'});
```

<!--
Neither insert sets user_id — that's on purpose. Supabase/RLS derives the
user from the session (next section), and the "insert your own" policy
from §6 rejects a write if user_id doesn't match auth.uid(). The app has
to set user_id from the signed-in session once auth is wired.
-->

---
layout: section-divider
accent: emerald
kicker: "§8 · Auth"
---

# DevDogs' custom OAuth server

<!--
Not the usual "click Google in Supabase" path — DevDogs runs its own
OAuth server. One-time setup done live, then it collapses to a single
signInWithOAuth call because the contributor's own GoTrue becomes the
relying party and mints a native Supabase session.
-->

---
layout: default
accent: emerald
---

# One-time setup — do this live

1. Register a DevDogs OAuth client at
   **`devdogsuga.org/tools/oauth`** → get a `client_id` + secret.
   Add the Supabase callback as a redirect URI:
   `https://<ref>.supabase.co/auth/v1/callback`
2. In **your own** Supabase dashboard → **Authentication → Providers →
   Add a custom OIDC provider**:
   - Issuer: **`https://api.devdogsuga.org/auth/v1`**
   - Client ID / secret from step 1
   - Scopes: **`openid email profile`**

Because your own GoTrue is the relying party, it mints a <Accent color="emerald">native</Accent> session in
your project's `auth.users` — `auth.uid()` just works with the §6 RLS
policies, zero extra trust config.

<!--
This replaces the raw authorize-URL / code-exchange flow from the
original draft — that approach is obsolete. Walk the room through both
dashboard steps live; this is the part most likely to eat time, so budget
for it. Leads demo it if the room lags (per the implementation plan).

Contract gap: no dedicated "numbered steps" content layout exists yet in
the theme (only title/section-divider/agenda/statement/diagram/dual-code/
terminal/qr/events/closing). Approximated with the bare `default` layout
plus a hand-written markdown heading + ordered list, per the fallback
instruction in LAYOUTS.md. Flagging in case a `steps` layout gets added
later — this slide would be its first user.
-->

---
layout: dual-code
accent: emerald
title: Sign in
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

<!--
⟨HOOK⟩ carried forward from the implementation plan (§9 "verify during
implementation"): JS takes the 'custom:devdogs' string directly; Dart's
OAuthProvider is an enum and the custom-provider path through it isn't
confirmed yet. Don't paper over this on stage — say so and show the
confirmed Next.js call plus the open question for Flutter. Flutter runs
this live beat on Flutter web (parity with Next.js); mobile deep-linking
is pre-wired separately in the Flutter template repo.
-->

---
layout: dual-code
accent: emerald
title: Getting the current user
---

```ts
const { data: { user } } = await supabase.auth.getUser()
```

::right::

```dart
final user = supabase.auth.currentUser;
```

<!--
Once signed in, auth.uid() resolves server-side and the §6 policies do
their job automatically — this is just how the client reads who's
signed in, e.g. to set user_id on an insert.
-->

---
layout: section-divider
accent: emerald
kicker: "§9 · Lighter touch"
---

# Realtime & storage

<!--
These exist and here's the shape — we're not going deep. Same
permission model as tables: RLS/storage policies gate both.
-->

---
layout: dual-code
accent: emerald
title: "Realtime — push row changes to the client"
---

```ts
supabase.channel('messages')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => console.log('new message', payload.new))
  .subscribe()
```

::right::

```dart
supabase.channel('messages')
  .onPostgresChanges(
    event: PostgresChangeEvent.insert,
    schema: 'public',
    table: 'messages',
    callback: (payload) =>
        debugPrint('new message: ${payload.newRecord}'),
  )
  .subscribe();
```

<!--
Subscribe to a channel, filter to the table/event you care about, get
pushed updates live — no polling. Same RLS-protected data underneath.
-->

---
layout: dual-code
accent: emerald
title: "Storage — upload & serve a file"
---

```ts
await supabase.storage
  .from('avatars')
  .upload(`${user.id}/pic.png`, file)

const { data } = supabase.storage
  .from('avatars')
  .getPublicUrl(`${user.id}/pic.png`)
```

::right::

```dart
await supabase.storage
    .from('avatars')
    .upload('${user.id}/pic.png', file);

final url = supabase.storage
    .from('avatars')
    .getPublicUrl('${user.id}/pic.png');
```

<!--
Same permission model as tables — storage buckets get their own
policies, evaluated the same way as the messages RLS policies above.
-->
