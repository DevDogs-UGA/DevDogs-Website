---
layout: section-divider
accent: indigo
kicker: "03 · Feature Competition"
chip: COMPETITION
---

# This Week's Competition

<!-- Presenter notes: Transition into the competition block: this is the main way members contribute code to the real DevDogsUGA platform. -->

---
layout: numbered-list
accent: indigo
chip: TEAM MIXER
---

# Team Mixer

- You're already sitting with your track, so your future teammates are right next to you
- Two-minute rounds: say hi, share what you'd love to build, then swap seats
- Found your people? Teams are 2 to 4, so lock it in!
- Make it official at **devdogsuga.org/teams**
- Still flying solo when time's up? A focus lead will match you with a crew

<!-- Presenter notes: The room split already happened at the top of the night (preshow), so the mixer is inside each track, not across them. Point out the focus leads by name and location before starting the timer, and call time on each two-minute round. -->

---
layout: numbered-list
accent: indigo
chip: ENTER
---

# Enter the Competition

- Turn On GitHub 2FA
  - Settings → Password and authentication → Enable two-factor authentication
- Get on a Team
  - Create one or join one at devdogsuga.org/teams
- Work on Your Team's Branch
  - Commit and push to your team's `team/<your-team>` branch
- Open a Pull Request into Main Linking the Issue
  - `Closes #123` in the description links the issue and closes it when the PR merges

<!-- Presenter notes: This maps 1:1 to docs/platform/guides/meetings-and-teams/competitions.md: a competition is a GitHub issue; merging the winning PR is the only "who won" the platform records. Entries close Monday, Oct 5, when the meeting starts; say it out loud. 2FA blocks every team action, so get it on tonight, before the mixer ends. `Closes`, `Fixes`, and `Resolves` are GitHub's closing keywords: in a PR description they link the issue, and merging the PR closes it. Stars only count if your entry PR opened before the issue closed, so open a draft PR early rather than waiting until it's polished. -->

---
layout: bullets-code
accent: indigo
chip: TEAMWORK
heading: Working as a Team
label: Terminal
file: ~/DevDogsUGA
---

- Pull before you push
- Merge `main` into your branch often: never rebase or force-push the team branch
- Run lint, typecheck, and tests before you push
- Split the work: smaller changes, fewer conflicts

::code::

```bash {*}{cwd:'~/DevDogsUGA',branch:'team/our-slug'}
# Start of every session: get your team's latest commits
git pull
# Bring main into your branch
git fetch origin
git merge origin/main
# Sync dependencies, then start the dev server
pnpm install
pnpm dev
```

<!-- Presenter notes: This routine card is what to run at the start of every work session on the team branch, in order: pull first so you're never pushing on top of stale history, then sync main in before you start new work so today's conflicts are small ones. -->

---
layout: dual-code
accent: indigo
chip: CONFLICTS
heading: A Conflict, Then Resolved
leftLabel: In the File
leftFile: ~/components/TeamCard.tsx
rightLabel: In VS Code
rightFile: ~/components/TeamCard.tsx
trackSplit: false
---

````md magic-move {lines: true}
```tsx {1-6|10-17}
<<<<<<< HEAD
import { Avatar } from "./Avatar";
import { formatMembers } from "../lib/format";
=======
import { Avatar, AvatarGroup } from "./Avatar";
>>>>>>> team/our-slug

export function TeamCard({ team }: { team: Team }) {
  return (
    <div className="rounded-lg border p-4">
<<<<<<< HEAD
      <h3 className="font-semibold">{team.name}</h3>
      <p className="text-sm text-gray-500">{formatMembers(team.members)}</p>
=======
      <h3 className="text-lg font-bold">{team.name}</h3>
      <AvatarGroup members={team.members} max={4} />
>>>>>>> team/our-slug
    </div>
  );
}
```
```tsx {1-2|7-9}
import { Avatar, AvatarGroup } from "./Avatar";
import { formatMembers } from "../lib/format";

export function TeamCard({ team }: { team: Team }) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-lg font-bold">{team.name}</h3>
      <p className="text-sm text-gray-500">{formatMembers(team.members)}</p>
      <AvatarGroup members={team.members} max={4} />
    </div>
  );
}
```
````

::right::

<ScreenshotOrPlaceholder src="/vscode-merge-conflict.png" alt="VS Code showing the two conflicts in TeamCard.tsx, each with Accept Current Change, Accept Incoming Change, and Accept Both Changes" />

<CodeTips :accents="{ 2: 'amber' }">
<template #0>

Pick **Accept Current**, **Incoming**, or **Both** on each conflict, then save.

</template>
<template #2>

Conflict in `pnpm-lock.yaml`? Don't edit it by hand. Run `pnpm install` and commit the result.

</template>
</CodeTips>

<!-- Presenter notes: Two conflicts in one file: the imports and the card body. Walk the markers (HEAD is what's on your branch, the other side is what's coming in), then click through to the resolved file: keep both imports, the bolder heading, the member count, and the avatars. The right column is stock VS Code showing the same conflicts; point out the Accept buttons above each one. Once the file is resolved, the hint turns to the lockfile: it's the single most common panic moment. -->

---
layout: numbered-list
accent: indigo
chip: AVOID CONFLICTS
---

# Avoiding Them in the First Place

- Pull often, so your branch doesn't drift for days
- Commit small, commit often
- Split files where you can: two people editing the same function is where conflicts live
- Stuck for 20 minutes? Ask in <DiscordChannel name="tech-support" forum /> on Discord

<!-- Presenter notes: Prevention is cheaper than resolution, and most of this list is just "talk to your team." The tech-support forum on the DevDogs Discord is the place to ask: one post per problem, so answers stay findable. -->

---
layout: numbered-list
accent: indigo
chip: PULL REQUESTS
---

# Making a Pull Request

- Link the Feature Issue
  - `Closes #123` in the description tells reviewers what it's for
- Show It Working
  - Add screenshots or a short screen recording of the feature
- Run the Checks Before You Push
  - `pnpm format:write`, `lint`, `typecheck`, and `test`: what CI runs
- Keep It Small, and Explain It
  - What changed, why, and how a reviewer can try it

<!-- Presenter notes: CI runs format:check, lint, typecheck, test, and build on every PR; running them locally first saves a red X and a round trip. Screenshots matter most for UI features: reviewers shouldn't have to check out your branch to see what it looks like. -->

---
layout: statement
accent: indigo
chip: RECAP KAHOOT
---

# Recap Kahoot (Optional)

Huddle up, grab one phone per team, and pick a name you'll regret later. Fastest fingers get bragging rights!

<!-- Presenter notes: Optional recap round: Supabase, competition rules, and git, plus a few just-for-fun questions. Skip it entirely if you're short on time; nothing here is load-bearing for the competition. This is a DIFFERENT Kahoot from the warm-up one at the very start of the deck; don't confuse the two when scripting the night. Project the game PIN before starting, if you're running it. -->

---
layout: features
accent: indigo
chip: THIS WEEK
heading: This Week's Features
---

- Feature title (#issue)
- Feature title (#issue)
- Feature title (#issue)

::mobile::

- Feature title (#issue)
- Feature title (#issue)
- Feature title (#issue)

<!-- Presenter notes: TEMPLATE: fill in this week's feature issues for each project before the meeting. Each links to its issue on github.com/DevDogsUGA/DevDogsUGA/issues (the repo is private, so members need to be signed in to see them). -->
