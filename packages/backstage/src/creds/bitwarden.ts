/**
 * The DevDogs Bitwarden organization's items and the Sends made from them,
 * through the bundled `bw` on the officer's personal session (`bws/vault.ts`).
 *
 * Sends belong to the account that creates them, not to the organization, so
 * this always runs as a person and never on CI.
 *
 * ## Secret handling
 *
 * * Every value travels to `bw` on **stdin**, base64 JSON as `bw create`,
 *   `bw edit` and `bw send create|edit` document. argv carries only ids and
 *   the session key `bwArgs` already passes.
 * * `bw`'s stdout is parsed and never printed: an item or a Send read back
 *   holds the password.
 * * `bw`'s stderr is only shown through `CredsError`, which scrubs every value
 *   registered so far.
 *
 * ## The organization fence
 *
 * `creds` reads and writes the logins and secure notes of ONE organization,
 * found by name. Anything else the account can see (a personal login, another
 * organization's item) is never listed, never edited and never sent;
 * `updateItem` re-checks before every write. Production secrets are not
 * vault items at all: they live in Secrets Manager, which `bw` cannot read.
 */
import { spawn } from "node:child_process";
import { bwCommand } from "../bws/bw.js";
import { bwArgs, openVault } from "../bws/vault.js";
import {
  FIELD,
  ITEM_TYPE,
  parseItem,
  type BwItem,
  type SharedItem,
} from "./item.js";
import { CredsError, registerSecret } from "./secrets.js";

/** Matched case-insensitively against the organizations the account belongs to. */
export const ORGANIZATION_NAME = "DevDogs";

/** Days until a new or renewed Send is deleted. Bitwarden allows 31. */
export const SEND_DAYS = 30;

export interface BwResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs `bw <args>` with `stdin` piped in. Session and `--nointeraction` are the runner's job. */
export type BwRunner = (args: string[], stdin?: string) => Promise<BwResult>;

export interface Organization {
  id: string;
  name: string;
}

export interface Collection {
  id: string;
  organizationId: string;
  name: string;
}

/** The parts of `bw send get`'s object `creds` reads; the rest round-trips untouched. */
export interface SendJson {
  id: string;
  accessUrl: string;
  deletionDate: string;
  emails: string[] | null;
  name: string;
  notes: string | null;
  type: number;
  text: { text: string; hidden: boolean } | null;
  [key: string]: unknown;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

/** The real runner: the bundled `bw`, every stream piped, stdin always closed. */
export function spawnRunner(key: string | undefined): BwRunner {
  return (args, stdin) =>
    new Promise((resolve) => {
      const child = spawn(...bwCommand(bwArgs(args, key)), {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
      child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
      child.on("error", (err) =>
        resolve({ code: null, stdout: "", stderr: err.message }),
      );
      child.on("close", (code) => resolve({ code, stdout, stderr }));
      child.stdin.end(stdin ?? "");
    });
}

let runnerOverride: BwRunner | undefined;

/** Replaces `bw` for tests. `undefined` restores the real one. */
export function setBwRunner(runner: BwRunner | undefined): void {
  runnerOverride = runner;
}

/** Opens the vault (asking first) and finds the DevDogs organization in it. */
export async function connectSharedVault(): Promise<SharedVault> {
  let runner = runnerOverride;
  if (!runner) {
    const vault = await openVault("share DevDogs logins");
    if (!vault) {
      throw new CredsError(
        "Could not use your Bitwarden vault. `creds` needs your own session: " +
          "run it at a terminal so it can sign in and unlock, or export BW_SESSION.",
      );
    }
    runner = spawnRunner(vault.key);
  }
  const shared = new SharedVault(runner);
  await shared.sync();
  await shared.organization();
  return shared;
}

export class SharedVault {
  private found: Organization | undefined;

  constructor(private readonly run: BwRunner) {}

  /** `bw <args>`, parsed as JSON, or a scrubbed `CredsError`. */
  private async json<T>(args: string[], stdin?: string): Promise<T> {
    const result = await this.run(args, stdin);
    const label = `bw ${args.slice(0, args[0] === "send" ? 2 : 1).join(" ")}`;
    if (result.code !== 0) {
      throw new CredsError(
        `${label} failed: ${result.stderr.trim() || `exit ${result.code}`}`,
      );
    }
    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      // Not the output: it may be the item, password and all.
      throw new CredsError(`${label} printed something that is not JSON.`);
    }
  }

  async sync(): Promise<void> {
    const result = await this.run(["sync"]);
    if (result.code !== 0) {
      throw new CredsError(
        `bw sync failed: ${result.stderr.trim() || `exit ${result.code}`}`,
      );
    }
  }

  /** The signed-in account's email, recorded as the Send's owner. */
  async account(): Promise<string> {
    const status = await this.json<{ userEmail?: string }>(["status"]);
    return status.userEmail ?? "unknown";
  }

  /** The one organization named like {@link ORGANIZATION_NAME} this account belongs to. */
  async organization(): Promise<Organization> {
    if (this.found) return this.found;
    const all = await this.json<Organization[]>(["list", "organizations"]);
    const matches = all.filter((o) =>
      o.name.toLowerCase().includes(ORGANIZATION_NAME.toLowerCase()),
    );
    if (matches.length !== 1) {
      throw new CredsError(
        matches.length === 0
          ? `Your Bitwarden account is not in the ${ORGANIZATION_NAME} organization. ` +
              "Ask an organization admin to invite you."
          : `Your Bitwarden account is in ${matches.length} organizations named like ` +
              `"${ORGANIZATION_NAME}" (${matches.map((o) => o.name).join(", ")}); ` +
              "creds cannot tell which one to use.",
      );
    }
    this.found = matches[0]!;
    return this.found;
  }

  private shareable(raw: BwItem, org: Organization): boolean {
    return (
      raw.organizationId === org.id &&
      (raw.type === ITEM_TYPE.login || raw.type === ITEM_TYPE.secureNote)
    );
  }

  /** Every login and secure note in the organization, by name. */
  async listItems(): Promise<SharedItem[]> {
    const org = await this.organization();
    const raw = await this.json<BwItem[]>([
      "list",
      "items",
      "--organizationid",
      org.id,
    ]);
    return raw
      .filter((item) => this.shareable(item, org))
      .map(parseItem)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The organization's collections this account can see, by name. */
  async collections(): Promise<Collection[]> {
    const org = await this.organization();
    const all = await this.json<Collection[]>([
      "list",
      "collections",
      "--organizationid",
      org.id,
    ]);
    return all
      .filter((c) => c.organizationId === org.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** A new login, owned by the organization and placed in `collection`. */
  async createLogin(input: {
    collection: Collection;
    name: string;
    url: string | undefined;
    username: string | undefined;
    password: string;
    notes: string | undefined;
    owner: string | undefined;
  }): Promise<SharedItem> {
    registerSecret(input.password);
    const org = await this.organization();
    if (input.collection.organizationId !== org.id) {
      throw new CredsError(
        `The "${input.collection.name}" collection is not in the ${org.name} organization.`,
      );
    }
    const item = {
      organizationId: org.id,
      collectionIds: [input.collection.id],
      folderId: null,
      type: 1,
      name: input.name,
      notes: input.notes ?? null,
      favorite: false,
      reprompt: 0,
      fields: input.owner
        ? [{ name: FIELD.owner, value: input.owner, type: 0 }]
        : [],
      login: {
        username: input.username ?? null,
        password: input.password,
        totp: null,
        uris: input.url ? [{ match: null, uri: input.url }] : [],
      },
    };
    const created = await this.json<BwItem>(["create", "item"], encode(item));
    return parseItem(created);
  }

  /** Saves `raw`, which must still be a login or secure note of the organization. */
  async updateItem(raw: BwItem): Promise<SharedItem> {
    const org = await this.organization();
    if (!this.shareable(raw, org)) {
      throw new CredsError(
        `"${raw.name}" is not a login or secure note of the ${org.name} organization; creds will not change it.`,
      );
    }
    const saved = await this.json<BwItem>(
      ["edit", "item", raw.id],
      encode(raw),
    );
    return parseItem(saved);
  }

  /** The Send, if this account owns one with that id. Others' Sends are invisible to it. */
  async getSend(id: string): Promise<SendJson | undefined> {
    const result = await this.run(["send", "get", id]);
    if (result.code !== 0) {
      if (/not found/i.test(result.stderr)) return undefined;
      throw new CredsError(
        `bw send get failed: ${result.stderr.trim() || `exit ${result.code}`}`,
      );
    }
    try {
      const send = JSON.parse(result.stdout) as SendJson;
      registerSecret(send.text?.text);
      return send;
    } catch {
      throw new CredsError("bw send get printed something that is not JSON.");
    }
  }

  /** A new email-verified text Send for `item`. */
  async createSend(
    item: SharedItem,
    body: string,
    emails: readonly string[],
    now: Date,
  ): Promise<SendJson> {
    registerSecret(body);
    const send = {
      object: "send",
      name: sendName(item),
      notes: sendNotes(item),
      type: 0,
      text: { text: body, hidden: true },
      file: null,
      maxAccessCount: null,
      deletionDate: deletionDate(now),
      expirationDate: null,
      password: null,
      emails: [...emails],
      disabled: false,
      hideEmail: false,
    };
    return this.json<SendJson>(["send", "create"], encode(send));
  }

  /**
   * Extends `existing` in place, so its link never changes, and brings its
   * body and recipients up to date with the item.
   */
  async editSend(
    existing: SendJson,
    item: SharedItem,
    body: string,
    emails: readonly string[],
    now: Date,
  ): Promise<SendJson> {
    registerSecret(body);
    const send = {
      ...existing,
      name: sendName(item),
      notes: sendNotes(item),
      text: { text: body, hidden: true },
      deletionDate: deletionDate(now),
      expirationDate: null,
      maxAccessCount: null,
      password: null,
      emails: [...emails],
      disabled: false,
      hideEmail: false,
    };
    return this.json<SendJson>(["send", "edit"], encode(send));
  }
}

function sendName(item: SharedItem): string {
  return `DevDogs: ${item.name}`;
}

/** Private to the sender: how to find the item this Send came from. */
function sendNotes(item: SharedItem): string {
  return `Made by backstage creds from the ${ORGANIZATION_NAME} item "${item.name}" (${item.id}).`;
}

export function deletionDate(now: Date): string {
  return new Date(now.getTime() + SEND_DAYS * 86_400_000).toISOString();
}
