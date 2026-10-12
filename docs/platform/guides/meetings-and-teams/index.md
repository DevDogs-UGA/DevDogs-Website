---
name: Meetings
description: The shape of club participation, meetings and the workshops that run inside them, and how attendance attaches to them.
order: 1
section: guides
---

# Meetings

DevDogs meets weekly. Each meeting runs one or more **workshops** in parallel, one per project. Read this page before touching anything that reads `platform.meetings` or `workshops`. If you only need a function signature, skip to the loaders under `apps/platform/src/server/loaders/` instead.

Teams and competitions are gone. The platform used to mirror GitHub competition issues and team branches; scoring was always off-platform, and Merge Monday replaced the competition format. Their data was exported to `archive/` before the tables were dropped (see [Retired: teams and competitions](#retired-teams-and-competitions)).

## Two rows, each answering one question

| Row         | Answers                                                         |
| ----------- | --------------------------------------------------------------- |
| `meetings`  | when and where the club gathered, and who showed up             |
| `workshops` | the teaching slot for one project recommendation at one meeting |

There is no `projects` table: a workshop's project is free text on the row (`workshops."project"`, e.g. "DogDays", nullable), not a foreign key. See [Events](../../infrastructure/events.md) for why.

Attendance attaches to the meeting with the workshop as a dimension. One constraint on `workshops` carries most of the remaining meaning: it declares `unique (id, "meetingId")` solely so attendance can declare a composite foreign key and have the database reject a row naming a workshop from another meeting.

## Where it lives

The meetings/workshops schema is `supabase/migrations/20260829040000_11_platform_events_core.sql`, amended in place for the config-as-code cutover: `meetings.countsTowardProgress` and `elEligible` merged into one `countsForCredit` flag, `meetings.surveyUrl` was added (and `configId` columns, since superseded by the authored slug), and `workshops.projectId` and the `projects` table were dropped in favor of `workshops."project"` as free text.

The code is in `apps/platform/src/server/`, under `config/` and `loaders/`. The scheduled pass that keeps meetings current is the config reconcile route (`/cron/config-reconcile`) under `app/(api)/cron/`. `cloudflare/scheduled.ts` is the one file that maps every cron expression to its route, so read it rather than guessing a path from a schedule.

## Read next

- [Attendance](./attendance.md) — the ledger and check-in.
- [Stars & streaks](./stars-and-awards.md) — what participation adds up to.
- [Events](../../infrastructure/events.md) — where meetings and workshops come from.

## Retired: teams and competitions

Before November 2026 a **team** was a persistent `team/<slug>` branch with a GitHub team and a per-team ruleset, and a **competition** was a GitHub issue the platform mirrored from a private Project, with each team's entry a linked pull request. Both lived in `platform` tables mirrored from GitHub through a GitHub App, a webhook route and a nightly reconcile.

All of that is deleted: the pages, the loaders, the GitHub App integration and its credentials, and the 2FA gate. Contributions now happen on forks, and membership in the GitHub organization is for officers, leads and reviewers. The last state of the tables is in `archive/` at the repository root, with a manifest of row counts taken from production before the tables were dropped.

## Why it's like this

<details>
<summary>Why was the earlier <code>(event, track, stage)</code> shape wrong?</summary>

An earlier draft had one `sessions` table keyed `(event, track, stage)`, with `stage` being `workshop | hackathon`. It failed once the real timeline was described:

- `startsAt` and `endsAt` are meaningless on a week-long async task. There is nothing to check into.
- The old competition star was defined as attendance on the hackathon session, which could never fire — nobody attends a week of async work.

The general shape of the error: **a table that mixes things you attend with things that merely have a duration.** Splitting them is what lets attendance key to something real, and it removed the discriminator entirely — there is no `eventStage` enum, which is the clearest sign the split was right.

</details>

<details>
<summary>Why is a workshop's project free text instead of its own table?</summary>

It used to be: `projects` was a table with a `displayName`, a `slug`, an `appId` linking it to `platform.apps` for moderation, and a `sortOrder` officers controlled. All of that was Airtable plumbing that outlived the reason it existed — the table was authored in Airtable like `meetings` and `workshops` were, and once those two moved to config-as-code the table had nothing left to justify a foreign key: a workshop names the body of work it recommends the same way an officer would say it out loud ("DogDays", "DogDays & DogPack"), and nothing else in the schema ever needed to join on it independently.

Dropping it removed a table, a foreign key, a sort column with no authoring surface (`projects."sortOrder"` had no UI that ever wrote it — see the schedule-builder rework notes for the general pattern of "a configuration point with no way to configure it"), and every `left join projects` in the loaders. A workshop's `title` still falls back to its `project` string exactly the way it used to fall back to the joined `displayName`; the fallback chain did not change, only what it is a join versus a column.

</details>
