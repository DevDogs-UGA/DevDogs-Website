import { unauthorized } from "next/navigation";
import { env } from "~/env";

/**
 * `Authorization: Bearer <CRON_SECRET>`, skipped when running locally: the same
 * rule every `/cron/*` route follows. The delivery routes are called by the
 * Worker's own queue consumer (`cloudflare/queue.ts`) with the same secret.
 */
export function authorizeCron(request: Request): void {
  if (
    process.env.DEPLOY_ENV &&
    process.env.DEPLOY_ENV !== "development" &&
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    unauthorized();
  }
}
