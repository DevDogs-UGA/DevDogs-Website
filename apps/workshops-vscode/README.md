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

## Live workshops

While a workshop repo is open, the extension listens to the DevDogs slides relay
(`wss://slides-relay.devdogsuga.org/attend`, the track being the repo: Web or
Mobile). It only listens for the presenter finishing a step.

- **● Live** appears in the sidebar while the presenter is connected.
- When the presenter finishes a step you don't have yet, a notification says
  "Presenter finished Step 3: ..." with **Review** and **Later**. Later leaves a
  badge on the Workshop view. It never interrupts a review in progress: the step
  is offered when that review finishes.
- Turn it off with the setting `devdogsWorkshops.followLive`. For testing,
  `devdogsWorkshops.liveRelayUrl` points it at another relay.

## What it sends

There is no account. It talks to GitHub only through your own `git`
(`git fetch origin --tags`, and a clone if you ask for one). Your GitHub
username, if it has to ask for it, and where your clone lives are stored on your
machine (VS Code global state) and nowhere else.

**Live workshops.** With `devdogsWorkshops.followLive` on, it tells the relay
which step number you've reached, so the presenter can see "17/23 at Step 3": a
small integer and nothing else, with no name, no username and no code. The relay
sees your IP address as any server does, and keeps nothing after you disconnect.

**Error reports.** When the extension itself fails (a bug, not a refused link or
git declining because of your edits), it can send an error report to the club's
Sentry project. It sends only while VS Code's telemetry setting
(`telemetry.telemetryLevel`) is on, and stops when you turn it off. A report has:

- the error's message (cut to 300 characters) and its stack trace (function
  names, file names inside the extension, line numbers),
- the extension's version, VS Code's version, your operating system (its name,
  such as Linux) and platform (`win32`, `darwin`, `linux`), the track (web or
  mobile) of the open workshop repo, and which command failed.

Before sending, your home folder, your clone's path and your open folders are
replaced with `<path>`, other absolute paths shrink to a file name, and email
addresses, tokens, credentials in URLs and your GitHub username are removed.

It never sends file contents, diffs, source code lines, git output beyond the
error message, breadcrumbs, your name, your IP address (Sentry receives it as any
server does, and the project is set to not store it), performance data, or
anything about other extensions. It does not install any global error handler,
so it cannot see other extensions' errors. Builds made from source send nothing:
the destination is added only to the published extension.

It never writes to your files until you accept a change. The only thing that
runs by itself when a link opens (or, with live workshops on, when the presenter
finishes a step your clone lacks) is `git fetch origin --tags`.

## Reviewing a step

Picking a step (or opening a `/review` link) opens the Review panel:

1. **Commands first.** Each `Run:` command of the step is listed with a
   **Run in terminal** button. They run in the extension's own "Workshop"
   terminal, always bash (Git Bash on Windows). With VS Code's shell
   integration it waits for the exit code and moves on only on success. Without
   bash or shell integration the line is typed into your default shell and you
   press **I ran it**. Already ran them yourself? **Skip** them.
2. **Then the files.** Each changed file opens in a diff: your code on the left,
   the step's version on the right. Every change has an **Accept / Reject** bar;
   there is also Accept file / Reject file in the editor title, Accept / Reject
   change at cursor in the right-click menu, and Next file. Files already
   matching the step drop out. Lockfiles and binaries are taken from the step.
3. **Finish.** Writes the files you decided and records a **merge commit**
   whose second parent is the step's tag, so a later `git merge <next step>`
   agrees with the extension and a rejected change stays rejected. Uncommitted
   work in other files stays uncommitted. On a workshop branch, your work first
   moves to `<github-username>/<workshop>`.

Nothing is written before Finish. Setting `devdogsWorkshops.autoCommit` (on by
default): turn it off to stage the result and leave a merge in progress, so your
own commit records the merge.

If the review came from a docs link with a `session`, Finish opens the next
step's docs page: `https://devdogsuga.org<docs path>#done=<step tags>&session=<id>`.

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
xvfb-run -a pnpm --filter workshops test:vscode   # real VS Code (see below)
```

`test:vscode` downloads VS Code once (`.vscode-test/`), clones the web workshop
submodule into a temp dir, and drives a `/review` link through activation, the
step list, a command in the Workshop terminal, the diff review and Finish. It
needs the slides submodules checked out; `xvfb-run` is only for headless hosts.

`src/core` is pure Node (merge engine, tags, branch decisions) and never imports
`vscode`; `src/extension` is the thin VS Code shell around it.
