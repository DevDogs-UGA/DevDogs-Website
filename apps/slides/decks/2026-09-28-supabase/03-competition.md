---
layout: section-divider
accent: red
kicker: "03 · Feature competition"
chip: COMPETITION
---

# This week's competition

<!-- Presenter notes: Transition into the competition block — this is the main way members contribute code to the real DevDogsUGA platform. -->

---
layout: numbered-list
accent: red
chip: HOW IT WORKS
---

# How it works

- Entries close **Friday, Oct 5 · 6:30 PM**
- The next competition starts **Monday, Oct 12** — the week off is on purpose (midterms + career fair)
- Scoring happens off-platform (demo night, officer + member votes) — the rules live in the docs, not on the site

<!-- Presenter notes: This maps 1:1 to docs/platform/guides/meetings-and-teams/competitions.md — a competition is a GitHub issue; merging the winning PR is the only "who won" the platform records. -->

---
layout: bullets-card
accent: red
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
accent: red
chip: ENTER
---

# Enter the competition

- Turn on **GitHub 2FA** (Settings → Password and authentication) — required before any team action
- Get on a team at **devdogsuga.org/teams**
- Pick an issue from the Competitions project

<!-- Presenter notes: Callouts to say out loud: get 2FA on tonight, before the mixer ends -- it blocks every team action. -->

---
layout: numbered-list
accent: red
chip: ENTER
---

# Enter the competition

- Work on your team's branch, **`team/<slug>`**
- Open an **early draft** pull request into `main` that links the issue — `Closes #123`

<!-- Presenter notes: Stars only count if your entry PR opened before the issue closed, so open the draft PR early rather than waiting until it's polished. -->

---
layout: bullets-card
accent: red
chip: TEAMWORK
cardTitle: Start of every session
---

# Working as a team

- Pull before you push
- Never force-push the team branch
- Run lint, typecheck, and tests before you push
- Split the work — smaller changes, fewer conflicts

::card::

```bash
git pull
pnpm install
pnpm dev
```

<!-- Presenter notes: This routine card is what to run at the start of every work session on the team branch, in order — pull first so you're never pushing on top of stale history. -->

---
layout: dual-code
accent: red
chip: CONFLICTS
heading: A conflict, then resolved
leftFile: components/Feature.tsx
rightFile: components/Feature.tsx
leftLabel: Before
rightLabel: After
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

VS Code's merge editor: **Accept Current**, **Accept Incoming**, or **Accept Both** — pick per block, then save.

> Conflict in `pnpm-lock.yaml`? Don't edit it by hand — run `pnpm install` and commit the result.

<!-- Presenter notes: Walk through the conflict markers, then Magic Move to the resolved file. Emphasize the lockfile callout — it's the single most common panic moment. -->

---
layout: numbered-list
accent: red
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
accent: red
chip: THIS WEEK
cardTitle: Find the issues
---

# This week's features

- The Competitions board lives in the GitHub org's Projects — ask an officer if the link below is stale
- Small PRs with screenshots review faster
- Ask early — Wednesday dev sessions and Discord are both open all week

::card::

**github.com/orgs/DevDogsUGA/projects**

<!-- Presenter notes: `gh project list --owner DevDogsUGA` is the live way to find the exact project number and link from a laptop with the right token scopes — this slide's URL is the org-level projects listing as a stable fallback. Confirm the exact project link before the workshop if it's easy to grab. -->

---
layout: statement
accent: red
chip: KAHOOT
---

# Team Kahoot

Get with your team — one phone per team is enough.

<!-- Presenter notes: Kahoot round — Supabase, competition rules, git, and a few just-for-fun questions. Project the game PIN before starting. -->
