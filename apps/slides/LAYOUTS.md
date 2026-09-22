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

## Layouts

All layouts render a dark background (`#0a0a0c`) and the accent
corner-wash automatically — you don't need to add either yourself.

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

### `agenda`
Write a normal markdown list; items auto-number in the accent color
(`01`, `02`, ... via CSS counters — don't hand-number them).
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
§9).** Two columns, left = Next.js, right = Flutter, each independently
Shiki-highlighted. Built on Slidev's named-slot convention (same mechanism
as the built-in `two-cols` layout).
- Frontmatter: `accent`, `title` (optional — renders a heading **above**
  both columns; use this instead of a markdown `#`, because a `#` at the
  top of the slide body lands inside the *left* column only), `leftLabel`
  (default `"Next.js"`), `rightLabel` (default `"Flutter"`)
- Slots: default = left column (Next.js), `right` = right column
  (Flutter). Use Shiki line-highlight (`` ```ts {1-3|4} ``) or
  `magic-move` per Slidev's normal code-block syntax in either column.
```md
---
layout: dual-code
accent: emerald
title: Sign in
---

```ts
await supabase.auth.signInWithOAuth({ provider: 'custom:devdogs' })
```

::right::

```dart
await supabase.auth.signInWithOAuth(/* custom:devdogs */);
```
```

### `terminal`
Fenced code block (any language — SQL for the dashboard/SQL-editor beats,
bash for CLI-less contexts) rendered inside a faux terminal/window chrome.
- Frontmatter: `accent`, `title` (window titlebar text, default `"shell"`)
```md
---
layout: terminal
accent: emerald
title: supabase dashboard → SQL editor
---

```sql
select * from messages;
```
```

### `qr`
Big centered QR + caption. Use for the attendance/Discord/exit slides.
`src` must point at a file under `public/qr/` (served at `/qr/...`) —
`/qr/attendance.svg` and `/qr/discord.svg` already exist.
- Frontmatter: `accent`, `src` (required), `caption` (optional), `label`
  (small kicker above the code, optional)
- Slot: default — optional extra copy under the caption
```md
---
layout: qr
accent: cyan
src: /qr/attendance.svg
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
Discord).
- Frontmatter: `accent`, `subtitle`
```md
---
layout: closing
accent: cyan
subtitle: See you next week
---

# Thanks for coming
```

### `default`
Fallback when no `layout:` is set. Still dark + accent-aware (corner wash
only, no other chrome) so a forgotten `layout:` doesn't fall back to a
white slide. You shouldn't need to reference it directly.

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
  that's mostly text with a small QR in the corner).

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
  Use the `title` frontmatter prop for a heading that spans both columns.
- **Fonts** are loaded via the master deck's `fonts:` headmatter (Google
  Fonts), not per-fragment — don't re-declare `fonts:` in fragment files.
- **`pnpm build` / `pnpm dev`** run from `apps/slides/` (see
  `package.json` scripts) and point at
  `decks/2026-09-28-supabase.md`, so they build the whole assembled deck,
  fragments included.
