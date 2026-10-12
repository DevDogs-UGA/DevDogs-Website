import { signMessage } from "@devdogsuga/sdk/moderation";
import { endpointUrlProblem } from "./endpoint";
import { retryDelaySeconds } from "./queueMessage";
import { deriveClientSecret } from "./secrets";

/**
 * Sending one delivery.
 *
 * The queue consumer asks the Worker to attempt a delivery by id
 * (`/cron/moderation-deliveries/deliver`); this is what runs. It reads the row,
 * signs the frozen payload with the client's current secret, POSTs it, and
 * records the outcome. The store is injected so the policy (what counts as
 * delivered, when to give up on an endpoint, how long to wait) is tested
 * without a database or a network.
 */

export interface DeliveryTarget {
  id: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  payload: unknown;
  clientId: string | null;
  endpointUrl: string | null;
  secretVersion: number | null;
}

export interface DeliveryStore {
  load(id: string): Promise<DeliveryTarget | null>;
  markDelivered(id: string): Promise<void>;
  /** Counts an attempt that did not deliver and keeps the delivery pending. */
  markAttemptFailed(id: string, error: string): Promise<void>;
  /** Gives up: the delivery needs a person (a fix, then a resend). */
  markFailed(id: string, error: string): Promise<void>;
}

export type DeliveryOutcome =
  /** Nothing more to do: delivered now, or already settled. */
  | { ack: true; result: "delivered" | "skipped" | "failed" }
  /** Try again later; the queue redelivers after `retryAfterSeconds`. */
  | { ack: false; retryAfterSeconds: number; error: string };

export interface DeliveryDeps {
  store: DeliveryStore;
  signingKey: string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function deliveryMessageId(deliveryId: string): string {
  return `msg_${deliveryId}`;
}

export async function attemptDelivery(
  id: string,
  deps: DeliveryDeps,
): Promise<DeliveryOutcome> {
  const target = await deps.store.load(id);
  // A delivery that is gone, delivered or failed is not this attempt's to
  // revive: a resend resets it to pending first.
  if (target?.status !== "pending") {
    return { ack: true, result: "skipped" };
  }

  const nextAttempt = target.attempts + 1;
  const retry = async (error: string): Promise<DeliveryOutcome> => {
    await deps.store.markAttemptFailed(id, error);
    return {
      ack: false,
      retryAfterSeconds: retryDelaySeconds(nextAttempt),
      error,
    };
  };

  // Nothing about the destination will change by trying again: park it for a
  // person, who fixes the registration and presses resend.
  if (
    !target.clientId ||
    !target.endpointUrl ||
    target.secretVersion === null
  ) {
    await deps.store.markFailed(id, "The app's client has no endpoint URL");
    return { ack: true, result: "failed" };
  }
  const problem = endpointUrlProblem(target.endpointUrl);
  if (problem) {
    await deps.store.markFailed(id, `Endpoint refused: ${problem}`);
    return { ack: true, result: "failed" };
  }

  // A missing root key is the Worker's problem and may be fixed by a redeploy:
  // keep the delivery pending so the retries and the DLQ do their work.
  if (!deps.signingKey) {
    return retry("MODERATION_SIGNING_KEY is not configured on the platform");
  }

  const body = JSON.stringify(target.payload);
  const secret = await deriveClientSecret(
    deps.signingKey,
    target.clientId,
    target.secretVersion,
  );
  const headers = await signMessage(secret, body, {
    id: deliveryMessageId(target.id),
  });

  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(target.endpointUrl, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "user-agent": "DevDogs-Moderation/1",
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
    });
  } catch (error) {
    return retry(
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "Request failed",
    );
  }

  if (response.ok) {
    await deps.store.markDelivered(id);
    return { ack: true, result: "delivered" };
  }

  const snippet = (await response.text().catch(() => "")).slice(0, 200);
  return retry(`HTTP ${response.status}${snippet ? `: ${snippet}` : ""}`);
}
