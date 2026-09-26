---
layout: section-divider
accent: indigo
kicker: "03 · Feature competition"
chip: COMPETITION
---

# This week's competition

<!-- Presenter notes: Transition into the competition block — this is the main way members contribute code to the real DevDogsUGA platform. -->

---
layout: bullets-card
accent: indigo
chip: TEAM MIXER
cardTitle: Right now
---

# Team mixer

- The room is already split by track (you're sitting with your projector's people)
- Corners, 2-minute rounds — meet a few people before you commit
- Lock in a team: **2–4 members**

::card::

1. Create or join at **devdogsuga.org/teams**
2. No team yet when we start? Find a focus lead — they'll place you

<!-- Presenter notes: The room split already happened at the top of the night (preshow), so the mixer is inside each track, not across them. Point out the focus leads by name/location before starting the timer. -->

---
layout: numbered-list
accent: indigo
chip: ENTER
---

# Enter the competition

- Entries close **Monday, Oct 5**, when the meeting starts
- Turn on **GitHub 2FA**
  - Settings → Password and authentication → Enable two-factor authentication
- Get on a team at **devdogsuga.org/teams**
- Feature requirements live in the **GitHub issues**: `github.com/DevDogsUGA/DevDogsUGA/issues`

<!-- Presenter notes: This maps 1:1 to docs/platform/guides/meetings-and-teams/competitions.md — a competition is a GitHub issue; merging the winning PR is the only "who won" the platform records. Callout to say out loud: get 2FA on tonight, before the mixer ends -- it blocks every team action. Entries close when the meeting starts, not at some specific time during it, so there's no clock-watching. -->

---
layout: numbered-list
accent: indigo
chip: ENTER
---

# Enter the competition

- Work on your team's branch, **`team/<slug>`**
- Open an **early draft** pull request into `main` that links the issue — `Closes #123`

<!-- Presenter notes: Stars only count if your entry PR opened before the issue closed, so open the draft PR early rather than waiting until it's polished. -->

---
layout: bullets-card
accent: indigo
chip: TEAMWORK
cardTitle: Start of every session
---

# Working as a team

- Pull before you push
- Merge `main` into your branch regularly — merge, never rebase, and never force-push the team branch
- Run lint, typecheck, and tests before you push
- Split the work — smaller changes, fewer conflicts

::card::

```bash {*}{cwd:'~/DevDogsUGA'}
git pull               # latest team commits
git fetch origin       # fetch main
git merge origin/main  # merge main in
pnpm install           # sync deps
pnpm dev               # start dev server
```

<!-- Presenter notes: This routine card is what to run at the start of every work session on the team branch, in order — pull first so you're never pushing on top of stale history, then sync main in before you start new work so today's conflicts are small ones. -->

---
layout: dual-code
accent: indigo
chip: CONFLICTS
heading: A conflict, then resolved
leftFile: ~/components/Feature.tsx
rightFile: ~/components/Feature.tsx
leftLabel: Before
rightLabel: After
trackSplit: false
---

````md magic-move
```ts
<<<<<<< HEAD
export const greeting = "Hello from main";
=======
export const greeting = "Hi from our branch";
>>>>>>> team/our-slug
```
```ts
export const greeting = "Hi from our branch";
```
````

::right::

<ScreenshotOrPlaceholder src="/vscode-merge-editor.png" alt="VS Code's merge editor resolving the conflict in Feature.tsx" />

VS Code's merge editor: **Accept Current**, **Accept Incoming**, or **Accept Both** — pick per block, then save.

::bottom::

> Conflict in `pnpm-lock.yaml`? Don't edit it by hand — run `pnpm install` and commit the result.

<!-- Presenter notes: Walk through the conflict markers, then Magic Move to the resolved file. The right column is a live VS Code screenshot of the same conflict, resolved via the Merge Editor -- point out Accept Current / Incoming / Both. Emphasize the lockfile callout at the bottom — it's the single most common panic moment. -->

---
layout: numbered-list
accent: indigo
chip: AVOID CONFLICTS
---

# Avoiding them in the first place

- Pull often — don't let your branch drift for days
- Commit small, commit often
- Split files where you can — two people editing the same function is where conflicts live
- Ask on Discord before you're stuck for 20 minutes

<!-- Presenter notes: Prevention is cheaper than resolution — most of this list is just "talk to your team." -->

---
layout: bullets-card
accent: indigo
chip: THIS WEEK
cardTitle: Find the issues
---

# This week's features

- The repo is private, so features live under its own **Issues** page, not a public projects board
- Small PRs with screenshots review faster
- Ask early — Wednesday dev sessions and Discord are both open all week

::card::

**github.com/DevDogsUGA/DevDogsUGA/issues**

<!-- Presenter notes: This link only resolves for signed-in members with repo access, which is expected -- the project is private. `gh issue list --repo DevDogsUGA/DevDogsUGA` is the live way to check what's open from a laptop with the right access, if this slide's list looks stale. -->

---
layout: statement
accent: indigo
chip: RECAP KAHOOT
---

# Recap Kahoot (optional)

Get with your team — one phone per team is enough.

<!-- Presenter notes: Optional recap round -- Supabase, competition rules, and git, plus a few just-for-fun questions. Skip it entirely if you're short on time; nothing here is load-bearing for the competition, which is why it's the last slide of this section, right before Upcoming meetings, easy to jump past. This is a DIFFERENT Kahoot from the warm-up one at the very start of the deck -- don't confuse the two when scripting the night. Project the game PIN before starting, if you're running it. -->
