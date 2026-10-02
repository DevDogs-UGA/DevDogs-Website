/**
 * A shared account as `creds` sees it: a login or secure note in the DevDogs
 * Bitwarden organization, plus the custom fields that record who has it.
 *
 * Those fields are the only access record. The Send, the Linear report and
 * every "who has Canva?" answer are generated from them, so they are plain
 * text fields anyone with the item can read and correct in Bitwarden
 * itself:
 *
 *   Recipients    comma-separated UGA emails, the Send's `--emails` list
 *   Owner         the officer responsible for the account
 *   Send ID       the Send's id, for `bw send edit`
 *   Send link     its access URL, for the report (Sends belong to whoever
 *                 created them, so another officer cannot look it up)
 *   Send expires  its deletion date, ISO 8601, for the report and `renew`
 *   Send account  the Bitwarden account that owns the Send
 *
 * The password, the TOTP seed and the notes of a secure note are registered
 * as secrets the moment an item is parsed (see `secrets.ts`).
 */
import { registerSecret } from "./secrets.js";

export const FIELD = {
  recipients: "Recipients",
  owner: "Owner",
  sendId: "Send ID",
  sendLink: "Send link",
  sendExpires: "Send expires",
  sendAccount: "Send account",
} as const;

/** Bitwarden's item types, as `bw` numbers them. */
export const ITEM_TYPE = { login: 1, secureNote: 2 } as const;

/** What the preview shows for a password: fixed, so not even its length leaks. */
export const MASK = "••••••••";

export interface BwField {
  name: string | null;
  value: string | null;
  /** 0 text, 1 hidden, 2 boolean, 3 linked. */
  type: number;
}

/** The parts of a `bw get item` object `creds` reads; the rest is carried through untouched. */
export interface BwItem {
  id: string;
  organizationId: string | null;
  collectionIds: string[] | null;
  name: string;
  notes: string | null;
  type: number;
  login?: {
    username: string | null;
    password: string | null;
    totp: string | null;
    uris?: { uri: string | null }[] | null;
  } | null;
  fields?: BwField[] | null;
  [key: string]: unknown;
}

export interface SendRecord {
  id: string;
  link: string | undefined;
  /** Undefined when the field is missing or unreadable. */
  expires: Date | undefined;
  account: string | undefined;
}

export interface SharedItem {
  raw: BwItem;
  id: string;
  name: string;
  /** The login's username: the "account identifier" in the report. */
  username: string | undefined;
  url: string | undefined;
  recipients: string[];
  owner: string | undefined;
  send: SendRecord | undefined;
}

/** `value`, trimmed, or `undefined` when there is nothing in it. */
function present(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

function field(raw: BwItem, name: string): string | undefined {
  return present(raw.fields?.find((f) => f.name === name)?.value);
}

export function splitEmails(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(/[,\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/** Reads an item, registering its secret values first. */
export function parseItem(raw: BwItem): SharedItem {
  registerSecret(raw.login?.password);
  registerSecret(raw.login?.totp);
  if (raw.type === ITEM_TYPE.secureNote) registerSecret(raw.notes);
  for (const f of raw.fields ?? []) {
    if (f.type === 1) registerSecret(f.value);
  }

  const sendId = field(raw, FIELD.sendId);
  const expiresText = field(raw, FIELD.sendExpires);
  const expires = expiresText ? new Date(expiresText) : undefined;

  return {
    raw,
    id: raw.id,
    name: raw.name,
    username: present(raw.login?.username),
    url: raw.login?.uris
      ?.map((u) => present(u.uri))
      .find((u) => u !== undefined),
    recipients: splitEmails(field(raw, FIELD.recipients)),
    owner: field(raw, FIELD.owner),
    send: sendId
      ? {
          id: sendId,
          link: field(raw, FIELD.sendLink),
          expires:
            expires && !Number.isNaN(expires.getTime()) ? expires : undefined,
          account: field(raw, FIELD.sendAccount),
        }
      : undefined,
  };
}

/**
 * `raw` with the named text fields set (or removed, for `undefined`), every
 * other field and property left exactly as it was. Our fields are always
 * plain text: none of them is secret, and a hidden field would hide the
 * access record from the people meant to read it.
 */
export function withFields(
  raw: BwItem,
  updates: Partial<Record<keyof typeof FIELD, string | undefined>>,
): BwItem {
  let fields = [...(raw.fields ?? [])];
  for (const [key, value] of Object.entries(updates)) {
    const name = FIELD[key as keyof typeof FIELD];
    const index = fields.findIndex((f) => f.name === name);
    if (value === undefined || value === "") {
      if (index >= 0) fields = fields.filter((_, i) => i !== index);
    } else if (index >= 0) {
      fields[index] = { ...fields[index]!, value, type: 0 };
    } else {
      fields.push({ name, value, type: 0 });
    }
  }
  return { ...raw, fields };
}

/** What the recipient reads once Bitwarden has verified their email. Holds the password. */
export function sendBody(item: SharedItem): string {
  return body(item, item.raw.login?.password ?? undefined, item.raw.notes);
}

/**
 * {@link sendBody} with the password replaced by {@link MASK} and the notes by
 * a line count. Built from the item, never from the body, so there is no
 * string here that ever held the value.
 */
export function previewBody(item: SharedItem): string {
  const notes = item.raw.notes?.trim();
  const lines = notes ? notes.split("\n").length : 0;
  return body(
    item,
    item.raw.login?.password ? MASK : undefined,
    notes ? `(notes: ${lines} line${lines === 1 ? "" : "s"}, not shown)` : null,
  );
}

function body(
  item: SharedItem,
  password: string | undefined,
  notes: string | null,
): string {
  const lines = [item.name];
  if (item.url) lines.push(`Login: ${item.url}`);
  if (item.username) lines.push(`Username: ${item.username}`);
  if (password) lines.push(`Password: ${password}`);
  if (notes?.trim()) lines.push("", notes.trim());
  lines.push(
    "",
    "Shared by DevDogs officers. Please don't forward this link or the " +
      "password; ask an officer to add you instead.",
  );
  return lines.join("\n");
}

export const EXPIRES_SOON_DAYS = 7;
const DAY = 86_400_000;

export type SendStatus = "Active" | "Expires Soon" | "Expired" | "No Send";

export function sendStatus(item: SharedItem, now: Date): SendStatus {
  if (!item.send) return "No Send";
  if (!item.send.expires) return "Active";
  const left = item.send.expires.getTime() - now.getTime();
  if (left <= 0) return "Expired";
  return left <= EXPIRES_SOON_DAYS * DAY ? "Expires Soon" : "Active";
}

/** Whole days until the Send is deleted, rounded down; negative once it has been. */
export function daysLeft(item: SharedItem, now: Date): number | undefined {
  const expires = item.send?.expires;
  if (!expires) return undefined;
  return Math.floor((expires.getTime() - now.getTime()) / DAY);
}

/** `YYYY-MM-DD`. */
export function isoDay(date: Date | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "—";
}
