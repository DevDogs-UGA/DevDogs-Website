import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Card } from "~/ui/card";
import { cn } from "~/lib/cn";

interface EmptyStateProps extends Omit<
  ComponentPropsWithoutRef<"div">,
  "title"
> {
  title: ReactNode;
  description?: ReactNode;
  /** The mascot pose; `false` for none. */
  image?: string | false;
  /** The heading level, so the state fits under the page's outline. */
  headingLevel?: 2 | 3 | 4;
  /** An action, such as a button, under the text. */
  children?: ReactNode;
}

/** `.card.flat.empty`: the empty list or error, with the mascot peeking. */
export function EmptyState({
  title,
  description,
  image = "/cosmic/a/mascot-peek.png",
  headingLevel = 3,
  children,
  className,
  ...props
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Card
      flat
      data-slot="empty-state"
      className={cn("empty", className)}
      {...props}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" />
      ) : null}
      <Heading className="h3" style={{ margin: "10px 0 4px" }}>
        {title}
      </Heading>
      {description ? (
        <p className="small muted" style={{ margin: 0 }}>
          {description}
        </p>
      ) : null}
      {children ? (
        <div className="mt-4 flex justify-center gap-3">{children}</div>
      ) : null}
    </Card>
  );
}

export default EmptyState;
