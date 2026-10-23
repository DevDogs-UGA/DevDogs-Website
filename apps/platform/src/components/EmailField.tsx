import { GoogleLogoIcon } from "@phosphor-icons/react/ssr";
import type { getProfilePageData } from "~/server/loaders/console";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

/**
 * The sign-in account. It is read-only and never public (the profile's own
 * switches cover only GitHub, Discord and LinkedIn), so there is nothing to
 * toggle and nothing to unlink.
 */
export default function EmailField({ email }: ProfileData) {
  return (
    <div className="set-acc">
      <span className="ic" aria-hidden>
        <GoogleLogoIcon />
      </span>
      <div>
        <b>UGA MyID email</b>
        <span className="small muted">
          {email ? `${email} · Google` : "Google"}
        </span>
        <p className="why">Your sign-in. Can&rsquo;t be unlinked.</p>
      </div>
    </div>
  );
}
