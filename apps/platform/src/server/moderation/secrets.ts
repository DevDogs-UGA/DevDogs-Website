import { secretFromBytes } from "@devdogsuga/sdk/moderation";

const encoder = new TextEncoder();

/**
 * The Standard Webhooks secret for one OAuth client.
 *
 * Derived, not stored: HMAC-SHA256 keyed with the Worker's
 * `MODERATION_SIGNING_KEY` over the client id and its `secretVersion`. The
 * database holds a version number and nothing that can sign, and rotating a
 * client's secret is incrementing the number. The same secret signs both
 * directions: the app's reports to the platform and the platform's deliveries
 * to the app.
 *
 * The context prefix keeps this key from ever being reused for another
 * derivation under the same root key.
 */
export async function deriveClientSecret(
  signingKey: string,
  clientId: string,
  secretVersion: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(
      `devdogs-moderation-client-secret:v1:${clientId}:${secretVersion}`,
    ),
  );
  return secretFromBytes(new Uint8Array(mac));
}
