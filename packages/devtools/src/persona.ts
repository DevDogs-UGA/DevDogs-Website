/**
 * `persona <member|moderator>` / `persona --clean` — throwaway accounts for
 * a development database.
 *
 * These replace the seeded `member@devdogs.test` / `author@devdogs.test` /
 * `moderator@devdogs.test` personas that used to come from
 * `supabase/seed/development/02_moderation.sql`. That file — and the rest of
 * `supabase/seed/development/` — is going away in the app repo, so a fresh
 * `db reset` no longer leaves a signed-in account to switch to; this is what
 * creates one on demand instead.
 *
 * Every account this creates lives at `<kind>-<8 hex>@persona.test`: a
 * domain that cannot collide with a real UGA address, and — not
 * coincidentally — the same reason it can exist here at all. `.createUser`
 * goes through GoTrue's ADMIN API, which inserts the row directly rather
 * than running the app's `before_user_created` Auth Hook (the one that
 * requires a uga.edu address on the sign-up/OTP paths a real member takes).
 * The admin API was never wired to that hook, so a `@persona.test` address
 * sails through here uncontested.
 *
 * `--clean` deletes every account this command created — matched on BOTH the
 * `@persona.test` domain AND a `user_metadata.createdBy` marker, never the
 * domain alone. A shared development database can carry `@persona.test`
 * accounts this command did not create — CI's own fixtures, most likely, or
 * a `moderation check` run whose `withTemporaryModerator` teardown never
 * reached its `finally` because the process was killed. The marker is what
 * keeps `--clean` from reaching past accounts it is not responsible for.
 */
import { randomUUID } from "node:crypto";
import { confirm, log, note, select } from "@clack/prompts";
import type { DbConnection } from "./db/connection.js";
import {
  adminClient,
  resolveInstance,
  type Instance,
} from "./instance.js";
import { grantModerator } from "./moderation.js";
import { explain, unwrap } from "./ui.js";

export const PERSONA_KINDS = ["member", "moderator"] as const;
export type PersonaKind = (typeof PERSONA_KINDS)[number];

export function isPersonaKind(value: string): value is PersonaKind {
  return (PERSONA_KINDS as readonly string[]).includes(value);
}

/** Every account this command creates carries this in `user_metadata`, and
 * `--clean` refuses to delete anything without it — see the header. */
const CREATED_BY = "devtools persona";

function personaEmail(kind: PersonaKind): string {
  return `${kind}-${randomUUID().slice(0, 8)}@persona.test`;
}

/** Nobody needs to remember this — it is printed once, for whoever asked. */
function randomPassword(): string {
  return randomUUID() + randomUUID();
}

/**
 * Refuses outside development — a staging or production database has real
 * members on it, and this command exists to populate one that does not.
 * Exported so `cli.ts`'s `moderation check` (also development-only now, for
 * the same reason) shares the exact refusal wording.
 */
export function refuseUnlessDevelopment(
  connection: DbConnection,
  label: string,
): boolean {
  if (connection.tier === "development") return false;
  process.stderr.write(
    `${label}: only runs against a development database — this session ` +
      `targets ${connection.tier}. Relaunch with --tier development:local ` +
      "or development:remote.\n",
  );
  return true;
}

export interface CreatedPersona {
  email: string;
  password: string;
  userId: string;
  preferredName: string;
}

/**
 * Creates the account and its profile — `userId` and `preferredName` are the
 * only two columns `platform.profile` requires (see the migration; every
 * other column is nullable or defaulted), which is why this needs nothing
 * from `02_moderation.sql`'s richer INSERT beyond the shape of the two rows
 * it wrote. Grants the Moderator role too, for `kind === "moderator"`.
 */
async function createPersona(
  instance: Instance,
  kind: PersonaKind,
): Promise<CreatedPersona> {
  const admin = adminClient(instance);
  const email = personaEmail(kind);
  const password = randomPassword();
  const preferredName =
    kind === "moderator" ? "Devtools Moderator" : "Devtools Member";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { createdBy: CREATED_BY },
  });
  if (error || !data.user) {
    throw new Error(`Could not create the account: ${error?.message}`);
  }
  const userId = data.user.id;

  const { error: profileErr } = await admin
    .from("profile")
    .insert({ userId, preferredName });
  if (profileErr) {
    throw new Error(`Could not create a profile: ${profileErr.message}`);
  }

  if (kind === "moderator") await grantModerator(admin, userId);

  return { email, password, userId, preferredName };
}

/** Any OTHER profile on this database, for a moderator persona to report —
 * `null` when this is the only account around, which the caller reports
 * rather than guessing at a subject that does not exist. */
async function findOtherProfile(
  instance: Instance,
  excludeUserId: string,
): Promise<{ userId: string; preferredName: string } | null> {
  const { data, error } = await adminClient(instance)
    .from("profile")
    .select("userId, preferredName")
    .neq("userId", excludeUserId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not read platform.profile: ${error.message}`);
  return data as { userId: string; preferredName: string } | null;
}

/**
 * Files one open report, mirroring the "one open report" `02_moderation.sql`
 * used to seed — inserted directly rather than through
 * `platform.file_report()`, the same reasoning that seed's own comment gave:
 * neither a seed nor this command has a session to attribute the RPC call to.
 */
async function fileSampleReport(
  instance: Instance,
  reporterId: string,
  subjectId: string,
  subjectName: string,
): Promise<void> {
  const admin = adminClient(instance);
  const { data: app, error: appErr } = await admin
    .from("apps")
    .select("id")
    .eq("slug", "platform")
    .single();
  if (appErr || !app) {
    throw new Error(
      `Could not find the platform app row: ${appErr?.message}`,
    );
  }

  const { error } = await admin.from("reports").insert({
    appId: app.id as string,
    reporterUserId: reporterId,
    reportedUserId: subjectId,
    contentType: "profile",
    contentRef: subjectId,
    contentSnapshot: subjectName,
    description:
      "Filed by `pnpm devtools persona` so the moderation queue has something in it.",
    reason: "spam",
  });
  if (error) {
    throw new Error(`Could not file the sample report: ${error.message}`);
  }
}

async function runClean(instance: Instance): Promise<void> {
  const admin = adminClient(instance);
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw new Error(`Could not list accounts: ${error.message}`);

  // Both conditions — see the header on why the domain alone is not enough.
  const targets = data.users.filter(
    (u) =>
      u.email?.endsWith("@persona.test") &&
      u.user_metadata?.createdBy === CREATED_BY,
  );

  if (targets.length === 0) {
    log.info("No `pnpm devtools persona`-created accounts to clean up.");
    return;
  }

  // Deleting the auth user cascades to its profile, its Moderator role grant
  // (if any) and any reports it filed or was reported in — every FK a
  // persona account touches is `on delete cascade` — so there is nothing
  // else to clean up per account.
  for (const user of targets) {
    await admin.auth.admin.deleteUser(user.id);
    log.success(`Deleted ${user.email}.`);
  }
  log.info(
    `Deleted ${targets.length} account${targets.length === 1 ? "" : "s"}.`,
  );
}

export async function runPersona(argv: string[]): Promise<void> {
  const clean = argv.includes("--clean");
  const positional = argv.find((arg) => !arg.startsWith("--"));

  if (clean && positional) {
    explain(
      "Two answers to one question.",
      "--clean deletes every account this command made; a kind creates a new one.",
      ["pnpm devtools persona member", "pnpm devtools persona --clean"],
    );
    process.exitCode = 1;
    return;
  }

  const resolved = await resolveInstance({ label: "devtools persona" });
  if (!resolved) {
    process.exitCode = 1;
    return;
  }
  const { connection, instance } = resolved;
  if (refuseUnlessDevelopment(connection, "devtools persona")) {
    process.exitCode = 1;
    return;
  }

  if (clean) {
    await runClean(instance);
    return;
  }

  let kind: PersonaKind;
  if (positional) {
    if (!isPersonaKind(positional)) {
      explain(`"${positional}" is not a persona kind.`, "", [
        "pnpm devtools persona member",
        "pnpm devtools persona moderator",
      ]);
      process.exitCode = 1;
      return;
    }
    kind = positional;
  } else {
    kind = unwrap(
      await select({
        message: "Which kind of persona?",
        options: PERSONA_KINDS.map((value) => ({ value, label: value })),
      }),
    );
  }

  const persona = await createPersona(instance, kind);
  note(
    `Email:    ${persona.email}\nPassword: ${persona.password}`,
    `${kind} persona created`,
  );

  const fileReport = unwrap(
    await confirm({
      message:
        "File a sample report against a member profile, so the moderation queue isn't empty?",
      initialValue: kind === "moderator",
    }),
  );
  if (!fileReport) return;

  // A member persona reports itself — there is no separate reporter account
  // on offer here, and nothing downstream cares who filed it, only that the
  // queue has one open report to practice resolving. A moderator persona
  // reports whatever OTHER profile already exists.
  const subject =
    kind === "member"
      ? { userId: persona.userId, preferredName: persona.preferredName }
      : await findOtherProfile(instance, persona.userId);

  if (!subject) {
    log.warn(
      "No other account to report yet — run `pnpm devtools persona member` first.",
    );
    return;
  }

  await fileSampleReport(
    instance,
    persona.userId,
    subject.userId,
    subject.preferredName,
  );
  log.success(
    "Filed a sample report. Resolve it from /console/moderation.",
  );
}
