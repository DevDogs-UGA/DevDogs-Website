import Link from "next/link";
import { cn } from "~/lib/cn";

/** Signed out: the kit's ghost `Sign in`. */
export default function SignInButton({ className }: { className?: string }) {
  return (
    <Link
      href="/auth"
      prefetch={false}
      className={cn("btn ghost sm", className)}
    >
      Sign in
    </Link>
  );
}

/** Signed out: the primary call to action, in the kit's `.btn-shadow` wrapper. */
export function JoinButton() {
  return (
    <span className="btn-shadow">
      <a href="https://devdogsuga.org/join" className="btn primary sm">
        Join DevDogs
      </a>
    </span>
  );
}
