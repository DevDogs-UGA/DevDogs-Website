/**
 * `backstage creds <send|add|renew|list|report>`: the club's shared logins,
 * shared as Bitwarden Sends that only the officers they name can open.
 *
 *   send    pick shared accounts and officers; create or update one Send each
 *   add     save a new login into the Shared Accounts collection, then send it
 *   renew   push every Send's deletion 30 days out and re-sync its recipients
 *   list    what is shared with whom, until when
 *   report  regenerate the Shared Accounts Linear document
 *
 * Bare `creds` at a terminal opens this group's menu.
 *
 * ## Where things live
 *
 * The values live only in the DevDogs Bitwarden organization's Shared
 * Accounts collection. Each item's custom fields record its recipients and its
 * Send (`item.ts`); the Linear document is generated from them (`report.ts`);
 * the roster of who may receive one is read live from production
 * (`roster.ts`).
 *
 * ## One Send per account
 *
 * Restricted by email verification to the item's recipients, deleted 30 days
 * out, extended in place so the link never changes. Revoking someone is
 * removing their address. A Send belongs to the officer who made it, so when
 * another officer renews it they get a new one (and a new link) under their
 * own account, and the item records that.
 *
 * ## Secrets
 *
 * No secret value reaches stdout, stderr, the failure log, Sentry, an error
 * message or argv. The preview masks the password as a fixed `••••••••` and
 * never shows the notes; values go to `bw` on stdin; errors are scrubbed
 * (`secrets.ts`); the clipboard only ever gets a link. `commands.test.ts`
 * runs every path with a sentinel password and looks for it everywhere.
 */
import { parseArgs } from "node:util";
import {
  confirm,
  log,
  multiselect,
  note,
  password as askPassword,
  text as askText,
} from "@clack/prompts";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { isNonInteractive } from "@devdogsuga/cli-core/mode";
import {
  errorMessage,
  explain,
  explainError,
  unwrap,
  UsageError,
} from "@devdogsuga/cli-core/ui";
import {
  connectSharedVault,
  type SendJson,
  type SharedVault,
} from "./bitwarden.js";
import { copyLink } from "./clipboard.js";
import {
  daysLeft,
  EXPIRES_SOON_DAYS,
  isoDay,
  previewBody,
  sendBody,
  sendStatus,
  splitEmails,
  withFields,
  type SharedItem,
} from "./item.js";
import {
  renderReport,
  resolveLinearToken,
  SHARED_ACCOUNTS_DOCUMENT_ID,
  writeReport,
  type Fetch,
} from "./report.js";
import {
  checkRecipients,
  describeRecipient,
  emailsForRoles,
  loadRoster,
  resolveRosterDbUrl,
  rosterQueryFor,
  type Roster,
  type RosterQuery,
} from "./roster.js";
import { CredsError, registerSecret, scrub } from "./secrets.js";

export const SUBCOMMANDS = ["send", "add", "renew", "list", "report"] as const;
export type Subcommand = (typeof SUBCOMMANDS)[number];

/** Seams for tests. Everything defaults to the real thing. */
export interface CredsDeps {
  now?: () => Date;
  vault?: () => Promise<SharedVault>;
  /** Replaces the production roster query (and the DB URL lookup before it). */
  rosterQuery?: RosterQuery;
  fetch?: Fetch;
  copy?: (link: string) => Promise<boolean>;
  readStdin?: () => Promise<string>;
}

interface Values {
  item?: string[];
  to?: string;
  role?: string;
  "allow-email"?: boolean;
  "db-url"?: string;
  "linear-token"?: string;
  "no-report"?: boolean;
  yes?: boolean;
  json?: boolean;
  name?: string;
  url?: string;
  username?: string;
  owner?: string;
  "password-stdin"?: boolean;
  document?: string;
}

function parse(argv: readonly string[]): { sub: Subcommand; values: Values } {
  const [sub, ...rest] = argv;
  if (!sub || !(SUBCOMMANDS as readonly string[]).includes(sub)) {
    throw new UsageError(
      sub
        ? `Unknown creds command "${sub}". Try ${SUBCOMMANDS.join(", ")}.`
        : `Name what to do: ${SUBCOMMANDS.join(", ")}.`,
    );
  }
  try {
    const { values } = parseArgs({
      args: rest,
      options: {
        item: { type: "string", multiple: true },
        to: { type: "string" },
        role: { type: "string" },
        "allow-email": { type: "boolean" },
        "db-url": { type: "string" },
        "linear-token": { type: "string" },
        "no-report": { type: "boolean" },
        yes: { type: "boolean" },
        json: { type: "boolean" },
        name: { type: "string" },
        url: { type: "string" },
        username: { type: "string" },
        owner: { type: "string" },
        "password-stdin": { type: "boolean" },
        document: { type: "string" },
        "dry-run": { type: "boolean" },
      },
      allowPositionals: false,
      strict: true,
    });
    if (values["db-url"]) registerSecret(values["db-url"]);
    if (values["linear-token"]) registerSecret(values["linear-token"]);
    return { sub: sub as Subcommand, values };
  } catch (err) {
    throw new UsageError(scrub(errorMessage(err)));
  }
}

/** Progress for a person; plain stderr lines when nobody is watching a terminal. */
function say(message: string, level: "info" | "success" | "warn" = "info") {
  if (isNonInteractive()) process.stderr.write(`${message}\n`);
  else log[level](message);
}

function interactive(): boolean {
  return !isNonInteractive() && process.stdin.isTTY === true;
}

async function confirmOrRefuse(
  message: string,
  yes: boolean,
): Promise<boolean> {
  if (yes) return true;
  if (!interactive()) {
    throw new UsageError(
      `${message} Pass --yes to answer yes without a terminal.`,
    );
  }
  return unwrap(await confirm({ message, initialValue: true }));
}

// ── Picking ──────────────────────────────────────────────────────────────────

function findItem(items: readonly SharedItem[], typed: string): SharedItem {
  const needle = typed.trim().toLowerCase();
  const match =
    items.find((i) => i.id === typed.trim()) ??
    items.find((i) => i.name.toLowerCase() === needle);
  if (!match) {
    throw new UsageError(
      `No shared account called "${typed}". There are: ${
        items.map((i) => i.name).join(", ") || "none yet (try creds add)"
      }.`,
    );
  }
  return match;
}

async function pickItems(
  items: readonly SharedItem[],
  typed: readonly string[] | undefined,
  message: string,
): Promise<SharedItem[]> {
  if (typed && typed.length > 0) return typed.map((t) => findItem(items, t));
  if (items.length === 0) {
    throw new UsageError(
      "The Shared Accounts collection is empty. Add one with `backstage creds add`.",
    );
  }
  if (!interactive()) {
    throw new UsageError("Name the accounts with --item <name>.");
  }
  const ids = unwrap(
    await multiselect({
      message,
      options: items.map((i) => ({
        value: i.id,
        label: i.name,
        hint:
          i.recipients.length > 0
            ? `${i.recipients.length} recipient${i.recipients.length === 1 ? "" : "s"}`
            : "not shared yet",
      })),
      required: true,
    }),
  );
  return items.filter((i) => ids.includes(i.id));
}

let rosterCache: Promise<Roster> | undefined;

async function roster(values: Values, deps: CredsDeps): Promise<Roster> {
  rosterCache ??= (async () => {
    const query =
      deps.rosterQuery ??
      rosterQueryFor(await resolveRosterDbUrl({ explicit: values["db-url"] }));
    const { roster: loaded, skipped } = await loadRoster(query);
    if (skipped.length > 0) {
      say(
        `Left off the roster for having no UGA address on record: ${skipped.join(", ")}.`,
        "warn",
      );
    }
    return loaded;
  })();
  try {
    return await rosterCache;
  } catch (err) {
    rosterCache = undefined;
    throw err;
  }
}

/** Forgets the roster between runs. For tests. */
export function forgetRoster(): void {
  rosterCache = undefined;
}

/**
 * The recipients for one item: `--to` and `--role` when given, else a
 * multiselect at a terminal (people and roles, the current list preselected),
 * else the item's current list. Addresses off the roster need --allow-email,
 * except ones the item already has.
 */
async function pickRecipients(
  item: SharedItem,
  values: Values,
  deps: CredsDeps,
): Promise<string[]> {
  const typed = splitEmails(values.to);
  const roles = (values.role ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  let chosen: string[];

  if (typed.length > 0 || roles.length > 0) {
    const r = roles.length > 0 ? await roster(values, deps) : undefined;
    chosen = [...typed, ...(r ? emailsForRoles(r, roles) : [])];
  } else if (interactive()) {
    const r = await roster(values, deps);
    const offRoster = item.recipients.filter(
      (e) => !r.officers.some((o) => o.email === e),
    );
    const picked = unwrap(
      await multiselect<string>({
        message: `Who should be able to open ${item.name}? (roles select everyone in them)`,
        options: [
          ...r.roles.map((role) => ({
            value: `role:${role.title}`,
            label: `Everyone: ${role.title}`,
            hint: `${role.emails.length}`,
          })),
          ...r.officers.map((o) => ({
            value: `email:${o.email}`,
            label: o.name,
            hint: `${o.email} · ${o.roles.join(", ")}`,
          })),
          ...offRoster.map((e) => ({
            value: `email:${e}`,
            label: e,
            hint: "not on the officer roster",
          })),
        ],
        initialValues: item.recipients.map((e) => `email:${e}`),
        required: true,
      }),
    );
    chosen = picked.flatMap((value) =>
      value.startsWith("role:")
        ? emailsForRoles(r, [value.slice(5)])
        : [value.slice(6)],
    );
    if (values["allow-email"]) {
      const extra = unwrap(
        await askText({
          message: "Anyone else? (comma-separated addresses, blank for nobody)",
          placeholder: "",
        }),
      );
      chosen.push(...splitEmails(extra));
    }
  } else {
    chosen = item.recipients;
  }

  const unique = [...new Set(chosen.map((e) => e.toLowerCase()))];
  const added = unique.filter((e) => !item.recipients.includes(e));
  if (added.length > 0 && !values["allow-email"]) {
    const { refused } = checkRecipients(
      added,
      await roster(values, deps),
      false,
    );
    if (refused.length > 0) {
      throw new UsageError(
        `Not on the officer roster: ${refused.join(", ")}. ` +
          "Check the address, or pass --allow-email to share outside the officer team.",
      );
    }
  }
  return unique;
}

// ── Sending ──────────────────────────────────────────────────────────────────

interface Plan {
  item: SharedItem;
  recipients: string[];
  /** The Send to extend, when this account owns the recorded one. */
  existing: SendJson | undefined;
}

async function plan(
  vault: SharedVault,
  item: SharedItem,
  recipients: string[],
): Promise<Plan> {
  if (recipients.length === 0) {
    // A Send with no addresses is open to anyone holding the link.
    throw new CredsError(
      `${item.name} has no recipients. A Send needs at least one address.`,
    );
  }
  const existing = item.send ? await vault.getSend(item.send.id) : undefined;
  return { item, recipients, existing };
}

/** The confirmation text for a plan: the masked body, the recipients, and what happens to the link. */
function describePlan(p: Plan, rosterForNames: Roster | undefined): string {
  const added = p.recipients.filter((e) => !p.item.recipients.includes(e));
  const removed = p.item.recipients.filter((e) => !p.recipients.includes(e));
  const lines = [
    previewBody(p.item),
    "",
    "Recipients (Bitwarden verifies each address before showing anything):",
    ...p.recipients.map((e) => `  ${describeRecipient(rosterForNames, e)}`),
  ];
  if (added.length > 0) lines.push(`Adding: ${added.join(", ")}`);
  if (removed.length > 0) lines.push(`Removing: ${removed.join(", ")}`);
  if (p.existing) {
    lines.push(
      "",
      "Updates the existing Send in place: the link stays the same.",
    );
  } else if (p.item.send) {
    lines.push(
      "",
      `The recorded Send belongs to ${p.item.send.account ?? "another account"} or was deleted, ` +
        "so this makes a new one under your account. The link changes; the Linear document carries the new one.",
    );
  } else {
    lines.push("", "Makes a new Send.");
  }
  return lines.join("\n");
}

async function apply(
  vault: SharedVault,
  p: Plan,
  account: string,
  now: Date,
): Promise<SharedItem> {
  const body = sendBody(p.item);
  const send = p.existing
    ? await vault.editSend(p.existing, p.item, body, p.recipients, now)
    : await vault.createSend(p.item, body, p.recipients, now);
  return vault.updateItem(
    withFields(p.item.raw, {
      recipients: p.recipients.join(", "),
      sendId: send.id,
      sendLink: send.accessUrl,
      sendExpires: new Date(send.deletionDate).toISOString(),
      sendAccount: account,
    }),
  );
}

async function sendAll(
  vault: SharedVault,
  plans: Plan[],
  values: Values,
  deps: CredsDeps,
  rosterForNames: Roster | undefined,
): Promise<SharedItem[]> {
  const now = (deps.now ?? (() => new Date()))();
  const account = await vault.account();
  const done: SharedItem[] = [];
  for (const p of plans) {
    if (interactive()) note(describePlan(p, rosterForNames), p.item.name);
    else
      process.stderr.write(
        `${p.item.name}\n${describePlan(p, rosterForNames)}\n\n`,
      );
    const ok = await confirmOrRefuse(
      `Share ${p.item.name} with ${p.recipients.length} recipient${p.recipients.length === 1 ? "" : "s"}?`,
      values.yes === true,
    );
    if (!ok) {
      say(`Skipped ${p.item.name}.`, "warn");
      continue;
    }
    const saved = await apply(vault, p, account, now);
    done.push(saved);
    say(
      `${saved.name}: ${saved.send?.link ?? "(no link)"} (until ${isoDay(saved.send?.expires)})`,
      "success",
    );
  }
  if (done.length === 1 && done[0]!.send?.link) {
    const copied = await (deps.copy ?? copyLink)(done[0]!.send.link);
    if (copied) say("Copied the link to your clipboard.");
  }
  return done;
}

// ── Report ───────────────────────────────────────────────────────────────────

async function report(
  vault: SharedVault,
  values: Values,
  deps: CredsDeps,
  rosterForNames: Roster | undefined,
): Promise<void> {
  const token = await resolveLinearToken({
    explicit: values["linear-token"],
    env: process.env.LINEAR_API_KEY,
  });
  const items = await vault.listItems();
  const now = (deps.now ?? (() => new Date()))();
  const url = await writeReport(
    token,
    values.document ?? SHARED_ACCOUNTS_DOCUMENT_ID,
    renderReport(items, now, rosterForNames),
    deps.fetch,
  );
  say(`Updated the Shared Accounts document: ${url}`, "success");
}

/** The report after a change. A failure here leaves the Sends done, so it warns rather than fails. */
async function reportAfter(
  vault: SharedVault,
  values: Values,
  deps: CredsDeps,
  rosterForNames: Roster | undefined,
): Promise<void> {
  if (values["no-report"]) return;
  try {
    await report(vault, values, deps, rosterForNames);
  } catch (err) {
    say(
      `The Sends are done, but the Linear document was not updated: ${scrub(errorMessage(err))} ` +
        "Run `backstage creds report` to retry.",
      "warn",
    );
  }
}

// ── Subcommands ──────────────────────────────────────────────────────────────

async function runSend(vault: SharedVault, values: Values, deps: CredsDeps) {
  const items = await pickItems(
    await vault.listItems(),
    values.item,
    "Which shared accounts?",
  );
  await sendItems(vault, items, values, deps);
}

async function sendItems(
  vault: SharedVault,
  items: SharedItem[],
  values: Values,
  deps: CredsDeps,
) {
  const plans: Plan[] = [];
  for (const item of items) {
    plans.push(
      await plan(vault, item, await pickRecipients(item, values, deps)),
    );
  }
  const names = rosterCache
    ? await rosterCache.catch(() => undefined)
    : undefined;
  const done = await sendAll(vault, plans, values, deps, names);
  if (done.length > 0) await reportAfter(vault, values, deps, names);
}

async function readPassword(values: Values, deps: CredsDeps): Promise<string> {
  if (values["password-stdin"]) {
    const read = deps.readStdin ?? readAllStdin;
    const value = (await read()).replace(/\r?\n$/, "");
    if (!value) throw new UsageError("--password-stdin read nothing.");
    return value;
  }
  if (!interactive()) {
    throw new UsageError(
      "Pass the password on stdin with --password-stdin; it never goes in argv.",
    );
  }
  return unwrap(
    await askPassword({
      message: "Password? (hidden; never printed)",
      validate: (v) => (v ? undefined : "A shared login needs a password."),
    }),
  );
}

async function readAllStdin(): Promise<string> {
  let data = "";
  for await (const chunk of process.stdin) data += String(chunk);
  return data;
}

async function ask(
  given: string | undefined,
  message: string,
  required: boolean,
): Promise<string | undefined> {
  if (given !== undefined) return given.trim() || undefined;
  if (!interactive()) {
    if (required) throw new UsageError(`Missing ${message}`);
    return undefined;
  }
  const value = unwrap(
    await askText({
      message,
      validate: required
        ? (v) => (v?.trim() ? undefined : "Required.")
        : undefined,
    }),
  );
  return value?.trim() || undefined;
}

async function runAdd(vault: SharedVault, values: Values, deps: CredsDeps) {
  const existing = await vault.listItems();
  const name = (await ask(values.name, "Name? (e.g. Instagram)", true))!;
  if (existing.some((i) => i.name.toLowerCase() === name.toLowerCase())) {
    throw new UsageError(
      `"${name}" is already in the collection. Use \`backstage creds send --item "${name}"\`.`,
    );
  }
  const url = await ask(values.url, "Login page URL? (optional)", false);
  const username = await ask(
    values.username,
    "Username or email? (optional)",
    false,
  );
  const password = await readPassword(values, deps);
  registerSecret(password);
  const notes = interactive()
    ? await ask(
        undefined,
        "Notes for recipients? (optional, never printed)",
        false,
      )
    : undefined;
  const owner = await ask(
    values.owner,
    "Owner? (the officer responsible)",
    false,
  );

  const item = await vault.createLogin({
    name,
    url,
    username,
    password,
    notes,
    owner,
  });
  say(`Saved ${item.name} to the Shared Accounts collection.`, "success");
  await sendItems(vault, [item], values, deps);
}

async function runRenew(vault: SharedVault, values: Values, deps: CredsDeps) {
  const now = (deps.now ?? (() => new Date()))();
  const all = await vault.listItems();
  const chosen =
    values.item && values.item.length > 0
      ? values.item.map((t) => findItem(all, t))
      : all.filter((i) => i.send !== undefined || i.recipients.length > 0);

  const ready = chosen.filter((i) => {
    if (i.recipients.length > 0) return true;
    say(
      `${i.name} has no recipients; share it with \`creds send\` first.`,
      "warn",
    );
    return false;
  });
  const early = ready.filter(
    (i) => (daysLeft(i, now) ?? 0) > EXPIRES_SOON_DAYS,
  );
  let renew = ready;
  if (early.length > 0) {
    const list = early
      .map((i) => `${i.name} (${daysLeft(i, now)} days left)`)
      .join(", ");
    const ok = await confirmOrRefuse(
      `More than ${EXPIRES_SOON_DAYS} days left on: ${list}. Renew ${early.length === 1 ? "it" : "them"} anyway?`,
      values.yes === true,
    );
    if (!ok) renew = ready.filter((i) => !early.includes(i));
  }
  if (renew.length === 0) {
    say("Nothing to renew.");
    return;
  }

  const plans: Plan[] = [];
  for (const item of renew)
    plans.push(await plan(vault, item, item.recipients));
  const done = await sendAll(
    vault,
    plans,
    { ...values, yes: true },
    deps,
    undefined,
  );
  if (done.length > 0) await reportAfter(vault, values, deps, undefined);
}

async function runList(vault: SharedVault, values: Values, deps: CredsDeps) {
  const now = (deps.now ?? (() => new Date()))();
  const items = await vault.listItems();
  const rows = items.map((i) => ({
    name: i.name,
    account: i.username ?? null,
    url: i.url ?? null,
    recipients: i.recipients,
    owner: i.owner ?? null,
    status: sendStatus(i, now),
    expires: i.send?.expires?.toISOString() ?? null,
    sendLink: i.send?.link ?? null,
  }));
  if (values.json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  if (rows.length === 0) {
    process.stdout.write(
      "No shared accounts yet. Add one with `backstage creds add`.\n",
    );
    return;
  }
  for (const r of rows) {
    process.stdout.write(
      `${r.name}${r.account ? ` (${r.account})` : ""}: ${r.status}, until ${isoDay(
        r.expires ? new Date(r.expires) : undefined,
      )}\n  owner: ${r.owner ?? "—"}\n  recipients: ${
        r.recipients.join(", ") || "—"
      }\n`,
    );
  }
}

// ── Entry ────────────────────────────────────────────────────────────────────

export async function runCreds(
  argv: readonly string[],
  deps: CredsDeps = {},
): Promise<void> {
  try {
    const { sub, values } = parse(argv);
    const vault = await (deps.vault ?? connectSharedVault)();
    if (sub === "send") await runSend(vault, values, deps);
    else if (sub === "add") await runAdd(vault, values, deps);
    else if (sub === "renew") await runRenew(vault, values, deps);
    else if (sub === "list") await runList(vault, values, deps);
    else await report(vault, values, deps, undefined);
  } catch (err) {
    process.exitCode = 1;
    if (err instanceof UsageError || err instanceof CredsError) {
      explain(scrub(err.message), "");
      return;
    }
    // Unexpected, so it goes to Sentry: with its message and stack scrubbed
    // first, because an unexpected error is the one nobody checked.
    const safe = new Error(scrub(errorMessage(err)));
    safe.stack = scrub((err as Error | undefined)?.stack ?? safe.message);
    explainError("creds failed.", safe);
  }
}

export const handleCreds: CommandHandler = async (rest) => {
  await runCreds(rest);
  return process.exitCode ? null : DONE;
};
