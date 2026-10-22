import { cn } from "~/lib/cn";

/** `.skel`: a static dithered stripe (no animation). Size it with width/height utilities. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("skel", className)}
      {...props}
    />
  );
}

export { Skeleton };
