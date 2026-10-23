"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDownIcon, RowsIcon } from "@phosphor-icons/react/ssr";
import "~/components/Docs/docs.css";
import type { TOCItem } from "~/lib/toc";

interface Props {
  items: TOCItem[];
}

/**
 * The headings of one docs page, shared by both shapes the layout needs: the
 * sticky column beside the article, and the "On this page" fold above it on
 * narrow widths (`.docs-tocfold`, a real <details>). Depth reads as indent.
 */
function Entries({
  items,
  activeId,
  onNavigate,
}: {
  items: TOCItem[];
  activeId?: string;
  onNavigate?: () => void;
}) {
  return (
    <ul>
      {items.map((item) => {
        const id = item.url.slice(1);
        return (
          <li key={item.url}>
            <a
              href={item.url}
              onClick={onNavigate}
              data-depth={item.depth}
              aria-current={activeId === id ? "location" : undefined}
            >
              {item.title}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The sticky column, shown from 1100px up (CSS). {@link InlineTableOfContents}
 * takes over below it, so exactly one of the two is on screen at any width.
 */
export default function TableOfContents({ items }: Props) {
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const headingIds = items.map((item) => item.url.slice(1));

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    for (const id of headingIds) {
      const el = document.getElementById(id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="Table of contents" className="docs-toc">
      <p className="docs-toc-h">On this page</p>
      <Entries items={items} activeId={activeId} />
    </nav>
  );
}

/** The same contents folded up above the article, for widths with no room for the column. */
export function InlineTableOfContents({ items }: Props) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <details
      className="docs-tocfold"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <RowsIcon weight="bold" aria-hidden />
        On this page
        <CaretDownIcon weight="bold" aria-hidden className="docs-fold-caret" />
      </summary>
      <nav aria-label="On this page" className="docs-toc">
        <Entries items={items} onNavigate={() => setOpen(false)} />
      </nav>
    </details>
  );
}
