import { Card } from "~/ui/card";
import { Skeleton } from "~/ui/skeleton";

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="w-full" aria-hidden="true">
      <div className="py-2">
        <Skeleton className="w-24" />
      </div>
      <div className="divide-y divide-[var(--line)]">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 py-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="w-64 max-w-full" />
            <Skeleton className="mt-2 h-9 w-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="w-full" aria-hidden="true">
      <div className="flex gap-4 border-b border-[var(--line)] py-3">
        <Skeleton className="w-20" />
        <Skeleton className="w-32" />
        <Skeleton className="w-24" />
        <div className="flex-1" />
        <Skeleton className="w-16" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 border-b border-[var(--line)] py-4">
          <Skeleton className="w-20" />
          <Skeleton className="w-40" />
          <Skeleton className="w-24" />
          <div className="flex-1" />
          <Skeleton className="w-16" />
        </div>
      ))}
    </Card>
  );
}
