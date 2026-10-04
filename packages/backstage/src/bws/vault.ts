/**
 * The Bitwarden **Password Manager** vault, via the `bw` CLI.
 *
 * A different product from Secrets Manager and a different CLI, which is the
 * point: `bws` has no user authentication at all, so the access token it needs
 * has to be held somewhere a person can log in to. That somewhere is the
 * Password Manager vault, and this module reads it back rather than making
 * somebody paste a token every session.
 *
 * Everything here degrades to `undefined`. A missing `bw`, a locked vault, a
 * declined unlock, a missing item: none of them are errors, because each has a
 * good fallback, which is to ask. Throwing would turn a convenience into a
 * prerequisite.
 *
 * ⚠️ The token never passes through argv in either direction. Reads use
 * `bw list items --search <name>`, which puts only the item NAME on the command
 * line, and writes pipe base64 JSON through **stdin**, which `bw create item`
 * documents as an accepted input.
 *
 * ⚠️ Only the PERSONAL vault. A token read from, or saved to, an organization
 * item would be one token for everybody who can see that item: every call made
 * with it looks the same, and revoking one person means revoking everyone.
 * Reads skip organization items and say so; writes set no organization.
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { confirm, log, spinner } from "@clack/prompts";
import { unwrap } from "@devdogsuga/cli-core/ui";
import { bwCommand } from "./bw.js";

const run = promisify(execFile);

/**
 * The item this looks for, and creates.
 *
 * Named for what it unlocks rather than for this tool, because whoever finds it
 * in the vault six months from now needs to know what it is, not which script
 * wrote it.
 */
export const VAULT_ITEM_NAME = "DevDogs Secrets Manager access token (admin)";

export type VaultStatus =
  "unavailable" | "unauthenticated" | "locked" | "unlocked";

/** `bw status`, or `unavailable` when the CLI is not installed. */
export async function vaultStatus(): Promise<VaultStatus> {
  try {
    const { stdout } = await run(
      ...bwCommand(bwArgs(["status", "--response"])),
      {
        shell: false,
      },
    );
    // `--response` wraps the payload; the bare form is also accepted, so read
    // whichever shape came back rather than depending on one.
    const parsed = JSON.parse(stdout) as
      | { success?: boolean; data?: { template?: { status?: string } } }
      | { status?: string };
    const status =
      ("status" in parsed ? parsed.status : undefined) ??
      ("data" in parsed ? parsed.data?.template?.status : undefined);

    if (status === "unlocked") return "unlocked";
    if (status === "locked") return "locked";
    return "unauthenticated";
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return "unavailable";
    return "unauthenticated";
  }
}

/**
 * Offers to sign in to the vault when it is not, and does it with the bundled
 * `bw` (`bw login`, interactive). There is no `bw` command of ours to run by
 * hand any more: `env` signs in and unlocks for itself, at the moment it needs
 * the Secrets Manager token. Returns the status afterwards.
 *
 * Asks first, like the unlock below: a master-password prompt that appears
 * unannounced is shaped exactly like the thing people are told never to type
 * their master password into. Without a terminal there is nobody to sign in,
 * so the status comes back unchanged.
 */
async function signInIfNeeded(
  status: VaultStatus,
  purpose: string,
): Promise<VaultStatus> {
  if (status !== "unauthenticated" || !process.stdin.isTTY) return status;

  const ok = unwrap(
    await confirm({
      message: `You are not signed in to Bitwarden. Sign in now to ${purpose}?`,
      initialValue: true,
    }),
  );
  if (!ok) return status;

  // Everything inherited: Bitwarden asks for the email, master password and any
  // two-step code itself, and none of it passes through this process.
  const code = await new Promise<number | null>((resolve) => {
    const child = spawn(...bwCommand(["login"]), {
      stdio: "inherit",
      shell: false,
    });
    child.on("error", () => resolve(null));
    child.on("close", (exit) => resolve(exit));
  });
  if (code !== 0) return status;
  return vaultStatus();
}

/**
 * A usable session key, unlocking if the person agrees.
 *
 * `BW_SESSION` is preferred and silent. Otherwise this ASKS before unlocking:
 * a tool that pops a master-password prompt unannounced is shaped exactly like
 * the thing people are told never to type their master password into.
 *
 * The password is typed straight into `bw`. stdin is inherited, so it never
 * passes through this process.
 *
 * The key is kept for the rest of the process once unlocked: `creds` makes a
 * dozen `bw` calls in one run, and asking for the master password before each
 * would be both tiresome and a reason to stop reading the prompt.
 */
let unlockedKey: string | undefined;

async function session(
  status: VaultStatus,
  purpose: string,
): Promise<string | undefined> {
  if (process.env.BW_SESSION) return process.env.BW_SESSION;
  if (unlockedKey) return unlockedKey;
  if (status !== "locked") return undefined;
  if (!process.stdin.isTTY) return undefined;

  const ok = unwrap(
    await confirm({
      message: `Your Bitwarden vault is locked. Unlock it to ${purpose}?`,
      initialValue: true,
    }),
  );
  if (!ok) return undefined;

  unlockedKey = await new Promise<string | undefined>((resolve) => {
    // stdin inherited so the master password goes to `bw` and not through here;
    // stdout piped so the session key can be captured rather than printed.
    const child = spawn(...bwCommand(["unlock", "--raw"]), {
      stdio: ["inherit", "pipe", "inherit"],
      shell: false,
    });
    let out = "";
    child.stdout.on("data", (c: Buffer) => (out += c.toString()));
    child.on("error", () => resolve(undefined));
    child.on("close", (code) =>
      resolve(code === 0 && out.trim() !== "" ? out.trim() : undefined),
    );
  });
  return unlockedKey;
}

/** Drops the remembered session key. For tests, which each start a fresh vault. */
export function forgetVaultSession(): void {
  unlockedKey = undefined;
}

/**
 * A vault ready for `bw` calls, signing in and unlocking (after asking) as
 * needed, or `undefined` when it cannot be used. `key` is the session to pass
 * to {@link bwArgs}; it is absent only when `bw` itself reports the vault
 * unlocked without one.
 *
 * `purpose` finishes the questions: "Unlock it to <purpose>?".
 */
export async function openVault(
  purpose: string,
): Promise<{ key: string | undefined } | undefined> {
  const status = await signInIfNeeded(await vaultStatus(), purpose);
  if (status === "unavailable" || status === "unauthenticated") {
    return undefined;
  }
  const key = await session(status, purpose);
  if (status === "locked" && !key) return undefined;
  return { key };
}

/**
 * Adds the session key, and `--nointeraction` always.
 *
 * The second one is not belt-and-braces. `bw` prompts for a master password on
 * stdin whenever the vault is locked, as `bw get template item` does against a
 * locked vault, and this module runs `bw` with piped stdio, where that prompt
 * has nobody to answer it and hangs until something gives up. `--nointeraction`
 * turns that into an immediate non-zero exit, which every caller here already
 * treats as "not available, ask instead".
 */
export function bwArgs(args: string[], key?: string): string[] {
  const withNoInteraction = [...args, "--nointeraction"];
  return key ? [...withNoInteraction, "--session", key] : withNoInteraction;
}

/** The stored token, or `undefined` for every reason it might not be there. */
export async function readTokenFromVault(): Promise<string | undefined> {
  return readPasswordFromVault(
    VAULT_ITEM_NAME,
    "the access token",
    "look for the access token",
    "BWS_ACCESS_TOKEN",
  );
}

interface ListedItem {
  name?: string;
  type?: number;
  organizationId?: string | null;
  login?: { password?: string | null } | null;
}

/**
 * The password of the one PERSONAL vault item named exactly `itemName`, or
 * `undefined` for every reason it might not be there. `what` names it in the
 * spinner; `purpose` finishes the sign-in and unlock questions.
 *
 * `bw list items --search` rather than `bw get password`: `get` takes the
 * first item it can see, organization items included, and an item of that
 * name in an organization is precisely the shared token this must not use.
 * Two personal items of the same name mean somebody should look, not that
 * this should guess, so that is "not found" too.
 */
export async function readPasswordFromVault(
  itemName: string,
  what: string,
  purpose: string,
  envVar: string,
): Promise<string | undefined> {
  const status = await signInIfNeeded(await vaultStatus(), purpose);

  if (status === "unavailable" || status === "unauthenticated") {
    // Said out loud, and only here. By the time this runs the chain has already
    // found nothing in the flag or the environment, so the person is about to
    // be asked to paste a token. That is when knowing the vault could have
    // answered instead is worth something.
    log.info(explainVault(status, envVar)!);
    return undefined;
  }

  const key = await session(status, purpose);
  if (status === "locked" && !key) return undefined;

  const s = spinner();
  s.start("Looking in your Bitwarden vault");
  let items: ListedItem[];
  try {
    // stdout is captured and parsed, never printed: it holds the password.
    const { stdout } = await run(
      ...bwCommand(bwArgs(["list", "items", "--search", itemName], key)),
      { shell: false, maxBuffer: 16 * 1024 * 1024 },
    );
    items = (JSON.parse(stdout) as ListedItem[]).filter(
      (item) => item.name === itemName,
    );
  } catch {
    s.stop("Could not read your Bitwarden vault");
    return undefined;
  }

  const personal = items.filter((item) => !item.organizationId);
  if (personal.length > 1) {
    s.stop(`More than one "${itemName}" in your vault; delete the extras`);
    return undefined;
  }
  const token = personal[0]?.login?.password?.trim();
  if (token) {
    s.stop(`Read ${what} from your vault ("${itemName}")`);
    return token;
  }

  if (items.length > personal.length) {
    s.stop(`"${itemName}" is in an organization, not your personal vault`);
    log.warn(
      `Not using it: an organization item is one ${what} for everyone who can ` +
        "see it, so nothing it does can be told apart. Use your own, saved in " +
        "your personal vault (no organization).",
    );
    return undefined;
  }
  s.stop("Nothing stored in the vault yet");
  return undefined;
}

/**
 * Saves `token` as a login item named `itemName` in the PERSONAL vault, the
 * token arriving on **stdin** as base64 JSON.
 *
 * `bw create item` documents an encoded-JSON positional AND stdin. Using stdin
 * is the difference between a live credential that is invisible and one that
 * sits in `ps` output for the length of the call. `organizationId: null` is
 * what makes it personal, and it is not a parameter.
 */
export async function savePasswordToVault(
  itemName: string,
  notes: string,
  token: string,
  purpose: string,
): Promise<boolean> {
  const status = await signInIfNeeded(await vaultStatus(), purpose);
  if (status === "unavailable" || status === "unauthenticated") return false;

  const key = await session(status, purpose);
  if (status === "locked" && !key) return false;

  const item = {
    organizationId: null,
    collectionIds: null,
    folderId: null,
    type: 1, // login, so the password is one field to read back
    name: itemName,
    notes,
    favorite: false,
    reprompt: 0,
    login: { username: null, password: token, totp: null },
  };

  return new Promise<boolean>((resolve) => {
    const child = spawn(...bwCommand(bwArgs(["create", "item"], key)), {
      stdio: ["pipe", "ignore", "pipe"],
      shell: false,
    });
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      if (code !== 0 && stderr.trim() !== "") log.warn(stderr.trim());
      resolve(code === 0);
    });
    child.stdin.end(Buffer.from(JSON.stringify(item)).toString("base64"));
  });
}

/** Saves the Secrets Manager access token. See {@link savePasswordToVault}. */
export function saveTokenToVault(token: string): Promise<boolean> {
  return savePasswordToVault(
    VAULT_ITEM_NAME,
    "Your own Bitwarden Secrets Manager access token for the `admin` machine " +
      "account, read/write on preflight, staging and production.\n\n" +
      "Read automatically by `backstage env`. Keep it in your personal vault, " +
      "never an organization: one token per person is what keeps calls " +
      "attributable and lets one person's be revoked alone. Never put this in " +
      "a .env that leaves this machine: it unlocks all three projects, and " +
      "the tool refuses to upload it.",
    token,
    "save the access token",
  );
}

/** Why the vault could not be used, phrased as something to do about it. */
export function explainVault(
  status: VaultStatus,
  envVar = "BWS_ACCESS_TOKEN",
): string | undefined {
  if (status === "unavailable") {
    return (
      "The `bw` CLI is not installed, so the vault could not be checked. " +
      "It ships with backstage, so reinstall it."
    );
  }
  if (status === "unauthenticated") {
    return (
      "You are not signed in to Bitwarden, and with no terminal there is " +
      `nobody to sign in. Set ${envVar} instead.`
    );
  }
  return undefined;
}
