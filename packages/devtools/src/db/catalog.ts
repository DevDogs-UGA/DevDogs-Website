/**
 * `db`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { JSON_FLAG, YES, type CommandNode } from "@devdogsuga/cli-core/catalog";
import { plannerCommand } from "../planner/catalog.js";

export const dbCommand: CommandNode = {
  name: "db",
  summary: "Supabase endpoints, and the databases inside them.",
  hint: "start, migrate, reset, types…",
  subcommands: [
    // ── machine — Supabase on this machine ─────────────────────────
    {
      name: "start",
      summary: "Start Supabase on this machine.",
      hint: "boots the Docker containers",
      scope: "machine",
      when: "instance-stopped",
    },
    {
      name: "connect",
      summary: "Run `supabase link` against a hosted project ref.",
      hint: "for driving the bare supabase CLI by hand",
      scope: "machine",
    },
    {
      name: "stop",
      summary: "Shut it down, freeing its containers.",
      hint: "your data survives",
      scope: "machine",
      // Not offered while nothing is running: "stop" against a stopped
      // stack is the one shape of question a menu should never ask.
      when: "instance-running",
    },
    {
      name: "restart",
      summary: "Stop it, then start it again.",
      // The reason this exists rather than being a footnote on `reset`:
      // `config.toml` is read at `supabase start`, so a reset replays
      // migrations into containers still holding the old settings.
      hint: "the only way to pick up config.toml — reset will not",
      scope: "machine",
      when: "instance-running",
    },
    // ── repo — files in the repo, no live connection ───────────────
    {
      name: "migration",
      summary: "Empty timestamped migration files, hand-authored.",
      scope: "repo",
      subcommands: [
        {
          name: "new",
          summary: "Create an empty timestamped migration file.",
          hint: "<timestamp>_<schema>_<description>.sql",
          options: [
            {
              flag: "--app",
              value: "<slug>",
              summary: "Whose schema. Asked for when absent.",
            },
          ],
        },
      ],
    },
    // ── endpoint — the session's database ──────────────────────────
    {
      name: "status",
      summary: "Report the session database's health, URLs and keys.",
      hint: "reads only",
      scope: "endpoint",
      options: [JSON_FLAG],
    },
    {
      name: "migrate",
      summary: "Apply new migrations to the database.",
      hint: "without erasing anything",
      scope: "endpoint",
      options: [YES],
    },
    {
      name: "reset",
      summary: "Rebuild the database: migrations, seeds, types, buckets.",
      hint: "⚠️  erases the database first",
      scope: "endpoint",
      options: [YES],
    },
    {
      name: "types",
      summary: "Regenerate database.types.ts, format it, rebuild the package.",
      hint: "after any schema change",
      scope: "endpoint",
      options: [],
    },
    {
      name: "seed",
      summary: "Seed storage buckets or the platform's role catalogue.",
      scope: "endpoint",
      subcommands: [
        {
          name: "buckets",
          summary: "Create the storage buckets config.toml declares.",
          options: [],
        },
        {
          name: "roles",
          summary: "Reconcile the platform's role catalogue.",
          options: [],
        },
        {
          name: "production",
          summary: "Apply supabase/seed/production/*.sql — roles and officers.",
          hint: "confirms before writing to a hosted database",
          options: [YES],
        },
      ],
    },
    {
      name: "introspect",
      summary: "Pull an app's live schema into its generated Drizzle files.",
      scope: "endpoint",
      options: [
        {
          flag: "--app",
          value: "<slug>",
          summary: "App whose schema to pull. Asked for when absent.",
        },
      ],
    },
    {
      name: "config",
      summary: "The Supabase config.toml, pushed to the session's project.",
      scope: "endpoint",
      subcommands: [
        {
          name: "push",
          summary: "Push config.toml to the session's hosted project.",
          hint: "hosted sessions only",
          options: [],
        },
      ],
    },
    // ── infra — hosted infrastructure, each naming its own connection
    plannerCommand,
    // ── unscoped — the escape hatch ─────────────────────────────────
    {
      name: "exec",
      summary: "Run the Supabase CLI. Everything after -- passes through.",
      hint: "the escape hatch",
    },
  ],
};
