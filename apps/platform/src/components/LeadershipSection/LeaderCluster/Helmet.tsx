import type { CSSProperties } from "react";
import type { LeaderProfile } from "./profile";
import Headshot from "./Headshot";

/** The visor colours the initials sit on when an officer has no photo. */
const VISORS = [
  "#6d4aa8",
  "#2f7f9e",
  "#9a5a3c",
  "#a8456a",
  "#3f8a5a",
  "#b0792a",
  "#4a5fb8",
  "#7a4f86",
] as const;

/** A stable colour per officer, so a monogram does not change between renders. */
function visorFor(slug: string): string {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return VISORS[hash % VISORS.length]!;
}

/**
 * The astronaut helmet (`a/helmet/helmet.png`, 40 cells) with the officer in the
 * visor. `--c` is the cell size: 3px in the cluster, 2px in the phone sheet.
 */
export default function Helmet({
  profile,
  sizes,
}: {
  profile: LeaderProfile;
  sizes: string;
}) {
  return (
    <span
      className="home-helm"
      style={{ "--ph": visorFor(profile.slug) } as CSSProperties}
    >
      <span className="home-visor">
        <Headshot name={profile.name} src={profile.imageSrc} sizes={sizes} />
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="home-helm-art" src="/cosmic/a/helmet/helmet.png" alt="" />
    </span>
  );
}
