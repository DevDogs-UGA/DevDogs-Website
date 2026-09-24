# `@devdogsuga/newsletter-cli`

Officer script for the DevDogs Changelog: preview, export, draft, and send
issues that live in `@devdogsuga/newsletter`. Moved out of
`@devdogsuga/devtools` in Wave 2, stage A2 — see the carve-out plan's §9
("officer commands move to Backstage as plain scripts... `newsletter`
(preview + send) → Backstage script, since the content lives there").

This package is **never published** (`"private": true`) — it only ever runs
from inside a Backstage checkout, where `@devdogsuga/newsletter` is an
ordinary workspace sibling.

## Usage

From the Backstage repo root:

```sh
pnpm newsletter                                  # interactive: pick issues + outputs
pnpm newsletter '*'                              # export every issue, both formats
pnpm newsletter 3.0.1 --format eml,html --out ~/changelog
pnpm newsletter 3.0.1 --push                     # append as a Drafts item in the club mailbox
pnpm newsletter 3.0.1 --send --to a@uga.edu,b@uga.edu
```

`--push`/`--send` skip file export by default (pass `--format` explicitly if
you want files too). See `src/commands.ts`'s header and `parseNewsletterArgs`
for the full flag set — it is a faithful, unchanged port of devtools'
`newsletter` command.

**Why not compose through Outlook's own composer:** its send path rewrites
inline styles and strips the dark-mode `bgcolor` attributes the newsletter
depends on (see `dogdays-design-language`/Outlook notes elsewhere in this
org's memory) — `--send` submits the exact authored MIME over SMTP instead,
byte for byte.

## Credentials — what an officer needs, and what they don't

**No `.env` file, no environment variables, no DevDogsUGA env registry
entry.** This was true even before the move — devtools' original
`newsletter` module never read `process.env` for a credential (the one
`process.env` read in this package, `XDG_CONFIG_HOME`, only relocates where
the token cache lives; it is optional).

Instead: the first `--push` or `--send` opens a browser for an interactive
OAuth sign-in as the club mailbox (`devdogs@uga.edu` by default, `--mailbox`
to override), using Thunderbird's own public app registration (UGA's tenant
blocks consent for the clean Microsoft Graph mail scopes, but allowlists a
handful of legacy IMAP/SMTP mail clients by application ID — Thunderbird is
one; see `src/oauth.ts`'s header for the full story). A local loopback
server on an ephemeral port catches the redirect; if nothing can bind one,
it falls back to a paste-the-URL prompt.

The refresh token is cached at `$XDG_CONFIG_HOME/devdogsuga/newsletter-mailbox.json`
(`~/.config/devdogsuga/newsletter-mailbox.json` by default), mode `600`,
outside any git-reachable directory on purpose. After the first interactive
sign-in, every later `--push`/`--send` (including non-interactive/CI
contexts, as long as the cached refresh token is still valid) reuses it
silently.

**To set this up as a new officer:** just run `pnpm newsletter --push` once,
interactively, and sign in as the club account when the browser opens.
Nothing needs to be provisioned ahead of time.

## What moved, what didn't

- Moved here from `@devdogsuga/devtools`' `src/newsletter/` (commands, imap,
  smtp, oauth, loopback, and their tests) — unchanged behavior, only the
  newsletter-package import switched from devtools' dynamic repo-peer
  resolution (`repo/peers.ts`'s `loadNewsletter`/`loadNewsletterExport`,
  needed because devtools runs against an arbitrary DevDogsUGA checkout) to
  a direct static import of the workspace sibling `@devdogsuga/newsletter`.
- `devtools` no longer depends on `@devdogsuga/newsletter` at all — the
  `newsletter` command, its peer dependency entry, and its optional-peer
  loader were removed.
- Newsletter *content* (`ChangelogDocument`, `ISSUES`, `buildEml`, the
  export renderers) still lives in `@devdogsuga/newsletter` — this package
  only adds the CLI shell (argument parsing, the OAuth/IMAP/SMTP wire
  protocol, the interactive prompts) around it.
