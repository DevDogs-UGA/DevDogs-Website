import "./community.css";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "~/ui/avatar";
import { Card } from "~/ui/card";
import { profilePath } from "~/lib/profilePath";
import type { PublicProfileSummary } from "~/server/loaders/publicProfiles";
import type { LeaderProfile } from "~/components/LeadershipSection/LeaderCluster/profile";

/** "Jack Harrington" -> "JH"; "@ada" -> "A". */
function initials(name: string) {
  return (
    name
      .replace(/^@/, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

interface PersonProps {
  /** Shown name: a display name, or `@handle` when the member hides theirs. */
  name: string;
  avatarSrc: string | null;
  /** Line under the name: an officer's titles, or a member's bio. */
  detail: string | null;
  /** Null renders an unlinked card (an officer without a public profile). */
  href: string | null;
}

function PersonCard({ name, avatarSrc, detail, href }: PersonProps) {
  const body = (
    <>
      <Avatar size="md">
        {/* A missing object 404s and Radix falls back to the monogram, the
            same way the leadership headshots do. */}
        {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="cm-mid">
        <p className="cm-name">{name}</p>
        {detail && <p className="cm-detail">{detail}</p>}
      </div>
    </>
  );

  if (!href)
    return (
      <Card className="cm-person" flat>
        {body}
      </Card>
    );
  return (
    <Card as={Link} href={href} className="cm-person">
      {body}
    </Card>
  );
}

interface Props {
  officers: LeaderProfile[];
  /** Officer user id -> handle, for the officers who have a public profile. */
  officerHandles: ReadonlyMap<string, string>;
  members: PublicProfileSummary[];
}

/**
 * The public directory: the board first, then every other member who chose to
 * be listed.
 *
 * Officers are always shown, because the board is public on the homepage, but
 * they link to a profile only when they have a public one. They are removed
 * from the member list by handle, so nobody appears twice.
 */
export default function CommunityDirectory({
  officers,
  officerHandles,
  members,
}: Props) {
  const officerHandleSet = new Set(officerHandles.values());
  const others = members.filter((m) => !officerHandleSet.has(m.handle));

  return (
    <div className="wrap cm-wrap">
      {officers.length > 0 && (
        <section aria-labelledby="community-leadership">
          <div className="cm-head">
            <h2 id="community-leadership">Leadership</h2>
          </div>
          <ul className="cm-grid">
            {officers.map((officer) => {
              const handle = officerHandles.get(officer.slug);
              return (
                <li key={officer.slug}>
                  <PersonCard
                    name={officer.name}
                    avatarSrc={officer.imageSrc}
                    detail={officer.titles.join(", ")}
                    href={handle ? profilePath(handle) : null}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="community-members">
        <div className="cm-head">
          <h2 id="community-members">Members</h2>
          {others.length > 0 && (
            <div className="cm-count">
              <b>{others.length}</b> community{" "}
              {others.length === 1 ? "profile" : "profiles"}
            </div>
          )}
        </div>
        {others.length === 0 ? (
          <Card flat>
            <p className="cm-empty">
              No members have made their profile public yet. Verify your account
              and turn on a public profile from your account page to be the
              first.
            </p>
          </Card>
        ) : (
          <ul className="cm-grid">
            {others.map((member) => (
              <li key={member.handle}>
                <PersonCard
                  name={member.displayName ?? `@${member.handle}`}
                  avatarSrc={member.avatarUrl}
                  detail={member.bio}
                  href={profilePath(member.handle)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
