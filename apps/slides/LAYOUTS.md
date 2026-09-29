# DevDogs Slidev theme — layout reference

This is the only documentation content agents get for the local theme. It
lives at `apps/slides/theme/` and is referenced from the master deck via
`theme: ../theme`. Layouts/components live in `theme/layouts/` and
`theme/components/`.

## Setting the accent

Every layout accepts an `accent` frontmatter key: one of `purple`, `cyan`,
`amber`, `emerald`, `red` (default `emerald` if omitted/unknown). It's read
as a prop and exposed to CSS as `--accent`, which drives the heading color
and the corner/edge wash. Source of truth for the hexes is
`theme/accents.ts`:

```
purple  #C27AFF   cyan   #00D3F2   amber #FFB900
emerald #00D492   red    #FF6467
```

Accent map for the 2026-09-28 Supabase deck (already applied to the
fragment placeholders — keep it when filling them in):

| Section | Accent |
|---|---|
| Title / sign-in + teaching sections (draft §1–11) | emerald |
| Agenda | cyan |
| §12 monorepo tie-back | cyan |
| Events | amber |
| Before-you-go / exit | cyan |

## Chrome, chips, and the background wash

Every layout below renders three things automatically, unless you turn
them off:

- **The background wash.** A dark (`#0c090c`, Tailwind's `mauve-950`, the website's dark background) base with a soft accent
  tint, drawn behind everything else. Three modes, chosen by
  `themeConfig.wash` in the deck's headmatter (`corner` (default), `site`
  or `template`) or overridden per-slide with a `wash` frontmatter key:
  - `corner` (default) — the template's corner glow rebuilt in CSS: one
    radial gradient off the top-right corner (behind the chip) in the
    slide's accent, plus two fainter companion blobs in complementary deck
    accents, all blurred. `theme/components/CornerWash.vue` holds the
    accent → companions map and the blob positions.
  - `site` — a static (no parallax, no JS) port of the
    website's section blob wash (`apps/platform/src/ui/section-background.tsx`
    and its callers like `HeroSection`/`EventsSection`): five radial
    gradients, tinted with `color-mix(in srgb, var(--accent) N%,
    transparent)` so it always matches the slide's own accent, plus a
    subtle diagonal edge cut echoing the site sections' own slant.
  - `template` — the pptx deck template's own baked-in background PNG
    for that accent (one per `purple`/`cyan`/`amber`/`emerald`/`red`,
    extracted from `Slides Template.pptx`'s `DD_<ACCENT>` slide layouts
    into `theme/assets/template-wash/`).
  ```md
  ---
  theme: ../theme
  themeConfig:
    wash: template
  ---
  ```
- **Chrome**: the DevDogs mark + wordmark, top-left, and the GDG on
  Campus mark + "Google Developer Groups" / "On Campus · University of
  Georgia" footer, bottom-right — both straight from the workspace
  `@devdogsuga/brand` package (never redrawn). Turn it off on a
  particular slide with `chrome: false`.
- **The corner chip**, if you set a `chip` frontmatter key (e.g. `chip:
  WORKSHOP`) — an accent-filled pill, dark caps text (white fails contrast on every accent), top-right. Uses
  the same `Chip` component as the `events` layout's inline chips, just
  in its `solid` variant.
- **The safe area.** Every layout's content sits inside
  `--dd-safe-top` / `--dd-safe-bottom` / `--dd-safe-x` (base.css), which
  clear the chrome bands top and bottom, so no layout needs its own
  padding to dodge the mark, chip or footer, and each keeps about 30px of
  air from them. That leaves 388px of the 552px canvas for content; a
  slide taller than that gets clipped, so split it rather than shrinking
  the type.

So every layout's frontmatter includes `accent`, `chip` (optional),
`chrome` (optional, default `true`), and `wash` (optional, overrides the
deck-wide `themeConfig.wash`) on top of whatever's documented below.

## Layouts

All layouts render a dark background (`#0c090c`, `mauve-950`) and the accent
wash automatically — you don't need to add either yourself.

### `title`
Deck-opening / meeting-title slide.
- Frontmatter: `accent`, `subtitle` (string, optional)
- Slot: default — put your `# Heading` here, it's colored `--accent` and set in Alan Sans 800 at display size.
```md
---
layout: title
accent: emerald
subtitle: Workshops · DLW 124 · 6:00 PM
---

# Supabase
```

### `section-divider`
Section break. Big kicker label + heading.
- Frontmatter: `accent`, `kicker` (small label above the heading)
```md
---
layout: section-divider
accent: emerald
kicker: "01 · Tour"
---

# Supabase, the tour
```

### `numbered-list`
Write a normal markdown list; items auto-number in the accent color
(`01`, `02`, ... via CSS counters — don't hand-number them), each row
separated by a `#2A212C` hairline divider. Use this for any accent-
numbered list of rows: rules, steps, whatever isn't specifically the
agenda.
- Frontmatter: `accent`
```md
---
layout: numbered-list
accent: cyan
---

# Merge conflict prevention

- Small PRs, one feature per branch
- Pull `main` before you start a session
- Run `pnpm install` and commit the lockfile together
```
Nest a plain item under a numbered one for a dimmed one-line sub-note
(steps, a caveat) instead of a new numbered step — it renders smaller, in
`--dd-grey-support`, with no number and no hairline of its own:
```md
---
layout: numbered-list
accent: indigo
---

# Enter the competition

- Turn on **GitHub 2FA**
  - Settings → Password and authentication → Enable two-factor authentication
- Get on a team at **devdogsuga.org/teams**
```

### `agenda`
A thin preset of `numbered-list` — same accent-numbered, hairline-divided
rows, just under a name that reads better in frontmatter for this
specific slide.
- Frontmatter: `accent`
```md
---
layout: agenda
accent: cyan
---

# Tonight

- Supabase, the tour
- Build against it
- Dashboard tour
- How the monorepo uses it
```

### `bullets-card`
Left an accent-dot bullet list; right a `#1D161E` rounded card with a
dim, uppercase header and its own mini numbered list (or a code block —
whatever fits).
- Frontmatter: `accent`, `cardTitle` (the card's dim caps header,
  optional)
- Slots: default (left bullets), `card` (right card body)
```md
---
layout: bullets-card
accent: emerald
cardTitle: What you'll need
---

- A Supabase project
- The publishable key
- Five minutes

::card::

1. `supabase init`
2. `supabase start`
3. `devtools oauth`
```

### `statement`
One big centered idea. Used for placeholder slides and single-line
concept slides (draft §1, §3).
- Frontmatter: `accent`
```md
---
layout: statement
accent: emerald
---

# A hosted Postgres database with auth, storage, realtime, and APIs.
```

### `diagram`
Heading + a diagram area (image, or hand-built HTML) with an optional
caption pinned to the bottom.
- Frontmatter: `accent`, `caption` (optional)
```md
---
layout: diagram
accent: emerald
caption: "Client → Supabase → Postgres"
---

# Where it fits

![architecture](/diagrams/supabase-arch.svg)
```

### `dual-code`
**The workhorse for the Next.js/Flutter dual-track sections (§4, §7, §8,
§9).** Two columns, left = Next.js, right = Flutter, each a code window
(see "Code windows" below) titled with its stack and file path. Built on Slidev's named-slot convention (same
mechanism as the built-in `two-cols` layout).
- Frontmatter: `accent`, `heading` (optional — renders a heading **above**
  both columns; use this instead of a markdown `#`, because a `#` at the
  top of the slide body lands inside the *left* column only. **Must be
  `heading`, not `title`** — see the Gotchas note on Slidev's reserved
  `title:` frontmatter key), `leftLabel` (default `"Next.js"`),
  `rightLabel` (default `"Flutter"`), `leftFile` / `rightFile` (file path
  shown in each column's titlebar, optional; either may differ by track:
  `rightFile: { web: ~/lib/supabase.ts, mobile: ~/lib/main.dart }`),
  `trackSplit` (default `true` — see Track mode below), `followTrack`
  (with `trackSplit: false`, the accent still follows `?track=`: for
  terminal | editor columns showing whichever track is up)
- Slots: default = left column (Next.js), `right` = right column
  (Flutter). Code from the workshop repos comes in as a `<<<` line (see
  "Code blocks" below); a ` ````md magic-move ` block (four backticks for
  the wrapper — see the Gotchas note) takes one `<<<` line per step. Shell
  blocks and plain fenced code work too. `bottom` (optional) — a full-width callout
  rendered below both columns (a card-filled box, hairline border), for
  something that applies to the whole slide rather than one column (e.g. a
  gotcha about the exercise). Omit it and nothing renders.
- **Track mode** (see below): when `?track=web` or `?track=mobile` is
  set, only the matching column shows, full width. With no track set —
  including the PDF export — both columns show, same as before. This
  applies to *every* `dual-code` slide, not just the Next.js/Flutter
  ones — a slide using the columns for something else entirely (e.g. a
  before/after diff, `leftLabel: Before` / `rightLabel: After`) still
  loses a column once `?track=` has been set anywhere earlier in the
  same tab's session (it's sticky, see Track mode below). Set
  `trackSplit: false` on that slide's frontmatter to opt it out and
  always show both columns.
```md
---
layout: dual-code
accent: rose
heading: Sign In / Sign Out
leftFile: ~/components/Guestbook.tsx
rightFile: ~/lib/guestbook.dart
---

<<< web@step-2:components/Guestbook.tsx {16|20-28|39-50}

::right::

<<< mobile@step-2:lib/guestbook.dart {22-33|55-62}
```

### `terminal`
One code window, full width: a shell session, or SQL for the Dashboard's
SQL editor. The same window in the same place as a `dual-code` column.
- Frontmatter: `accent`, `heading` (above the window; give every code
  slide one, so the windows line up), `titlebar` (the window's label,
  default `"shell"`. **Must be `titlebar`, not `title`** — see the
  Gotchas note on Slidev's reserved `title:` frontmatter key), `file` (a
  path shown beside the label, and the path a Discord post names)
```md
---
layout: terminal
accent: emerald
heading: Create the Messages Table
titlebar: Dashboard → SQL editor
file: ~/supabase/migrations/20260928000000_guestbook.sql
---

<<< web@step-1:supabase/migrations/20260928000000_guestbook.sql {7-13|15|17-22}
```

### `terminal` extras
`followTrack: true` makes the accent follow `?track=`, and `file` may
differ by track (`file: { web: ~/lib/supabase.ts, mobile: ~/lib/main.dart }`),
for one window whose content is wrapped in `<Track>`. A `<CodeTips>` in the
slot goes under the window, as on `dual-code`.

### `split-reveal`
One code window that makes room for a second: the first fills the width,
and on the slide's first click the second slides in beside it (the
terminal that made the migration files, then the files in an editor; or
config first, then the terminal). The reveal registers before the code
inside either window, so their clicks start once they're on screen.
- Frontmatter: `accent`, `heading`, `firstLabel` / `firstFile`,
  `secondLabel` / `secondFile` (files may differ by track), `followTrack`
- Slots: default (first window), `second`

### `bullets-code`
Bullets on the left, a full-height code window on the right (the wider
share). For "do this, and here's the file" slides, e.g. project setup
beside the env file.
- Frontmatter: `accent`, `heading`, `label` (default `"Editor"`), `file`
  (may differ by track), `followTrack`
- Slots: default (bullets), `code`

### `features`
The week's competition features split by project: DogDays (web) on the
left, DogPack (mobile) on the right, each under its mark and name in the
platform's project colours. Track mode shows each laptop its own project.
- Frontmatter: `accent`, `heading`
- Slots: default (DogDays list), `mobile` (DogPack list)

## Colour meanings (Supabase deck, 2026-09-25)

| Colour | Means |
|---|---|
| `emerald` | SQL, run in the Supabase Dashboard |
| `purple` / `sky` | Next.js / Flutter code (automatic on `dual-code` splits and `<Track>`) |
| `amber` | Shell commands (and the events slide) |
| `indigo` | The feature-competition section |
| `rose` | Everything else: agenda, section intros, wrap-up |

## Code colours

Code slides say what kind of code they hold by colour:

- **Emerald** is SQL, which both stacks run unchanged (in the Supabase
  Dashboard's SQL editor).
- **Purple** is Next.js and **sky** is Flutter, wherever the two stacks
  diverge. On a `dual-code` web/mobile split each column wears its stack's
  colour; with `?track=` set, the whole slide (chip, wash) follows that
  column. `<Track web>` / `<Track mobile>` colour whatever code they wrap.
  The mapping lives in `TRACK_ACCENT` (`theme/lib/track.ts`).

## Track mode

Two demo laptops share one deck (web and mobile) — see the design note
`workshop-repos-and-supabase-demo-design.md`. `?track=web` or
`?track=mobile` on the URL tells the deck which laptop it's running on;
that choice is written to `sessionStorage` so it survives clicking
through slides (and following a link into the presenter/remote view from
the same tab), not just the first page load. See `theme/lib/track.ts`.

- **`dual-code`** shows only the matching column, full width, when a
  track is set — both columns with no track (so the PDF export always has
  both).
- **`<Track web>...</Track>`** / **`<Track mobile>...</Track>`** — wrap
  any bit of slide content that's only relevant to one track. Shows when
  the track matches, or when no track is set at all (same both-tracks-by-
  default rule as `dual-code`).
  ```md
  <Track web>Only shows on the web laptop.</Track>
  <Track mobile>Only shows on the mobile laptop.</Track>
  ```
- **`preshow`** layout — the very first slide, shown while people find
  seats: the talk's header band (`logo` image, the `#` heading under it,
  `subtitle` for date/time/room), then "Working on web apps? Sit on this
  side!" over a looping arrow, and "Designed for DogDays contributors and
  future web developers" in the half's bottom-left corner (the mobile
  half the same for DogPack), with the project's mark and name in its
  platform colour (DogDays red, DogPack purple). `?track=web` / `?track=mobile` → that half only, full width; no
  track → both halves side by side.
  ```md
  ---
  layout: preshow
  accent: emerald
  logo: /logos/supabase-wordmark.svg
  logoAlt: Supabase
  subtitle: Mon Sep 28 · 6:00–7:30 PM · DLW 124
  ---

  # Workshop: Backend Integration
  ```

## Handouts: `pnpm export:md`

A PDF export only catches one frame of each code window, so the handout is
markdown for the docs site instead:
`pnpm export:md [decks/<deck>.md] --out <DevDogsUGA>/docs/workshops/<workshop>`
writes one folder of step pages per track (a docs "course"), plus any pages
both tracks share. See `scripts/export-md.ts`. Each `{build}` import becomes
one diff per click group with its `<CodeTips>` tip before it, then a link to
the whole file on GitHub; presenter notes are dropped.

- The headmatter's `docs` key: `description`, `url` (where the pages are on
  the docs site), `scheduled` (optional: an ISO time with a zone, before
  which the docs hide the workshop's pages; written onto the track folders
  and the shared pages), `repos` (the public GitHub repo per track, for the file
  links), and `tracks` (each track's folder `dir`, `name`, `order`, and
  `start`, the branch its demo starts from).
- `docsPage` on a slide starts a page: `file`, optional `title` (else the
  slide's heading), `description`, and `shared: true` + `order` for a page
  both tracks read the same, written once beside the track folders.
- `docs: false` on a slide, or on a fragment's `src:` slide, leaves it out
  (the preshow, the competition, upcoming events).
- A component with no markdown form (`<UpcomingStack>`, `<QRSlot>`, …) on an
  exported slide fails the export: add `docs: false` or teach the script.

### Step tags: `pnpm tag-steps`

Each `checkpoint:` is a tag in the workshop repos, `<workshop>/<NN>-<slug>`,
that attendees' clones read their steps from (the workshops VS Code
extension, the docs' catch-up commands). You pick each step's commit by
tagging it while building the demo; `pnpm tag-steps` then annotates every
tag in place (it never moves one) with the step's docs page title, a `Run:`
line per command in the step's shell blocks, and a `Docs:` line (the
headmatter's `docs.url`). It also tags `<workshop>/00-start` at the track's
`start` branch the first time. See `scripts/tag-steps.ts`.

- A shell block readers see but shouldn't run as part of the step (`pnpm
  dev`, which never exits) says so: ```` ```bash {*}{run: false} ````.
- It works on the deck's submodules (`workshops/web`, `workshops/mobile`) by
  default, or `--web`/`--mobile <clone>`. Push the tags to the planning
  repos from there: `git push --force origin 'refs/tags/02-supabase/*'`.
- `pnpm tag-steps --check` changes nothing and fails on any difference. The
  Slides workflow runs it, so a deck change that alters a step's title or
  commands needs a re-run and a push.

### Publishing a workshop

The docs pages cite exact commits and tags in the public repos, and the
extension fetches them from there, so before the pages' scheduled time:

1. `pnpm tag-steps --check`.
2. From your workshop clone (Web-Workshops, Mobile-Workshops), with the
   annotated tags fetched (`git fetch origin --tags --force`), push the
   branch and its tags to the public repo:
   `git push public 02-supabase 'refs/tags/02-supabase/*'`.
3. `pnpm tag-steps --check --remote public`: every tag is there, at the
   same commit, with the same message.

Never rebase or amend a workshop branch after exporting: the pages would
cite commits nobody can fetch. The last check catches it.

## Presenting

Three machines, one deck. The presenter drives from the hosted deck at
`https://slides-sync.devdogsuga.org/presenter/`, from any browser (behind
Cloudflare Access, officers only). Each demo laptop runs the deck locally
and follows along: every slide and click the presenter makes reaches both
laptops, each showing only its own track. Nothing has to stay up on the
presenter's machine.

```
presenter view ──/drive──▶ live relay ──/follow──▶ web laptop    (pnpm follow web)
(slides-sync, Access)      (Worker + DO)    └────▶ mobile laptop (pnpm follow mobile)
                           /follow via slides-relay (no Access)
```

The pieces:

- `worker/`: the Worker behind slides-sync.devdogsuga.org. It serves the
  built deck, runs the live relay (`worker/relay.ts`, one Durable Object
  holding the current slide), and posts to Discord for the presenter view.
  It checks the Access token itself on everything but `/follow`
  (`worker/access.ts`), so the deck stays private even if Access is
  misconfigured. The same Worker answers on slides-relay.devdogsuga.org,
  which has no Access application: that's where the laptops connect to
  `/follow` from localhost, and anything else there is refused.
- `theme/lib/live.ts`: the deck's socket to the relay. The relay is plugged
  into Slidev's own sync (`theme/setup/root.ts`), so a laptop follows the
  presenter exactly as a second tab would.
- `theme/custom-nav-controls.vue`: in the presenter view's nav bar, a dot
  for the relay connection, how many laptops are following (web·mobile),
  and the checkpoint button, plus "23 in VS Code" and, on a checkpoint
  slide, "17/23 at Step 3" (attendees, see below).

### Attendees

A third role, `attend`, is for the attendees' VS Code extension
(apps/workshops-vscode, "Follow live workshops"). It connects to
`wss://slides-relay.devdogsuga.org/attend?track=web|mobile`, the track being
the workshop repo it has open. Like `/follow` there is no Access on it, so it
is kept narrow (`worker/attend.ts`):

- Only a GET websocket upgrade with a valid `track` and no `Origin` header (so
  no browser page) is accepted; more than 500 attendee sockets are refused.
- It **receives** only the checkpoints that name its track, and
  `{ t: 'live', live: boolean }`: whether a presenter (`drive`) is connected,
  sent on connect and whenever it changes. Never slide state.
- It may **send** one message, `{ t: 'step', step: N }`: the step number it has
  reached (0 for none), an integer 0-99, at most 128 bytes. No names, no code.
  Anything else is dropped; more than 10 messages in 10 seconds are ignored,
  and a socket far over that is closed.
- The relay keeps each attendee's track, step and rate count in the socket's
  attachment, so idle attendee sockets hibernate along with the rest.
- The presenter's `peers` message gains `attend: { web, mobile }`, each
  `{ total, steps: { "<N>": count } }`. Attendee changes reach the presenter
  through a one-second alarm, so a room finishing a step at once is one update.

Steps are counted as reported, so "at Step 3" means exactly 3, and the tooltip
on "23 in VS Code" splits both counts by track.

### Checkpoints

A slide can name the step tag its step ends at:

```md
---
layout: dual-code
checkpoint: 02-supabase/03-insert-naive
---
```

On such a slide the presenter's nav bar shows a flag. Click it, then
**Web**, **Mobile**, or **Both**, and those laptops' workshop clones run
`git switch --detach --discard-changes <tag>` (`theme/vite/checkpoint.ts`),
throwing away whatever was typed live. Each laptop's result (✓, or ⚠ with
git's error on hover) shows beside the flag. It never runs on its own when
a slide comes up.

The tags live in the planning repos (web-workshops-planning,
mobile-workshops-planning), one per demo step (`02-supabase/01-read` …
`02-supabase/05-delete`), on the step commits of `02-supabase`, and are
pushed to the public repos with the handout (see Handouts). `pnpm follow`
fetches any the laptop's clone is missing, so a clone of the public repo
works too. Only step tags (`<workshop>/<NN>-<slug>`) are accepted, and a
missing tag fails with a message rather than switching to anything else. After a switch,
Next.js reloads by itself; the Flutter laptop needs a hot restart (`R`).

### On the night

Presenter: open `https://slides-sync.devdogsuga.org/presenter/` and sign
in through Access. Open `/presenter/` directly: a tab that only goes to the
presenter view later still follows instead of driving.

Each demo laptop, from `apps/slides/` in its Backstage checkout, signed in
to GitHub with an account that can read the planning repos (`gh auth login`,
then `gh auth setup-git`), since the workshop submodules and checkpoint tags
come from them:

```sh
pnpm follow web ~/Web-Workshops      # or: pnpm follow mobile ~/Mobile-Workshops
```

then open `http://localhost:3030/` on that laptop's projector. The path is
the clone the demo is typed into (or set `SLIDES_DEMO_REPO` in `.env`). The
script lists every checkpoint in the deck, ✓ if the clone has the tag and ✗
if not, so fetch any missing tags before the talk. Check the presenter's nav
bar reads `1·1` before starting.

Arrow keys on a laptop only move that laptop's view until the presenter's
next click. If the relay or the venue network drops, the laptops keep the
whole deck locally: advance them by hand and they rejoin when the network
comes back.

### Setup and deploy

`pnpm run deploy` from `apps/slides/` builds the deck, drops the
`_redirects` file Slidev writes (Workers rejects it; the Worker's SPA
fallback does its job), and deploys the Worker (it needs the workshop submodules and `wrangler login` to the
DevDogs account). The Worker needs:

- An Access application covering `slides-sync.devdogsuga.org` only (not
  slides-relay, and not a `*.devdogsuga.org` wildcard, or the laptops
  can't connect). Put its team domain and Application Audience (AUD) tag
  in `wrangler.jsonc` (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`) and redeploy.
  Until then the Worker refuses everything but `/follow`.
- The Discord webhooks as secrets: `wrangler secret put
  DISCORD_SNIPPETS_WEBHOOK_WEB` and `..._MOBILE`.

To try it all locally: `pnpm build`, then `pnpm run dev:worker` (the Worker
on `http://localhost:8787`, with the Access check off), and
`SLIDES_LIVE_URL=http://localhost:8787 pnpm follow web <clone>`.

### `qr`
Big centered QR + caption. Use for the attendance/Discord/exit slides.
`qrSrc` must point at a file under `public/qr/` (served at `/qr/...`) —
`/qr/attendance.svg` and `/qr/discord.svg` already exist. **Must be
`qrSrc`, not `src`** — see the Gotchas note on Slidev's reserved `src:`
frontmatter key.
- Frontmatter: `accent`, `qrSrc` (required), `caption` (optional), `label`
  (small kicker above the code, optional)
- Slot: default — optional extra copy under the caption
```md
---
layout: qr
accent: cyan
qrSrc: /qr/attendance.svg
label: Attendance
caption: Scan to check in
---
```

### `events`
Upcoming-events slide: a centred heading, then usually `<UpcomingStack />`
(the next three meetings from `@devdogsuga/events`, each card in its
event kind's own colour from the platform, never the slide's accent). The
first card is in the spotlight, and each click moves it to the next while
the others recede. Hand-written markdown
(`###` per event) still works: wrap each event-type label in
`<Chip type="workshop" />` (etc.) to get the site-legend accent.
- Frontmatter: `accent`
```md
---
layout: events
accent: amber
---

# Upcoming Meetings

<UpcomingStack />
```

### `closing`
Exit / "before you go" slide — like `title` but meant to be the last
content slide (pair it with a `qr` slide right after for attendance/
Discord, or fold QR codes straight into this one via `footer`).
- Frontmatter: `accent`, `subtitle`
- Slots: default (the big heading), `footer` (optional: a
  `.dd-close-qr-row` div of `<QRSlot compact plain>`s, each in a `<Track>`
  to show one per laptop, and a `.dd-close-contact` div of `<p>` lines, each
  led by Phosphor icons). With a footer, the heading sits at the top, the
  contact lines at the bottom the same distance from the edge, and the QR
  codes centre in the space between.
```md
---
layout: closing
accent: rose
subtitle: See you Wednesday!
---

# Before You Go

::footer::

<div class="dd-close-qr-row">
  <Track web><QRSlot src="/qr/discord.svg" label="Discord" accent="rose" trim="9.76%" compact /></Track>
  <Track mobile><QRSlot src="/qr/devdogsuga-org.svg" label="devdogsuga.org" accent="rose" trim="12.12%" compact /></Track>
</div>

<div class="dd-close-contact">
  <p><ph-instagram-logo-bold /><ph-github-logo-bold /><ph-linkedin-logo-bold /><span class="dd-close-handle">@DevDogsUGA</span></p>
  <p><ph-envelope-simple-bold />devdogs@uga.edu</p>
</div>
```

### `default`
Fallback when no `layout:` is set. Still dark + accent-aware, with the
usual wash and chrome, so a forgotten `layout:` doesn't fall back to a
white slide. You shouldn't need to reference it directly.

## Code blocks: file line numbers, context, and Discord

### Code windows

`dual-code` columns and `terminal` are the same window (base.css "Code
windows"): a heading, then the window filling the rest of the safe area. On
every code slide the window is the same size in the same place, however much
code it holds.

Inside a window, a code block is an editor viewport onto a whole file: the
file's own line numbers down the gutter, the lines being taught at full
strength, everything else dimmed, and the code filling the window top to
bottom. The file slides behind the window so the highlighted lines sit in
the middle, and glides to the next range on each click
(`theme/lib/viewport.ts`). A range taller than the window starts near its
top, so split long ranges into clicks. Long lines soft-wrap instead of
running off the window: editor rows continue past the line-number gutter,
shell rows a little indented, like a real terminal.

Window titlebars (`components/WindowTitle.vue`): the labels "Terminal" and
"Editor" draw as icons so the file path gets the room, and a path too long
for the bar is cut from the left, so the file name always shows. Two blocks in one window split its
height, with a dashed rule between them; a shell block keeps its natural
height and the file below it takes the rest.

### Code from the workshop repos

Slide code is never pasted into the deck. It comes from the workshop repos,
which are git submodules pinned to their `02-supabase` answer key:
`workshops/web` (web-workshops-planning) and `workshops/mobile`
(mobile-workshops-planning). A slide names a file at a demo step:

````md
<<< web@step-2:components/Guestbook.tsx {16|20-28|39-50}
<<< mobile:lib/guestbook.dart {90-93}
````

- The part after `@` is a git revision in the submodule: `step-N` is the
  commit whose message says "step N," (each demo step is one commit on
  `02-supabase`), `step-0` is the commit before step 1 (the `01-` branch,
  where the demo starts), and no `@` means the pinned commit, the finished
  demo. Any other git revision works too.
- Ranges are the file's own line numbers. `{*}` highlights nothing in
  particular and shows the top of the file.
- `{build}` instead of ranges builds a step up from its diff: the file one
  commit earlier (the lines about to change lit), then one chunk of the
  commit per click, each lit as it lands. Copy and Discord take every line
  the step changed, not just the last click's. Hunks taller than the window
  split at blank lines. `{build:1,2|3|4-5}` groups chunks into clicks (use
  it to give both columns the same click count: the mobile laptop follows
  the presenter's clicks); `{build:[3,6-10]1,2|4}` starts with chunks 3 and
  6–10 already in (built on an earlier slide), so a commit can span
  slides. `chunks()` in the transformer lists a commit's chunks.
- Magic Move moves whole lines here, not words
  (`components/ShikiMagicMove.vue`): a line that survives slides to its new
  place, new lines fade in.
- In a Magic Move block, one `<<<` line per step:

  `````md
  ````md magic-move
  <<< web@step-3:components/Guestbook.tsx {67-71}
  <<< web@step-4:components/Guestbook.tsx {66-76}
  ````
  `````
- `theme/setup/transformers.ts` expands each line at build time into a
  fenced block holding the whole file. A missing submodule, an unknown
  revision, or a range past the end of the file fails the build.
- **Keeping it current:** change the code in the workshop repo, push, then
  `git submodule update --remote apps/slides/workshops/web` (or `mobile`) in
  Backstage and commit the new pin. Check the slides' ranges against the
  new line numbers: a range that still fits the file builds fine but may
  point at the wrong lines.
- A fresh Backstage clone needs `git submodule update --init`. The
  submodules are the private planning repos, so CI needs a token that can
  read them (or, after 9/28, point them at the public repos, which will
  have `02-supabase` then).

### Shell blocks

`bash`, `sh`, `zsh` and `shell` blocks render as a terminal session
(`theme/lib/shell.ts`): a prompt before every command (working directory,
git branch, `❯`), `#` lines as dimmed annotations with no prompt, and an
idle prompt with a cursor at the end. The prompt follows the commands: `cd`
moves it, cd-ing into a fresh clone puts it on `main`, and `git switch`
changes the branch. It starts in the track's repo (`~/Web-Workshops` or
`~/Mobile-Workshops`), or `~` with no track; set the start yourself with
`{*}{cwd:'~/DevDogsUGA',branch:'main'}` after the language. The prompts
aren't part of the code, so copying or posting never picks them up.

Env files aren't commands: fence them as `dotenv`.

### Posting to Discord

In the presenter view (`/presenter/`), every code block gets
a Discord button beside its copy button, and `p` posts every block on the
current slide. A post is the block's focus: the contiguous span its highlight
ranges cover (the whole block if a range is `all` or it has none; the final
step for Magic Move), headed with the file path and its line numbers. The
copy button copies the same focus, not the whole file.

Channels follow the track: the Next.js column of a `dual-code` slide and
anything inside `<Track web>` go to DogDays, the Flutter column and
`<Track mobile>` to DogPack, and everything else (the SQL) to both. A
`dual-code` slide with `trackSplit: false` isn't a web/mobile split, so it
posts to both.

The browser never sees a webhook URL. On the hosted deck the buttons POST
to the Worker's `/discord` (`worker/index.ts`), which holds the two webhook
URLs as secrets (see "Presenting"). Under `pnpm dev` they POST to the dev
server's `/__snippets` (`theme/vite/snippets.ts`), which reads them from
`apps/slides/.env` (gitignored; copy `.env.example`):
`DISCORD_SNIPPETS_WEBHOOK_WEB` and `DISCORD_SNIPPETS_WEBHOOK_MOBILE`.
Restart the dev server after editing `.env`. A missing URL makes the button
show an error naming the variable.

## Components

Auto-imported globally in slide markdown (no `import` needed):

- **`<Accent color="emerald">...</Accent>`** — inline accent-colored,
  semi-bold span for prose, e.g. `RLS is <Accent color="emerald">the
  anchor</Accent> tonight.` `color` is any accent name; defaults to
  emerald if omitted.
- **`<Chip type="workshop" />`** or **`<Chip color="cyan">Custom
  label</Chip>`** — pill used on the `events` layout. Known `type`
  values and their accent: `workshop`=emerald, `build session`=cyan,
  `social`=purple, `hackathon`=amber, `meeting`=red. Pass an explicit
  `color` to override.
- **`<QRSlot src="/qr/attendance.svg" caption="Scan to check in"
  accent="cyan" />`** — the QR+caption block the `qr` layout wraps. Use it
  directly if you need a QR code inside a non-`qr` layout (e.g. a slide
  that's mostly text with a small QR in the corner, or two side by side on
  `closing`'s `footer` slot). Extra props: `label` (small kicker above the
  code — `qr` renders its own instead, at slide scale), `size` (QR image
  side length, any CSS length, default `14rem`), `compact` (smaller
  padding/type, for fitting two on one slide instead of one filling the
  frame).
- **`<Track web>...</Track>`** / **`<Track mobile>...</Track>`** — see
  "Track mode" above.
- **`<CodeTips>`** — a helper banner below a `dual-code` column's or a
  `terminal` slide's window
  (outside it: the window holds only code; all tips share one fixed-height
  row, so the windows line up and never resize between clicks), with one
  numbered slot per click (`<template #0>`, `<template #1>`, …; markdown
  inside, with blank lines around it). A click without its own slot keeps
  the last tip. It follows the slide's clicks and adds none.
- **`<DiscordChannel name="tech-support" forum />`** — a channel mention
  drawn the way Discord draws one (blurple pill; `forum` swaps `#` for the
  forum icon).
- **`→`** in slide text becomes a Phosphor arrow at build time (never in
  code or notes); `ArrowText` does the same for frontmatter labels.
- `QRSlot`'s `plain` drops the frame (bare code, grey label); `trim` crops the image's own quiet zone (percent of its
  width, e.g. `"9.76%"` for segno's 4-module margin on a 33-module code).

## The three greys

On top of the five accents, the template defines three grey tiers, each
with one job — exposed as both CSS vars and UnoCSS utilities:

| Var | Utility | Hex | Job |
|---|---|---|---|
| `--dd-grey-support` | `text-dd-support` | `#A89EA9` | Support/body text |
| `--dd-grey-secondary` | `text-dd-secondary` | `#D7D0D7` | Contact lines, footer |
| `--dd-grey-dim` | `text-dd-dim` | `#79697B` | Quietest tier: code comments, card headers |

Also available: `--dd-card-fill` (`#1D161E`, the `bullets-card` card
background) and `--dd-hairline` (`#2A212C`, the `numbered-list`/`agenda`
row dividers). Source of truth for all of these is `theme/accents.ts`
(`GREYS`, `CARD_FILL`, `HAIRLINE`).

## Gotchas

- **Where relative paths resolve from.** Slidev resolves `theme:`,
  `components/`, `layouts/`, `styles/`, and `uno.config.ts` relative to
  the directory of the file Slidev was invoked on — i.e. `decks/`, since
  the master deck lives at `decks/2026-09-28-supabase.md`. That's why the
  master deck's headmatter has `theme: ../theme` (one level up from
  `decks/`), and why the theme's own `components/`, `layouts/`,
  `styles/`, and `uno.config.ts` all live under `theme/`, not directly
  under `apps/slides/`. This was verified empirically against the
  installed `@slidev/cli@53.0.0` resolver (`userRoot = dirname(entry)`,
  `roots = [themeRoot, ...addonRoots, userRoot]`, and
  `components`/`layouts`/`styles/index.{ts,js,css}`/`uno.config.ts` are
  each looked up per-root) — don't move things without re-checking that.
- **Fragment files** (`decks/2026-09-28-supabase/*.md`) are plain Slidev
  markdown — multiple `---`-separated slides per file, same syntax as any
  deck. Any relative image/asset path you write inside a fragment file
  resolves relative to `decks/` (the master deck's directory, i.e.
  `userRoot`), **not** relative to the fragment file's own directory —
  so `![](../foo.png)` from a fragment file means `apps/slides/decks/../foo.png`
  = `apps/slides/foo.png`. Prefer absolute `/`-rooted paths into
  `public/` (e.g. `/qr/attendance.svg`, `/diagrams/whatever.svg`) to avoid
  relative-path confusion entirely.
- **Import-slide frontmatter.** In the master deck, each
  `---\nsrc: ./2026-09-28-supabase/NN-name.md\n---` block must contain
  **only** the `src:` key. Any other key on that block (e.g. `accent:`,
  `layout:`) gets merged as an *override* onto every slide the fragment
  contains, clobbering that fragment's own per-slide `accent`/`layout`.
  Set `accent`/`layout` inside the fragment file itself, per slide.
- **Slidev reserves `src:` on any slide's frontmatter** to mean "import
  this slide's content from another markdown file" (that's what the
  master deck's own `---\nsrc: ./2026-09-28-supabase/NN-name.md\n---`
  blocks do). If the imported path doesn't resolve to a markdown file,
  Slidev logs an import error internally and **silently drops the whole
  slide** — no error surfaces in the browser or dev-server log, it just
  isn't in the deck. This is why the `qr` layout's own frontmatter key is
  `qrSrc`, not `src`: a `qr` slide written with `src: /qr/foo.svg` looks
  fine in the markdown but vanishes from the rendered deck, because
  Slidev tries (and fails) to import `/qr/foo.svg` as a slide. Never name
  a layout's own frontmatter prop `src`.
- **The master deck's first frontmatter block is `hide: true`.** It only
  carries deck-wide headmatter (`theme`, `fonts`, `background`,
  `colorSchema`, ...) and is not a real slide — don't remove `hide: true`
  or it'll show up as a blank slide 1. Don't add slide content to the
  master deck directly; add it to the fragment files.
- **Fragment placeholders.** All 7 fragment files currently hold a single
  `layout: statement` placeholder slide naming which agent/section fills
  it (see each fragment's body). Replace the placeholder's frontmatter +
  body with real slides — you can add as many slides as you need per
  fragment file.
- **Dual-code heading.** Don't put a markdown `#`/`##` at the very top of
  a `dual-code` slide's body — it becomes part of the *left* column only.
  Use the `heading` frontmatter prop for a heading that spans both
  columns.
- **Slidev reserves `title:` on any slide's frontmatter** for its own
  slide-title metadata (table of contents, browser tab, presenter view) —
  it's parsed into `slide.title` and never forwarded as a prop to the
  layout component. A layout whose own prop is named `title` silently
  gets `undefined` for it: `terminal` falls back to its default titlebar
  text ("shell") and `dual-code` just never renders its heading, with no
  error anywhere. This is why those two layouts' own frontmatter keys are
  `titlebar` and `heading` respectively, not `title`. Never name a
  layout's own frontmatter prop `title`.
- **Magic Move's wrapper fence needs 4 backticks, not 3.** A
  ` ```md magic-move ` block containing normal ` ```ts `/` ```dart `
  code fences only parses correctly if the *outer* fence has more
  backticks than anything nested inside it — plain Markdown fences don't
  nest by themselves. Write it as ` ````md magic-move ` (four backticks)
  wrapping the inner triple-backtick blocks. Get this wrong and the whole
  block — including the inner fence markers — renders as inert plain
  text, with no error anywhere (the built-in reference doc at
  `@slidev/cli/skills/slidev/references/code-magic-move.md` says as much,
  easy to miss).
- **Fonts** are loaded via the master deck's `fonts:` headmatter (Google
  Fonts), not per-fragment — don't re-declare `fonts:` in fragment files.
- **`pnpm build` / `pnpm dev`** run from `apps/slides/` (see
  `package.json` scripts) and point at
  `decks/2026-09-28-supabase.md`, so they build the whole assembled deck,
  fragments included.
- **Components auto-import in markdown, not inside layout `.vue` files.**
  Slidev's component auto-import (no `import` needed for `<Chip>`,
  `<Accent>`, `<Track>`, ...) only applies to slide markdown. A layout
  `.vue` file under `theme/layouts/` must `import` anything it uses from
  `theme/components/` explicitly — see how every layout imports `Wash` and
  `Chrome`.
- **`themeConfig` is a real Slidev headmatter key**, not a DevDogs
  invention — it's how the deck-wide wash mode reaches every layout
  (`import { configs } from '@slidev/client'`, then
  `configs.themeConfig?.wash`). Slidev also turns every key under
  `themeConfig` into a `--slidev-theme-<key>` CSS var automatically; we
  don't use that mechanism for `wash` (it needs to switch which
  component renders, not just a CSS value) but don't be surprised if you
  see the var show up in devtools.
- **Track mode's `sessionStorage` is per-tab.** It survives clicking
  through slides and following a same-tab link into the presenter view,
  but a browser tab opened completely fresh (not via a link/`window.open`
  from the deck) won't inherit it — pass `?track=...` on that fresh URL
  too. This is why the pre-flight checklist in the design note has each
  laptop open its own URL with the track baked in, rather than relying on
  a shared window.
