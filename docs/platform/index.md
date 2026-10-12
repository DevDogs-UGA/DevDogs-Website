---
name: Platform
description: The site, console, docs, and OAuth server.
order: 10
---

# Platform

The platform is the Next.js app behind the DevDogs site: the public pages, the officer console, these docs, and the OAuth server sibling projects sign in against. Its source (`apps/platform`) lives in the officers' [Backstage](https://github.com/DevDogsUGA/Backstage) repository, which also holds every deploy. Its database (migrations, seeds, `config.toml`), tests for that database, and these docs live here in DevDogsUGA. Read a guide here when you are working on one of its subsystems.

> [!TIP]
> New here? Start at [Getting started](../_shared/getting-started/prerequisites.md) — installing the toolchain, a database, and running the app. Platform code changes are pull requests against Backstage; [Your first contribution](./getting-started/first-contribution.md) sets up both repos side by side.

## Architecture, briefly

One Next.js app on Cloudflare Workers (vinext, not OpenNext), owning the
`platform` schema in the shared Supabase project. Sibling apps never call the
shared database directly; they can let a member sign in with their DevDogs
account through the OAuth server this app also runs — see
[Getting started: Running](../_shared/getting-started/running.md).

## Glossary

- **Meeting** — a general body meeting or workshop, authored as config in Backstage and reconciled here. See [Events](./infrastructure/events.md).
- **Attendance** — a member's authoritative meeting check-in, the input every star and streak derives from. See [Attendance](./guides/meetings-and-teams/attendance.md).
- **Star / streak** — a derived participation passport, not a stored score: one per credit-eligible meeting attended. See [Stars & Streaks](./guides/meetings-and-teams/stars-and-awards.md).
- **Moderation report** — a complaint against member-written content, resolved into a quarantine or a sanction. See [Reporting](./guides/reporting/index.md) and [Moderation](./guides/moderation/index.md).

## Guides

[Where things live](./guides/where-things-live.md) for a path table, [Testing](./guides/testing.md) for the suites, and [Meetings](./guides/meetings-and-teams/index.md), [Reporting](./guides/reporting/index.md), [Moderation](./guides/moderation/index.md), and [Navigation](./guides/navigation.md) for the domain model and the contracts other apps build against.

## Infrastructure

Maintainer and officer-only material: [Identity](./guides/identity/index.md) (the OAuth server), [Writing a migration](./guides/migrations.md) (the migration loop), and [Events](./infrastructure/events.md) (club config).
