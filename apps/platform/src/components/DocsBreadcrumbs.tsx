import { CaretRightIcon } from "@phosphor-icons/react/ssr";
import "~/components/Docs/docs.css";

/**
 * The trail above a docs page or folder: the project, then the folders it
 * sits under. Text rather than links: the sidebar beside it already navigates
 * to every one of these, and a row of near-identical links above the title
 * competes with it. `current` (the page's own title) closes the trail.
 */
export default function DocsBreadcrumbs({
  items,
  current,
}: {
  items: string[];
  current?: string;
}) {
  const trail = current ? [...items, current] : items;
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="docs-trail">
      <ol>
        {trail.map((crumb, i) => (
          <li
            key={i}
            aria-current={
              current && i === trail.length - 1 ? "page" : undefined
            }
          >
            {i > 0 && (
              <CaretRightIcon
                aria-hidden
                weight="bold"
                className="docs-crumb-sep"
              />
            )}
            <span>{crumb}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
