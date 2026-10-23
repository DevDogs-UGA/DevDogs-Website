import Avatar from "./Avatar";
import type { getProfilePageData } from "~/server/loaders/console";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

/**
 * The profile photo. The photo itself is the control: pressing it opens the
 * file picker, then the crop dialog. `.set-photo` (settings.css) sizes it.
 */
export default function AvatarField({ id, profile }: ProfileData) {
  return <Avatar editable userId={id} preferredName={profile.preferredName} />;
}
