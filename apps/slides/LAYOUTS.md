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
  shown in each column's titlebar, optional), `trackSplit` (default
  `true` — see Track mode below)
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
  side!" for DogDays and the mobile equivalent for DogPack, each with the
  project's mark and name in its platform colour (DogDays red, DogPack
  purple). `?track=web` / `?track=mobile` → that half only, full width; no
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

## Presenting across two laptops

Track mode (above) needs both laptops to actually be *following the same
deck state* — one laptop advances slides and click-steps, the other two
(web follower, mobile follower) update live. That's Slidev's built-in
presenter/remote-control feature, riding the same HMR websocket Vite uses
for live-reload, reached over a named Cloudflare Tunnel so it works over
whatever network the venue has, behind Cloudflare Access so only officers
can open it.

**The three URLs** (presenter laptop runs `pnpm present`; the other two
just open a URL in a browser):

- Presenter (this laptop only, never shared): `https://<tunnel-host>/presenter/?password=<SLIDES_PRESENTER_PASSWORD>`
- Web follower: `https://<tunnel-host>/?track=web`
- Mobile follower: `https://<tunnel-host>/?track=mobile`

`<tunnel-host>` is `SLIDES_TUNNEL_HOSTNAME` from `.env` (defaults to
`slides.devdogsuga.org`). Advancing slides or click-steps from the
presenter view moves both followers; each follower keeps the track it
opened with (`?track=...`, remembered in that tab's `sessionStorage` per
"Track mode" above) even as slides advance. Arrow keys pressed in a
follower tab only move that tab's local view — followers can't drive the
deck or each other, only the presenter can.

### One-time setup (Sloan; officers-only via Cloudflare Access)

This part is infrastructure, not app code — done once outside this repo,
by whoever holds the Cloudflare account:

1. `cloudflared tunnel login` — authorizes this machine against the
   DevDogsUGA Cloudflare account. Writes a cert under `~/.cloudflared/`.
2. `cloudflared tunnel create devdogs-slides` — creates the named tunnel
   and writes its credentials JSON to `~/.cloudflared/<tunnel-id>.json`.
3. `cloudflared tunnel route dns devdogs-slides slides.devdogsuga.org` —
   points the DNS record at the tunnel.
4. In the Cloudflare Zero Trust dashboard, add a **self-hosted Access
   application** for `slides.devdogsuga.org` with a policy scoped to
   officers only (e.g. an email-domain or group rule), so the tunnel
   itself is reachable but nobody outside that policy gets past the
   Access login page.
5. Fill in `apps/slides/.env` (copy from `.env.example`):
   `SLIDES_PRESENTER_PASSWORD`, and `SLIDES_TUNNEL_NAME` /
   `SLIDES_TUNNEL_HOSTNAME` if they differ from the defaults
   (`devdogs-slides` / `slides.devdogsuga.org`).

Tunnel credentials live only in `~/.cloudflared/` on the machine that ran
`tunnel login`/`tunnel create` — never commit them, and they never touch
this repo.

### Running it

From `apps/slides/`: `pnpm present`. It fails fast with a message
pointing back to this section if `SLIDES_PRESENTER_PASSWORD` is missing
from `.env`, or if the named tunnel isn't set up yet (`cloudflared tunnel
info <name>` fails — e.g. setup above hasn't been done on this machine).
Otherwise it starts the Slidev dev server (`--remote`, bound to
`127.0.0.1` — only `cloudflared` on the same machine needs to reach it)
and `cloudflared tunnel run` together, prints the three URLs above, and
stops both on Ctrl-C or if either one exits unexpectedly.

`pnpm dev` is unaffected — it still just starts the plain local dev
server on `http://localhost:3030`, tunnel or no tunnel, and works exactly
as before.

### Manual-advance fallback

If the tunnel, Access, or the network at the venue isn't cooperating,
fall back to no sync at all: each laptop runs its own `pnpm dev` and
opens its own `?track=web` / `?track=mobile` URL, and the presenter
advances their copy while quietly saying "next slide" for the other
laptop to follow along by hand. The PDF export goes out afterwards
either way, so nobody's missing anything by the next day.

### What syncs and what doesn't

Only the **dev server** (`pnpm dev` / `pnpm present`) has the
presenter/remote-control websocket. The static build (`pnpm build`, what
actually gets deployed/exported) has no server to sync through — it's
just static files. Always present off the dev server, not a build.

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
Upcoming-events slide. Write normal markdown (`###` per event) in the
default slot; wrap each event-type label in `<Chip type="workshop" />`
(etc.) to get the site-legend accent automatically — this is independent
of the slide's own `accent` (which just drives the corner wash).
- Frontmatter: `accent`
```md
---
layout: events
accent: amber
---

### Next Monday — Supabase Workshop
<Chip type="workshop" /> DLW 124 · 6:00 PM

### Next Thursday — Dev Session
<Chip type="dev session" /> DLW 124 · 6:00 PM
```

### `closing`
Exit / "before you go" slide — like `title` but meant to be the last
content slide (pair it with a `qr` slide right after for attendance/
Discord, or fold QR codes straight into this one via `footer`).
- Frontmatter: `accent`, `subtitle`
- Slots: default (the big heading), `footer` (optional — rendered below
  the subtitle at normal scale rather than the heading's giant size; a
  `.dd-close-qr-row` div around a couple of `<QRSlot compact>`s lays them
  out side by side, and a `.dd-close-contact` paragraph gets the dim
  secondary-grey contact-line styling)
```md
---
layout: closing
accent: rose
subtitle: See you Wednesday for the next build session
---

# Before you go

::footer::

<div class="dd-close-qr-row">
  <QRSlot src="/qr/discord.svg" label="Discord" caption="Questions and help" accent="rose" compact />
  <QRSlot src="/qr/devdogsuga-org.svg" label="devdogsuga.org" caption="Sign in, join a team" accent="rose" compact />
</div>

<p class="dd-close-contact">devdogsuga.org · @devdogsuga · devdogs@uga.edu</p>
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
top, so split long ranges into clicks. Two blocks in one window split its
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

In the presenter view (`/presenter/`, dev server only), every code block gets
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

The browser never sees a webhook URL. The buttons POST to the dev server's
`/__snippets` endpoint (`theme/vite/snippets.ts`), which reads the two
webhook URLs from `apps/slides/.env` (gitignored; copy `.env.example`):
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
  values and their accent: `workshop`=emerald, `dev session`=cyan,
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
