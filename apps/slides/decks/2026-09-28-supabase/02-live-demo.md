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

```bash {*}{cwd:'~'}
# Download the workshop repo
gh repo clone DevDogsUGA/Web-Workshops
cd Web-Workshops
# Start from Setup Night's code
git switch 01-nextjs-intro
# Install dependencies
pnpm install
```

::right::

```bash {*}{cwd:'~'}
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

```dotenv
# .env.local
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…
```

</Track>
<Track mobile>

```dotenv
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
heading: Create the messages table
titlebar: Dashboard → SQL editor
file: supabase/migrations/20260928000000_guestbook.sql
---

<<< web@step-1:supabase/migrations/20260928000000_guestbook.sql {7-13|15|17-22}

<!-- Presenter notes: Paste this into the dashboard's SQL editor on both laptops (shared project, so one paste covers everyone): the table, row-level security on, and one policy. Everyone can read — no sign-in required yet. The file in the titlebar is where this SQL ends up at the end of the night; it's not there yet. -->

---
layout: dual-code
accent: rose
chip: CODE
heading: Connect to Supabase
leftFile: lib/supabase.ts
rightFile: lib/main.dart
---

```bash
# Add the Supabase client
pnpm add @supabase/supabase-js
```

<<< web@step-1:lib/supabase.ts {5|7-8|10}

::right::

```bash
# Add the Supabase client
flutter pub add supabase_flutter gotrue
```

<<< mobile@step-1:lib/main.dart {2|6-9|11-17}

<!-- Presenter notes: One client for the whole app, built from the two values in the env file. Web reads them from .env.local through process.env; Flutter bakes them in at run time with --dart-define-from-file=demo.env and initializes Supabase before runApp. gotrue is pinned directly because custom OIDC providers need gotrue 2.20 or newer. -->

---
layout: dual-code
accent: rose
chip: CODE
heading: From in-memory to Supabase
leftFile: components/Guestbook.tsx
rightFile: lib/guestbook.dart
---

````md magic-move
<<< web@step-0:components/Guestbook.tsx {12}
<<< web@step-1:components/Guestbook.tsx {6-12|15|17-24|33-36}
````

::right::

````md magic-move
<<< mobile@step-0:lib/guestbook.dart {28}
<<< mobile@step-1:lib/guestbook.dart {2-4|15-21|23-38|51-59}
````

<!-- Presenter notes: Magic Move animates the in-memory list into the Supabase query. Then the clicks walk the new code: the row type, loading the messages once on mount, and rendering them. The form goes away for now; posting comes back in step 3. -->

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

<<< web@step-2:components/Guestbook.tsx {16|20-28|39-50|54-68}

::right::

<<< mobile@step-2:lib/guestbook.dart {7-11|22-33|55-62|74-85}

<!-- Presenter notes: The clicks walk the whole step: keep the session in state and follow sign-in and sign-out, the sign-in and sign-out calls, then the buttons. Because the contributor's own GoTrue is the relying party, sign-in mints a native session in auth.users -- auth.uid() just works with the RLS policies coming up. Flutter's OAuthProvider is a real class here (gotrue Dart >= 2.20), so no cast needed on that side; the redirect goes back to the page on web and to the app's deep link on mobile. -->

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
heading: Let signed-in users post
titlebar: Dashboard → SQL editor
file: supabase/migrations/20260928000000_guestbook.sql
---

<<< web@step-3:supabase/migrations/20260928000000_guestbook.sql {24-29}

<!-- Presenter notes: auth.uid() = user_id is the whole guard -- Postgres itself refuses an insert claiming someone else's id. -->

---
layout: dual-code
accent: rose
chip: CODE
heading: Naive insert — client sends its own name
leftFile: components/Guestbook.tsx
rightFile: lib/guestbook.dart
---

<<< web@step-3:components/Guestbook.tsx {18|53-65|67-77|97-112}

::right::

<<< mobile@step-3:lib/guestbook.dart {22,40-44|72-83|85-91|116-131}

<!-- Presenter notes: The clicks walk the step: state for the message box, the submit handler and its authorName lookup, the insert, then the form. Linger on the authorName lookup -- it reads straight off the client's own session data, which the client fully controls. -->

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
heading: Move names into profiles
titlebar: Dashboard → SQL editor
file: supabase/migrations/20260928000100_profiles.sql
---

<<< web@step-4:supabase/migrations/20260928000100_profiles.sql {6-11|13-19|25-30|31-44|46-48|50-61|63-70}

<!-- Presenter notes: One paste, on one laptop (shared project); the clicks walk it. A profiles table with the same shape as messages: create, RLS on, one read-for-everyone policy. Then the trigger function: security definer + empty search_path so it can write to profiles even though the signed-in user has no write policy there, and can't be tricked by a planted function; the name comes from the first of name, full_name, preferred_username, or the email prefix. The trigger runs it on every sign-up, the backfill covers anyone who signed up before this ran, and the last change points messages at profiles and removes the naive author_name column. -->

---
layout: dual-code
accent: rose
chip: CODE
heading: The client can no longer lie
leftFile: components/Guestbook.tsx
rightFile: lib/guestbook.dart
---

````md magic-move
<<< web@step-3:components/Guestbook.tsx {67-71}
<<< web@step-4:components/Guestbook.tsx {66-76}
````

::right::

````md magic-move
<<< mobile@step-3:lib/guestbook.dart {85-88}
<<< mobile@step-4:lib/guestbook.dart {79-82}
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

````md magic-move
<<< web@step-3:components/Guestbook.tsx {32-38}
<<< web@step-4:components/Guestbook.tsx {35-45|7-16|129}
````

::right::

````md magic-move
<<< mobile@step-3:lib/guestbook.dart {49-52}
<<< mobile@step-4:lib/guestbook.dart {49-52|132-137|139-140}
````

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
heading: Let users delete their own messages
titlebar: Dashboard → SQL editor
file: supabase/migrations/20260928000000_guestbook.sql
---

<<< web@step-5:supabase/migrations/20260928000000_guestbook.sql {31-37}

<!-- Presenter notes: No update policy on purpose -- this workshop only supports post-and-delete. -->

---
layout: dual-code
accent: rose
chip: CODE
heading: Only your own delete button
leftFile: components/Guestbook.tsx
rightFile: lib/guestbook.dart
---

<<< web@step-5:components/Guestbook.tsx {84-89|142|143-149}

::right::

<<< mobile@step-5:lib/guestbook.dart {90-93|139|150-155}

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
heading: Start Supabase locally
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
heading: Turn the SQL into migrations
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
heading: Sign in with DevDogs, locally
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
