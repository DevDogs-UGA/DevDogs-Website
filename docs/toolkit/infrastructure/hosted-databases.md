---
name: Hosted databases
description: The maintainer-only half of the database tooling — pushing config.toml to a hosted project, migrating one, and the commands that manage hosted infrastructure.
order: 4
section: infrastructure
---

# Hosted databases

The contributor-facing half — sessions, `db push`, `db reset`, types — is
[Running the database](../guides/devtools-db.md). This page is the
rest: the commands that operate on a hosted Supabase project (staging or
production) rather than the local Docker stack, and that a maintainer or
officer runs, not a contributor working on a feature. The migrations are
authored here, but staging and production are only ever migrated by the deploy
pipeline in [Backstage](https://github.com/DevDogsUGA/Backstage).

## Linking a project

`supabase link --project-ref <project-ref>` is for anyone driving the bare
`supabase` CLI by hand against a hosted project. Nothing in devtools reads the
link state it writes — `pnpm devtools supabase …` always fills in `--db-url` or
`--project-ref` from the session's tier instead, and never falls back to the
linked project.

## Pushing config to a hosted project

`pnpm devtools push-config` pushes `config.toml` to the session's hosted
project (`--yes` answers its confirmation). A local session is refused and
offered a restart instead — the stack reads the file directly at
`supabase start`, so there is nothing to push there.

## Managing hosted infrastructure

`backstage planner` (run from a Backstage clone, see [devtools](../guides/devtools.md#what-lives-elsewhere)) manages the `migration_planner` role the preflight tier
holds, which names its own connection (`--db-url`, defaulting to
`.env.production`'s `DB_URL`) separately from any session. `status` reports what
the preflight credential can reach, `create` mints the role and writes
`.env.preflight`, `reset-password` rotates the password, and `drop` removes the
role. These are provisioning and credential rotation, not anything that touches
the project's data.

## Applying a migration to a hosted tier

| Target                 | How                                                        |
| ---------------------- | ---------------------------------------------------------- |
| the shared dev project | `pnpm devtools --tier development:remote apply-migrations` |
| staging                | `staging-database` in `.github/workflows/deploy.yaml`      |
| production             | `production-database` in `.github/workflows/deploy.yaml`   |

`apply-migrations` runs `supabase db push --db-url` against the
session's database — only the migrations its history table has not recorded.

The deploy applies a tier in two parts through the shared `deploy-database.yaml`
([How a deploy works](../../operations/deploys/how-a-deploy-works.md)): first
the hand-written migrations in `supabase/migrations/` (with `--include-seed`, so
the seed files a tier has not recorded run right after them), then the diff
between the database and the declarative tree in `supabase/schemas/`. Each part
is planned first under a read-only credential, approved, then applied against
the plan's hash, so a database that moved between plan and apply changes
nothing (see [Migrations](../../platform/guides/migrations.md)'s "Seeds"). A plan that drops
or rewrites data needs a further approval:
[Destructive changes](../../operations/deploys/destructive-changes.md).

> [!WARNING]
> Never run `drizzle-kit push` against a hosted database: it writes the
> schema with no migration record and no rollback path. No script in either
> repo runs it, and none should.
