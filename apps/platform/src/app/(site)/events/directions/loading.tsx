import { Skeleton } from "~/ui/skeleton";

/**
 * Between the click and the page: the events page's shape, since that is what
 * the directions drawer opens over.
 */
export default function Loading() {
  return (
    <div className="wrap" aria-busy>
      <div className="flex flex-col gap-4 py-16">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="mt-8 h-48 w-full" />
      </div>
    </div>
  );
}
