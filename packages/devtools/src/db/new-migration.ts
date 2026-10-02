/**
 * `db migration new --app <slug> <description>`
 *
 * One flat `supabase/migrations/` directory, shared by every app, so the
 * filename is the only thing that says whose schema a migration belongs to.
 * Contract: `<timestamp>_<schema>_<description>.sql`, where `schema` is
 * `platform`, `schedule_builder`, or `study_group_finder` — never the
 * app slug verbatim (schedule-builder's schema is `schedule_builder`, with
 * an underscore, because it is a Postgres identifier).
 *
 * The supabase CLI already produces `<timestamp>_<name>.sql` from `migration
 * new <name>` — its own clock, not ours, which is the part CI's
 * newer-than-main check actually cares about — so this only has to build
 * `name` as `<schema>_<description>` and hand it off unchanged.
 */
import { select, text } from "@clack/prompts";
import { unwrap } from "@devdogsuga/cli-core/ui";
import { supabase } from "@devdogsuga/cli-core/db/run";

/** App slug -> Postgres schema name. Schedule Builder and Study Group
 * Finder use underscores; their slugs use hyphens. */
export const APP_SCHEMAS: Record<string, string> = {
  platform: "platform",
  "schedule-builder": "schedule_builder",
  "study-group-finder": "study_group_finder",
};

/** Builds the `supabase migration new` name argument — `<schema>_<desc>` —
 * given an app slug and a free-text description. Pure, so the naming rule
 * is testable without spawning the CLI. */
export function migrationName(
  appSlug: string,
  description: string,
): string | null {
  const schema = APP_SCHEMAS[appSlug];
  if (!schema) return null;

  const slug = description
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) return null;

  return `${schema}_${slug}`;
}

async function pickApp(): Promise<string> {
  return unwrap(
    await select({
      message: "Whose schema is this migration for?",
      options: Object.keys(APP_SCHEMAS).map((value) => ({
        value,
        label: value,
      })),
    }),
  );
}

export async function runNewMigration(
  appArg: string | undefined,
  descriptionArg: string | undefined,
): Promise<number> {
  const app = appArg ?? (await pickApp());
  if (!APP_SCHEMAS[app]) {
    process.stderr.write(
      `devtools new-migration: unknown app "${app}". Expected one of: ${Object.keys(APP_SCHEMAS).join(", ")}.\n`,
    );
    return 1;
  }

  const description =
    descriptionArg ??
    unwrap(
      await text({
        message: "Short description (used as the migration's filename)",
        placeholder: "add_widgets_table",
        validate: (v) => (v?.trim() ? undefined : "Required"),
      }),
    );

  const name = migrationName(app, description);
  if (!name) {
    process.stderr.write(
      "devtools new-migration: the description left nothing usable in the filename.\n",
    );
    return 1;
  }

  return supabase("migration", "new", name);
}
