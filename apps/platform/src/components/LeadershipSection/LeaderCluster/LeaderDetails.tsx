import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import LinkButton from "~/ui/link-button";
import type { LeaderAcademicProgramType, LeaderProfile } from "./profile";

function FieldLine({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <p>
      <b>
        {label}
        {values.length > 1 ? "s" : ""}:
      </b>{" "}
      {values.join(", ")}
    </p>
  );
}

const ACADEMIC_FIELDS: {
  type: LeaderAcademicProgramType;
  label: string;
}[] = [
  { type: "major", label: "Major" },
  { type: "masters_program", label: "Master's program" },
  { type: "doctoral_program", label: "Doctoral program" },
  { type: "graduate_program", label: "Graduate program" },
  { type: "minor", label: "Minor" },
  { type: "certificate", label: "Certificate" },
  { type: "professional_program", label: "Professional program" },
];

/**
 * The body an officer's popup and bottom sheet share: academics, bio, links.
 * Name and meta line stay with the host, because the popup sits next to a tile
 * that already shows the name while the sheet has to repeat it.
 */
export default function LeaderDetails({ profile }: { profile: LeaderProfile }) {
  return (
    <div className="home-ldet">
      {ACADEMIC_FIELDS.map(({ type, label }) => (
        <FieldLine
          key={type}
          label={label}
          values={[
            ...new Set(
              profile.programs
                .filter((program) => program.type === type)
                .map((program) => program.name),
            ),
          ]}
        />
      ))}
      {profile.bio && <p className="home-lbio">{profile.bio}</p>}
      {profile.links.length > 0 && (
        <div className="home-llinks">
          {profile.links.map((link) => (
            <LinkButton
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              size="sm"
            >
              <ArrowUpRightIcon weight="bold" />
              {link.title}
            </LinkButton>
          ))}
        </div>
      )}
    </div>
  );
}
