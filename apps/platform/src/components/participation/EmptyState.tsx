import type { ReactNode } from "react";
import { EmptyState as KitEmptyState } from "~/ui/empty-state";

/**
 * Nothing here, and why.
 *
 * Always takes a reason rather than only a title. Most empty states on this
 * platform are temporal: no meetings scheduled *yet*, no stars *until a
 * meeting is attended*. And "No meetings" alone reads as a fault in the page
 * rather than as the current state of the club.
 */
export default function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <KitEmptyState title={title} description={body} headingLevel={3}>
      {action}
    </KitEmptyState>
  );
}
