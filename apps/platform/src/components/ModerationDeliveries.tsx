"use client";

import Link from "next/link";
import { resendDelivery } from "~/server/actions/moderationDeliveries";
import FormButton from "~/components/FormButton";
import Badge from "~/ui/badge";

export interface DeliveryListEntry {
  id: string;
  type: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastError: string | null;
  appName?: string | null;
  reportId?: string | null;
}

const STATUS_VARIANT = {
  delivered: "success",
  pending: "warning",
  failed: "danger",
} as const;

const STATUS_HELP = {
  delivered: "The app has it.",
  pending: "Still being retried.",
  failed: "Retries are used up. Fix the app's endpoint, then resend.",
} as const;

/**
 * Signed decisions owed to apps outside this database, and how each is going.
 *
 * `failed` means the queue gave up (the dead-letter queue marked it and raised
 * an alert); resend puts it back as pending and queues it again. The receiver
 * ignores a message id it has already applied, so a resend can never apply a
 * decision twice.
 */
export default function ModerationDeliveries({
  deliveries,
  linkReports = false,
}: {
  deliveries: DeliveryListEntry[];
  /** On the dashboard each row names its report; on the report it would be circular. */
  linkReports?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {deliveries.map((delivery) => (
        <li
          key={delivery.id}
          className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-white/80">
                {delivery.type}
              </span>
              <Badge variant={STATUS_VARIANT[delivery.status]}>
                {delivery.status}
              </Badge>
              {delivery.appName && (
                <span className="text-xs text-mauve-400">
                  {delivery.appName}
                </span>
              )}
              {linkReports && delivery.reportId && (
                <Link
                  href={`/console/moderation/${delivery.reportId}`}
                  className="text-xs text-mauve-400 hover:text-white"
                >
                  Report &rarr;
                </Link>
              )}
            </div>
            <p className="text-xs text-mauve-400">
              {STATUS_HELP[delivery.status]} {delivery.attempts} attempt
              {delivery.attempts === 1 ? "" : "s"}.
            </p>
            {delivery.lastError && delivery.status !== "delivered" && (
              <p className="truncate font-mono text-xs text-rose-300">
                {delivery.lastError}
              </p>
            )}
          </div>
          {delivery.status !== "delivered" && (
            <form action={resendDelivery.bind(null, delivery.id)}>
              <FormButton theme="black" type="submit" className="text-sm">
                Resend
              </FormButton>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
