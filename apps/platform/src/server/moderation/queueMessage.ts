const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The shape of a message on the delivery queue, and of the routes' bodies. */
export interface DeliveryMessage {
  deliveryId: string;
}

export function isDeliveryMessage(value: unknown): value is DeliveryMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "deliveryId" in value &&
    typeof value.deliveryId === "string" &&
    UUID.test(value.deliveryId)
  );
}

export async function readDeliveryId(request: Request): Promise<string | null> {
  const body: unknown = await request.json().catch(() => null);
  return isDeliveryMessage(body) ? body.deliveryId : null;
}

const FIRST_RETRY_SECONDS = 30;
const MAX_RETRY_SECONDS = 3600;

/** 30s, 1m, 2m, 4m, ... capped at an hour. `attempts` counts tries so far. */
export function retryDelaySeconds(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(FIRST_RETRY_SECONDS * 2 ** exponent, MAX_RETRY_SECONDS);
}
