/**
 * Standard Webhooks signing, in both directions.
 *
 * The platform signs every moderation delivery it sends to an app, and an app
 * signs every report it files with the platform, with the same per-client
 * secret and the same scheme (https://www.standardwebhooks.com/):
 *
 * - `webhook-id`: unique per message; receivers dedupe on it.
 * - `webhook-timestamp`: unix seconds; anything more than five minutes from
 *   the receiver's clock is rejected.
 * - `webhook-signature`: `v1,<base64 HMAC-SHA256>` over
 *   `<id>.<timestamp>.<raw body>`, space-separated when more than one secret
 *   is valid at once.
 *
 * Web Crypto only (no Node imports), so the same file runs in a Cloudflare
 * Worker, a Supabase Edge Function (Deno) and Node. Verification goes through
 * `crypto.subtle.verify`, which compares in constant time.
 */

export const SECRET_PREFIX = "whsec_";
export const TIMESTAMP_TOLERANCE_SECONDS = 300;

export const WEBHOOK_ID = "webhook-id";
export const WEBHOOK_TIMESTAMP = "webhook-timestamp";
export const WEBHOOK_SIGNATURE = "webhook-signature";

// A type alias, not an interface: only an alias is assignable to the
// `Record<string, ...>` a header bag is.
export type SignedHeaders = {
  [WEBHOOK_ID]: string;
  [WEBHOOK_TIMESTAMP]: string;
  [WEBHOOK_SIGNATURE]: string;
};

export type HeaderSource =
  Headers | Readonly<Record<string, string | null | undefined>>;

export type VerifyFailure =
  "missing_headers" | "bad_timestamp" | "expired" | "bad_signature";

export type VerifyResult =
  | { ok: true; id: string; timestamp: number }
  | { ok: false; reason: VerifyFailure };

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** A fresh `whsec_` secret: 32 random bytes, base64. */
export function generateSecret(): string {
  return `${SECRET_PREFIX}${toBase64(crypto.getRandomValues(new Uint8Array(32)))}`;
}

/** The raw key bytes of a `whsec_` secret (the prefix is optional). */
export function secretBytes(secret: string): Uint8Array<ArrayBuffer> {
  const raw = secret.startsWith(SECRET_PREFIX)
    ? secret.slice(SECRET_PREFIX.length)
    : secret;
  const bytes = fromBase64(raw);
  if (!bytes || bytes.length === 0) {
    throw new Error("The signing secret is not a base64 value");
  }
  return bytes;
}

async function hmacKey(
  secret: string,
  usage: "sign" | "verify",
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    secretBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

function signedContent(id: string, timestamp: string, body: string): string {
  return `${id}.${timestamp}.${body}`;
}

/** `v1,<base64>` for one message. */
export async function computeSignature(
  secret: string,
  id: string,
  timestamp: number | string,
  body: string,
): Promise<string> {
  const key = await hmacKey(secret, "sign");
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedContent(id, String(timestamp), body)),
  );
  return `v1,${toBase64(new Uint8Array(mac))}`;
}

export interface SignOptions {
  /** The message id. Defaults to `msg_` plus a random UUID. */
  id?: string;
  /** Unix seconds. Defaults to now. */
  timestamp?: number;
}

/** The three headers that authenticate `body`. */
export async function signMessage(
  secret: string,
  body: string,
  options: SignOptions = {},
): Promise<SignedHeaders> {
  const id = options.id ?? `msg_${crypto.randomUUID()}`;
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  return {
    [WEBHOOK_ID]: id,
    [WEBHOOK_TIMESTAMP]: String(timestamp),
    [WEBHOOK_SIGNATURE]: await computeSignature(secret, id, timestamp, body),
  };
}

function readHeader(source: HeaderSource, name: string): string | null {
  if (source instanceof Headers) return source.get(name);
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(source)) {
    if (key.toLowerCase() === wanted) return value ?? null;
  }
  return null;
}

export interface VerifyOptions {
  /** Unix seconds, for tests. Defaults to now. */
  now?: number;
  /** Defaults to {@link TIMESTAMP_TOLERANCE_SECONDS}. */
  toleranceSeconds?: number;
}

/**
 * Checks `body` against its headers.
 *
 * `secrets` can be a list so a receiver can accept the old and new secret
 * together while one is being rotated; any match passes.
 */
export async function verifyMessage(
  secrets: string | readonly string[],
  headers: HeaderSource,
  body: string,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  const id = readHeader(headers, WEBHOOK_ID);
  const rawTimestamp = readHeader(headers, WEBHOOK_TIMESTAMP);
  const signatureHeader = readHeader(headers, WEBHOOK_SIGNATURE);
  if (!id || !rawTimestamp || !signatureHeader) {
    return { ok: false, reason: "missing_headers" };
  }

  if (!/^\d{1,12}$/.test(rawTimestamp)) {
    return { ok: false, reason: "bad_timestamp" };
  }
  const timestamp = Number(rawTimestamp);
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? TIMESTAMP_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) {
    return { ok: false, reason: "expired" };
  }

  const candidates = signatureHeader
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => fromBase64(part.slice(3)))
    .filter((bytes): bytes is Uint8Array<ArrayBuffer> => bytes !== null);
  if (candidates.length === 0) return { ok: false, reason: "bad_signature" };

  const content = encoder.encode(signedContent(id, rawTimestamp, body));
  for (const secret of typeof secrets === "string" ? [secrets] : secrets) {
    const key = await hmacKey(secret, "verify");
    for (const candidate of candidates) {
      if (await crypto.subtle.verify("HMAC", key, candidate, content)) {
        return { ok: true, id, timestamp };
      }
    }
  }
  return { ok: false, reason: "bad_signature" };
}
