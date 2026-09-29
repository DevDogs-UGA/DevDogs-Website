# DevDogs Workshops

Follow a DevDogs workshop in your own clone. Pick a step (from the sidebar, the
command palette, or a link on the workshop docs) and the extension shows that
step's changes against your code, so you accept or reject each one. Your work
is kept; nothing is thrown away.

Works with `DevDogsUGA/Web-Workshops` and `DevDogsUGA/Mobile-Workshops`.

## What you get

- **Workshop sidebar**: every step of the open repo ("Step 3 of 6"), with the
  one you're on marked. Click a step to review up to it.
- **Workshop: Go to step...** in the command palette: the same list.
- **Your own branch**: your work lives on `<github-username>/<workshop>`, never
  on the workshop's own branch. The sidebar warns you when you're on the
  workshop's branch and **Move my work** switches you over, keeping uncommitted
  changes.
- **Jump to step** (right-click a step): a deliberate reset. It moves your
  branch to that step and discards uncommitted changes, after asking.

## What it sends

Nothing. There is no telemetry and no account. It talks to GitHub only through
your own `git` (`git fetch origin --tags`, and a clone if you ask for one). Your
GitHub username, if it has to ask for it, and where your clone lives are stored
on your machine (VS Code global state) and nowhere else.

It never writes to your files until you accept a change. The only thing that
runs by itself when a link opens is `git fetch origin --tags`.

## Links

Docs pages open the extension with `vscode://devdogsuga.workshops/<action>?<query>`.
Query values must be percent-encoded (`encodeURIComponent`).

### `/review`

Review the changes up to a step.

```
vscode://devdogsuga.workshops/review?repo=DevDogsUGA/Web-Workshops&to=02-supabase/03-insert-naive
```

| Param     | Required | Meaning                                                                                  |
| --------- | -------- | ---------------------------------------------------------------------------------------- |
| `repo`    | yes      | `DevDogsUGA/Web-Workshops` or `DevDogsUGA/Mobile-Workshops` (case-insensitive)           |
| `to`      | yes      | Step tag to review up to, e.g. `02-supabase/03-insert-naive`                             |
| `from`    | no       | Step tag to review from. Without it, the step you're on is used (asked if it's unclear)  |
| `file`    | no       | Repo-relative path; limits the review to that one file                                   |
| `session` | no       | Opaque id of the docs tab; echoed back after Finish so the tab can continue              |

### `/open`

Open a file from your clone with some lines selected.

```
vscode://devdogsuga.workshops/open?repo=DevDogsUGA/Web-Workshops&ref=02-supabase/03-insert-naive&file=app/page.tsx&lines=12-20
```

| Param   | Required | Meaning                                                                                          |
| ------- | -------- | ------------------------------------------------------------------------------------------------ |
| `repo`  | yes      | As above                                                                                         |
| `ref`   | yes      | Step tag the lines refer to; must exist in your clone                                            |
| `file`  | yes      | Repo-relative path                                                                               |
| `lines` | no       | `12` or `12-20` (1-based, inclusive)                                                             |

If the file isn't in your clone yet, you're offered a read-only view of it as
it is at `ref`.

### Safety

- Only the two repos above are accepted; anything else is refused.
- Tags from a link only ever reach git as `refs/tags/<name>` after
  `--end-of-options`.
- Paths must stay inside your clone (`..`, absolute paths and `.git` are
  refused).
- If the repo isn't open, you choose: open a folder, clone it (you always pick
  where), or cancel.

## Development

```
pnpm --filter workshops build      # dist/extension.js
pnpm --filter workshops test
pnpm --filter workshops package    # .vsix
```

`src/core` is pure Node (merge engine, tags, branch decisions) and never imports
`vscode`; `src/extension` is the thin VS Code shell around it.
