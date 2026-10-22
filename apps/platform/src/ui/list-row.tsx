import "./list-row.css";

import type * as React from "react";
import Link from "next/link";
import { CaretRightIcon, CheckCircleIcon } from "@phosphor-icons/react/ssr";

import type { EventCategory } from "~/lib/eventKind";
import { cn } from "~/lib/cn";

interface RowBase {
  title: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

interface VerifiedRowProps extends RowBase {
  /** `.vrow`: a checklist item with a trailing status check. */
  variant: "verified";
  icon?: React.ReactNode;
  /** Quiet text under the title. */
  description?: React.ReactNode;
  /** Draw the trailing check. Defaults to true. */
  done?: boolean;
}

interface AccountRowProps extends RowBase {
  /** `.arow`: a linked account or connection, with its action pushed right. */
  variant: "account";
  icon?: React.ReactNode;
  description?: React.ReactNode;
  /** The trailing button, badge or text. */
  end?: React.ReactNode;
}

interface MeetingRowProps extends RowBase {
  /** `.mrow`: a meeting: date tile, title and chip, badges, trailing action. */
  variant: "meeting";
  /** A `DateTile`. */
  date: React.ReactNode;
  /** Where the title (and so the whole row) goes. */
  href?: string;
  kind?: EventCategory;
  /** A `Chip` beside the title. */
  chip?: React.ReactNode;
  /** The quiet line under the title: time and room. */
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  /** Trailing content; defaults to a caret when the row links. */
  end?: React.ReactNode;
  selected?: boolean;
  past?: boolean;
  /** Cancelled or skipped: dimmed, title struck through. */
  off?: boolean;
}

type ListRowProps = VerifiedRowProps | AccountRowProps | MeetingRowProps;

function Body({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <b>{title}</b>
      {description ? <small>{description}</small> : null}
      {children}
    </div>
  );
}

/** One list row in three shapes, chosen by `variant`. */
function ListRow(props: ListRowProps) {
  if (props.variant === "verified") {
    const {
      title,
      icon,
      description,
      done = true,
      className,
      children,
    } = props;
    return (
      <div data-slot="list-row" className={cn("vrow", className)}>
        {icon ? (
          <span className="ic" aria-hidden>
            {icon}
          </span>
        ) : null}
        <Body title={title} description={description}>
          {children}
        </Body>
        {done ? (
          <CheckCircleIcon
            weight="bold"
            className="st"
            aria-label="Done"
            role="img"
          />
        ) : null}
      </div>
    );
  }

  if (props.variant === "account") {
    const { title, icon, description, end, className, children } = props;
    return (
      <div data-slot="list-row" className={cn("arow", className)}>
        {icon ? (
          <span className="ic" aria-hidden>
            {icon}
          </span>
        ) : null}
        <Body title={title} description={description}>
          {children}
        </Body>
        {end ? <span className="end">{end}</span> : null}
      </div>
    );
  }

  const {
    title,
    date,
    href,
    kind,
    chip,
    meta,
    badges,
    end,
    selected,
    past,
    off,
    className,
    children,
  } = props;
  return (
    <div
      data-slot="list-row"
      data-kind={kind}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "mrow",
        selected && "sel",
        past && "past",
        off && "off",
        className,
      )}
    >
      {date}
      <div>
        <div className="mrow-head">
          {href ? (
            <Link className="t" href={href}>
              {title}
            </Link>
          ) : (
            <span className="t">{title}</span>
          )}
          {chip}
        </div>
        {meta ? <div className="mrow-meta">{meta}</div> : null}
        {children}
      </div>
      <div className="badges">{badges}</div>
      <div className="end">
        {end ?? (href ? <CaretRightIcon weight="bold" className="go" /> : null)}
      </div>
    </div>
  );
}

export { ListRow };
export type {
  ListRowProps,
  VerifiedRowProps,
  AccountRowProps,
  MeetingRowProps,
};
