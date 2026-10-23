import { Skeleton } from "~/ui/skeleton";

/**
 * What appears between the click and the meeting arriving.
 *
 * The `(site)` layout reads auth cookies, so every route under it is dynamic,
 * and a dynamic route is not prefetched at all unless it has a loading
 * boundary. Without this file, hovering a meeting link fetches nothing.
 *
 * It is shaped like the page it stands in for: head, then the rail beside the
 * body, so nothing jumps when the real content lands.
 */
export default function Loading() {
  return (
    <div aria-busy>
      <section className="pagehead" aria-hidden>
        <div className="wrap ev-fill">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-6 h-6 w-24" />
          <Skeleton className="mt-4 h-14 w-2/3" />
          <Skeleton className="mt-4 h-5 w-80 max-w-full" />
        </div>
      </section>
      <div className="wrap ev-fill" aria-hidden>
        <div className="ev-detail">
          <aside className="ev-rail">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-32 w-full" />
          </aside>
          <div className="ev-main">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-4 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}
