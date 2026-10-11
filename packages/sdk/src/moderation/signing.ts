/**
 * Standard Webhooks signing and verification (https://www.standardwebhooks.com/).
 *
 * Both directions of the moderation protocol use it: the platform signs the
 * events it delivers, and an app signs the reports it files. One signing
 * secret per OAuth client serves both.
 *
 * Only Web Crypto and `TextEncoder` are used, so the same code runs in a
 * Cloudflare Worker, a Supabase Edge Function (Deno) and Node. Signing stays
 * TypeScript-only: the Dart SDK carries the message models but no signer.
 */

/** The three headers a signed message carries. */
export const WEBHOOK_ID_HEADER = "webhook-id";
export const WEBHOOK_TIMESTAMP_HEADER = "webhook-timestamp";
export const WEBHOOK_SIGNATURE_HEADER = "webhook-signature";

/** A message older (or newer) than this many seconds is rejected. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

const SECRET_PREFIX = "whsec_";

export interface SignedHeaders {
  [WEBHOOK_ID_HEADER]: string;
  [WEBHOOK_TIMESTAMP_HEADER]: string;
  [WEBHOOK_SIGNATURE_HEADER]: string;
}

export class WebhookVerificationError extends Error {
  constructor(
    readonly reason:
      | "missing-headers"
      | "bad-timestamp"
      | "timestamp-too-old"
      | "timestamp-too-new"
      | "no-valid-signature",
    message: string,
  ) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The key bytes of a `whsec_<base64>` secret (a bare base64 key also works). */
function keyBytes(secret: string): Uint8Array<ArrayBuffer> {
  return base64ToBytes(
    secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
  );
}

/** A fresh signing secret: 24 random bytes, `whsec_` plus base64. */
export function generateSigningSecret(): string {
  return `${SECRET_PREFIX}${bytesToBase64(crypto.getRandomValues(new Uint8Array(24)))}`;
}

async function hmac(secret: string, content: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(content),
  );
  return bytesToBase64(new Uint8Array(signature));
}

/** The `webhook-signature` value for a message: `v1,<base64 HMAC>`. */
export async function signMessage(
  secret: string,
  messageId: string,
  timestampSeconds: number,
  body: string,
): Promise<string> {
  const signature = await hmac(
    secret,
    `${messageId}.${timestampSeconds}.${body}`,
  );
  return `v1,${signature}`;
}

/** The three headers to send with `body`. */
export async function signedHeaders(
  secret: string,
  messageId: string,
  body: string,
  options: { now?: Date } = {},
): Promise<SignedHeaders> {
  const timestamp = Math.floor((options.now ?? new Date()).getTime() / 1000);
  return {
    [WEBHOOK_ID_HEADER]: messageId,
    [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
    [WEBHOOK_SIGNATURE_HEADER]: await signMessage(
      secret,
      messageId,
      timestamp,
      body,
    ),
  };
}

/** Constant-time comparison of two equal-purpose strings. */
function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderSource, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    return Array.isArray(value) ? value.join(" ") : value;
  }
  return undefined;
}

export interface VerifyOptions {
  /** The current time; tests pass a fixed one. */
  now?: Date;
  /** Seconds either side of `now`. Defaults to {@link WEBHOOK_TOLERANCE_SECONDS}. */
  toleranceSeconds?: number;
}

/**
 * Checks a message's headers against its raw `body` and returns the message
 * id. Throws {@link WebhookVerificationError} for a missing header, a
 * timestamp outside the tolerance, or no matching `v1` signature.
 *
 * `body` must be the exact bytes received, as text: parsing and
 * re-serialising the JSON changes the signature.
 */
export async function verifyMessage(
  secret: string,
  headers: HeaderSource,
  body: string,
  options: VerifyOptions = {},
): Promise<string> {
  const id = readHeader(headers, WEBHOOK_ID_HEADER);
  const timestampHeader = readHeader(headers, WEBHOOK_TIMESTAMP_HEADER);
  const signatureHeader = readHeader(headers, WEBHOOK_SIGNATURE_HEADER);
  if (!id || !timestampHeader || !signatureHeader) {
    throw new WebhookVerificationError(
      "missing-headers",
      "Missing webhook-id, webhook-timestamp or webhook-signature.",
    );
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(timestamp)) {
    throw new WebhookVerificationError(
      "bad-timestamp",
      "The webhook-timestamp is not an integer number of seconds.",
    );
  }
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const tolerance = options.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  if (nowSeconds - timestamp > tolerance) {
    throw new WebhookVerificationError(
      "timestamp-too-old",
      "The message is older than the tolerance.",
    );
  }
  if (timestamp - nowSeconds > tolerance) {
    throw new WebhookVerificationError(
      "timestamp-too-new",
      "The message is dated in the future.",
    );
  }

  const expected = (await signMessage(secret, id, timestamp, body)).slice(3);
  // The header may carry several signatures, space-delimited, while a secret
  // rotates. Only `v1` is understood.
  for (const candidate of signatureHeader.split(" ")) {
    const [version, signature] = candidate.split(",", 2);
    if (version === "v1" && signature && safeEqual(signature, expected)) {
      return id;
    }
  }
  throw new WebhookVerificationError(
    "no-valid-signature",
    "No signature matched.",
  );
}
