import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
  PropsWithChildren,
  ReactNode,
} from "react";

import { cn } from "~/lib/cn";
import type { EventCategory } from "~/lib/eventKind";

type CardProps = ComponentPropsWithoutRef<"div"> & {
  /** Rendered element. `a` and `button` get the cursor glow; pass `href`/`type` through. */
  as?: ElementType;
  href?: string;
  type?: "button" | "submit" | "reset";
  target?: string;
  rel?: string;
  /** Rings and shadows the card in an event category's hues. Omit for the neutral card. */
  kind?: EventCategory;
  /** The dithered glow behind the content (one per view, for the lead item). */
  glow?: boolean;
  /** Outline only, no block shadow. */
  flat?: boolean;
  size?: "default" | "lg";
  /** Lights up under the pointer; a non-link element also becomes focusable. */
  interactive?: boolean;
};

/**
 * `.card` (kit-spec section 3): the stepped, framed container. Never nest one
 * card inside another.
 */
function Card({
  as: As = "div",
  kind,
  glow,
  flat,
  size = "default",
  interactive,
  className,
  style,
  tabIndex,
  ...props
}: CardProps) {
  const native = As === "a" || As === "button";
  const glowStyle = glow
    ? ({
        "--glow": `url(/cosmic/img/glow-${kind ?? "brand"}.png)`,
      } as CSSProperties)
    : undefined;
  return (
    <As
      data-slot="card"
      data-kind={kind}
      tabIndex={tabIndex ?? (interactive && !native ? 0 : undefined)}
      className={cn(
        "card",
        kind && "k",
        glow && "glow",
        flat && "flat",
        size === "lg" && "lg",
        className,
      )}
      style={glowStyle ? { ...glowStyle, ...style } : style}
      {...props}
    />
  );
}

/** A flat red-ruled panel for destructive actions; not a framed card. */
function DangerZone({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="danger-zone"
      className={cn("danger", className)}
      {...props}
    />
  );
}

function Root({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    // scroll-mt clears the sticky TopNav when search jumps to #id.
    <Card
      as="section"
      {...props}
      className={cn("w-full scroll-mt-20", className)}
    >
      {children}
    </Card>
  );
}

/**
 * A card's title, and the `h2` under the page's `h1`.
 *
 * `description` exists because the alternative was passing a `<p>` as the
 * action child, which put a summary line into a flex row built for a title and
 * a button. The audit log did exactly that. Actions still go in `children`.
 */
function Header({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description?: ReactNode }>) {
  return (
    <div className="card-head flex-wrap justify-between">
      <h2 className="card-title font-[family-name:var(--font-ui)] [font-size:18px] leading-[1.3] font-bold tracking-normal [text-shadow:none]">
        {title}
      </h2>
      {children}
      {description && (
        <p className="m-0 w-full max-w-prose text-sm text-[var(--text-3)]">
          {description}
        </p>
      )}
    </div>
  );
}

function Content({ children }: PropsWithChildren) {
  return (
    <div className="divide-y divide-[var(--line)] *:py-6 [&>*:first-child]:pt-2 [&>*:last-child]:pb-2">
      {children}
    </div>
  );
}

export const ConsoleCard = { Root, Header, Content };
export { Card, DangerZone };
export type { CardProps };
export default Card;
