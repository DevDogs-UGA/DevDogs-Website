import type * as React from "react";

import { cn } from "~/lib/cn";

interface DefinitionListProps extends React.ComponentProps<"dl"> {
  /** Term and detail pairs; or pass your own `dt`/`dd` as children. */
  items?: { term: React.ReactNode; detail: React.ReactNode; key?: string }[];
}

/** `.kv`: record details as a 140px term column and a detail column; stacks on phones. */
function DefinitionList({
  items,
  className,
  children,
  ...props
}: DefinitionListProps) {
  return (
    <dl data-slot="definition-list" className={cn("kv", className)} {...props}>
      {items?.map((item, i) => (
        <DefinitionPair
          key={item.key ?? i}
          term={item.term}
          detail={item.detail}
        />
      ))}
      {children}
    </dl>
  );
}

function DefinitionPair({
  term,
  detail,
}: {
  term: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{detail}</dd>
    </>
  );
}

export { DefinitionList, DefinitionPair };
